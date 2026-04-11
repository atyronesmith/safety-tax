/**
 * Safety Tax Visualizer — entry point.
 *
 * Animates LLM inference requests flowing through security
 * checkpoint architectures. Four models auto-cycle or can
 * be selected manually.
 */

import { MODELS, flattenChecks, CHECKPOINT_TYPES } from './models.js'
import { createPipeline, layoutGates, spawnPacket, tickPackets } from './pipeline.js'
import {
  initRenderer, resize, getSize, clear,
  drawLane, drawStepLabels, drawGates, drawPacket,
  drawLatencyCounter, drawHeader, drawLegend, drawDoneMessage,
} from './renderer.js'

// --- State ---
let currentModelIdx = 0
let pipeline = null
let animId = null
let autoCycle = true
let autoCycleTimer = null
let pipelineSteps = 1
let lastTime = 0
let done = false

// --- DOM ---
const canvas = document.getElementById('viz')
const modelBtns = document.getElementById('model-btns')
const stepsSelect = document.getElementById('steps-toggle')
const replayBtn = document.getElementById('replay-btn')
const autoToggle = document.getElementById('auto-toggle')
const statsPanel = document.getElementById('stats')

// --- Init ---
initRenderer(canvas)
buildModelButtons()
startModel(0)

stepsSelect.addEventListener('change', () => {
  pipelineSteps = +stepsSelect.value
  startModel(currentModelIdx)
})

replayBtn.addEventListener('click', () => startModel(currentModelIdx))

autoToggle.addEventListener('change', () => {
  autoCycle = autoToggle.checked
  if (autoCycle) scheduleNext()
  else clearTimeout(autoCycleTimer)
})

window.addEventListener('resize', () => {
  if (pipeline) {
    const { w, h } = resize()
    layoutGates(pipeline, w, h)
    // Reposition packets to lane Y
    for (const p of pipeline.packets) p.y = h * 0.50
  }
})

// --- Model buttons ---

function buildModelButtons() {
  for (let i = 0; i < MODELS.length; i++) {
    const btn = document.createElement('button')
    btn.textContent = MODELS[i].name
    btn.addEventListener('click', () => {
      autoCycle = false
      autoToggle.checked = false
      clearTimeout(autoCycleTimer)
      startModel(i)
    })
    modelBtns.appendChild(btn)
  }
}

function highlightButton(idx) {
  const btns = modelBtns.querySelectorAll('button')
  btns.forEach((b, i) => b.classList.toggle('active', i === idx))
}

// --- Stats panel ---

function updateStats() {
  if (!pipeline) return
  const checks = flattenChecks(pipeline.model)
  const byType = {}
  for (const c of checks) {
    if (!byType[c.type]) byType[c.type] = { count: 0, latency: 0 }
    byType[c.type].count += pipelineSteps
    byType[c.type].latency += c.latency_ms * pipelineSteps
  }

  const nChecks = checks.length * pipelineSteps
  const totalMs = checks.reduce((s, c) => s + c.latency_ms, 0) * pipelineSteps

  let html = `<div class="stat-header">${pipeline.model.name}</div>`
  html += `<div class="stat-row"><span>Total checks</span><span class="stat-val">${nChecks}</span></div>`
  html += `<div class="stat-row"><span>Safety overhead</span><span class="stat-val">${totalMs.toFixed(0)}ms</span></div>`
  html += '<div class="stat-divider"></div>'

  for (const [type, info] of Object.entries(CHECKPOINT_TYPES)) {
    const d = byType[type]
    if (!d) continue
    const avgMs = (d.latency / d.count).toFixed(0)
    html += `<div class="stat-row">
      <span><span class="stat-dot" style="background:${info.color}"></span>${info.label}</span>
      <span class="stat-val">${d.count} &times; ${avgMs}ms</span>
    </div>`
  }

  html += '<div class="stat-divider"></div>'
  // Cost at 1M runs/mo, $3/GPU-hr for LLM checks
  const llmMs = Object.entries(byType)
    .filter(([t]) => t === 'llm')
    .reduce((s, [, d]) => s + d.latency, 0)
  const costPerRun = llmMs / 1000 / 3600 * 3
  html += `<div class="stat-row"><span>LLM guard cost @ 1M/mo</span><span class="stat-val">$${(costPerRun * 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>`

  statsPanel.innerHTML = html
}

// --- Animation ---

function startModel(idx) {
  currentModelIdx = idx
  highlightButton(idx)
  done = false

  if (animId) cancelAnimationFrame(animId)

  const { w, h } = resize()
  pipeline = createPipeline(MODELS[idx], pipelineSteps)
  layoutGates(pipeline, w, h)
  spawnPacket(pipeline, w, h)
  updateStats()

  lastTime = performance.now()
  animId = requestAnimationFrame(tick)
}

function tick(now) {
  const dtRaw = now - lastTime
  lastTime = now
  const dt = Math.min(dtRaw / 16, 3)

  const active = tickPackets(pipeline, dt)

  // --- Draw ---
  clear()
  drawHeader(pipeline)
  drawLane(pipeline)
  drawStepLabels(pipeline)

  let activeGate = -1
  for (const p of pipeline.packets) {
    if (p.state === 'waiting') activeGate = p.targetGateIdx
  }
  drawGates(pipeline, activeGate)

  for (const p of pipeline.packets) {
    drawPacket(p)
    drawLatencyCounter(p)
  }

  drawLegend()

  if (active) {
    animId = requestAnimationFrame(tick)
  } else if (!done) {
    done = true
    drawDoneMessage(pipeline)
    if (autoCycle) scheduleNext()
  }
}

function scheduleNext() {
  clearTimeout(autoCycleTimer)
  autoCycleTimer = setTimeout(() => {
    startModel((currentModelIdx + 1) % MODELS.length)
  }, 3500)
}
