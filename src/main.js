/**
 * Safety Tax Visualizer — entry point.
 *
 * Animates LLM inference requests flowing through security
 * checkpoint architectures. Four models auto-cycle or can
 * be selected manually.
 */

import { MODELS, flattenChecks, CHECKPOINT_TYPES, PRODUCTIVE_TOKENS } from './models.js'
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

function fmtTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function updateStats() {
  if (!pipeline) return
  const checks = flattenChecks(pipeline.model)
  const byType = {}
  for (const c of checks) {
    if (!byType[c.type]) byType[c.type] = { count: 0, latency: 0, tokens_in: 0, tokens_out: 0 }
    byType[c.type].count += pipelineSteps
    byType[c.type].latency += c.latency_ms * pipelineSteps
    byType[c.type].tokens_in += (c.tokens_in || 0) * pipelineSteps
    byType[c.type].tokens_out += (c.tokens_out || 0) * pipelineSteps
  }

  const nChecks = checks.length * pipelineSteps
  const totalMs = checks.reduce((s, c) => s + c.latency_ms, 0) * pipelineSteps
  const safetyTokensIn = checks.reduce((s, c) => s + (c.tokens_in || 0), 0) * pipelineSteps
  const safetyTokensOut = checks.reduce((s, c) => s + (c.tokens_out || 0), 0) * pipelineSteps
  const safetyTokensTotal = safetyTokensIn + safetyTokensOut
  const prodTokensTotal = (PRODUCTIVE_TOKENS.input + PRODUCTIVE_TOKENS.output) * pipelineSteps
  const tokenRatio = prodTokensTotal > 0 ? safetyTokensTotal / prodTokensTotal : 0

  let html = `<div class="stat-header">${pipeline.model.name}</div>`
  html += `<div class="stat-row"><span>Total checks</span><span class="stat-val">${nChecks}</span></div>`
  html += `<div class="stat-row"><span>Latency overhead</span><span class="stat-val">${totalMs.toFixed(0)}ms</span></div>`
  html += '<div class="stat-divider"></div>'

  // Token section
  html += '<div class="stat-section">Token Overhead</div>'
  html += `<div class="stat-row"><span>Productive tokens</span><span class="stat-val">${fmtTokens(prodTokensTotal)}</span></div>`
  html += `<div class="stat-row"><span>Safety tokens</span><span class="stat-val token-warn">${fmtTokens(safetyTokensTotal)}</span></div>`
  html += `<div class="stat-row"><span>Safety / productive</span><span class="stat-val token-warn">${(tokenRatio * 100).toFixed(0)}%</span></div>`

  // Token bar (productive vs safety)
  const totalBar = prodTokensTotal + safetyTokensTotal
  const prodPct = totalBar > 0 ? (prodTokensTotal / totalBar) * 100 : 100
  const safePct = 100 - prodPct
  html += `<div class="token-bar">
    <div class="token-bar-prod" style="width:${prodPct.toFixed(1)}%" title="Productive: ${fmtTokens(prodTokensTotal)}"></div>
    <div class="token-bar-safety" style="width:${safePct.toFixed(1)}%" title="Safety: ${fmtTokens(safetyTokensTotal)}"></div>
  </div>`
  html += `<div class="token-bar-labels">
    <span>Productive</span><span>Safety</span>
  </div>`

  html += '<div class="stat-divider"></div>'

  // Per-type breakdown
  for (const [type, info] of Object.entries(CHECKPOINT_TYPES)) {
    const d = byType[type]
    if (!d) continue
    const avgMs = (d.latency / d.count).toFixed(0)
    const toks = d.tokens_in + d.tokens_out
    html += `<div class="stat-row">
      <span><span class="stat-dot" style="background:${info.color}"></span>${info.label}</span>
      <span class="stat-val">${d.count} &times; ${avgMs}ms${toks > 0 ? ` (${fmtTokens(toks)} tok)` : ''}</span>
    </div>`
  }

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
