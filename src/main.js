/**
 * Safety Tax Visualizer — entry point.
 *
 * Animates LLM inference requests flowing through security
 * checkpoint architectures. Four models auto-cycle or can
 * be selected manually.
 */

import { MODELS, flattenChecks, CHECKPOINT_TYPES, PRODUCTIVE_TOKENS } from './models.js'
import { createPipeline, layoutGates, spawnPacket, tickPackets, snapToCurrentGate, stepToNextGate } from './pipeline.js'
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
let paused = false

// --- DOM ---
const canvas = document.getElementById('viz')
const modelBtns = document.getElementById('model-btns')
const stepsSelect = document.getElementById('steps-toggle')
const replayBtn = document.getElementById('replay-btn')
const autoToggle = document.getElementById('auto-toggle')
const pauseBtn = document.getElementById('pause-btn')
const stepBtn = document.getElementById('step-btn')
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

pauseBtn.addEventListener('click', togglePause)

stepBtn.addEventListener('click', stepForward)

autoToggle.addEventListener('change', () => {
  autoCycle = autoToggle.checked
  if (autoCycle) scheduleNext()
  else clearTimeout(autoCycleTimer)
})

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
  if (e.code === 'Space') { e.preventDefault(); togglePause() }
  if (e.code === 'ArrowRight') { e.preventDefault(); stepForward() }
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

  const p = pipeline.packets[0]
  const passedIdx = p ? getPassedGateIndex(p) : -1

  const byType = {}
  let nChecks = 0
  let accLatency = 0
  let accTokensIn = 0
  let accTokensOut = 0

  for (let i = 0; i <= passedIdx && i < pipeline.gates.length; i++) {
    const gate = pipeline.gates[i]
    if (gate.isLLM) continue
    const c = gate.check
    nChecks++
    accLatency += c.latency_ms
    accTokensIn += c.tokens_in || 0
    accTokensOut += c.tokens_out || 0
    const t = c.type
    if (!byType[t]) byType[t] = { count: 0, tokens_in: 0, tokens_out: 0 }
    byType[t].count++
    byType[t].tokens_in += c.tokens_in || 0
    byType[t].tokens_out += c.tokens_out || 0
  }

  const allChecks = flattenChecks(pipeline.model)
  const totalChecks = allChecks.length * pipelineSteps
  const totalMs = allChecks.reduce((s, c) => s + c.latency_ms, 0) * pipelineSteps
  const totalSafetyTokens = allChecks.reduce((s, c) => s + (c.tokens_in || 0) + (c.tokens_out || 0), 0) * pipelineSteps

  const safetyTokensTotal = accTokensIn + accTokensOut
  const prodTokensTotal = (PRODUCTIVE_TOKENS.input + PRODUCTIVE_TOKENS.output) * pipelineSteps
  const tokenRatio = prodTokensTotal > 0 ? safetyTokensTotal / prodTokensTotal : 0

  const currentCheck = (p && p.state === 'waiting' && passedIdx >= 0 && passedIdx < pipeline.gates.length)
    ? pipeline.gates[passedIdx].check : null

  // All type rows — always present to prevent layout shifts
  const allByType = {}
  for (const c of allChecks) {
    if (!allByType[c.type]) allByType[c.type] = 0
    allByType[c.type] += pipelineSteps
  }

  // Current check — always show the row with fixed height, just vary content
  let currentName = '\u2014'
  let currentColor = '#64748b'
  let currentMs = ''
  let currentDesc = '\u00a0'
  if (currentCheck && !done) {
    const info = CHECKPOINT_TYPES[currentCheck.type]
    currentName = currentCheck.name
    currentColor = info ? info.color : '#e2e8f0'
    currentMs = `${currentCheck.latency_ms}ms`
    currentDesc = currentCheck.desc || '\u00a0'
  }

  const totalBar = prodTokensTotal + safetyTokensTotal
  const prodPct = totalBar > 0 ? (prodTokensTotal / totalBar) * 100 : 100
  const safePct = 100 - prodPct

  let typeRows = ''
  for (const [type, info] of Object.entries(CHECKPOINT_TYPES)) {
    if (!allByType[type]) continue
    const cur = byType[type] || { count: 0, tokens_in: 0, tokens_out: 0 }
    const curToks = cur.tokens_in + cur.tokens_out
    typeRows += `<div class="stat-row">
      <span><span class="stat-dot" style="background:${info.color}"></span>${info.label}</span>
      <span class="stat-val">${cur.count}/${allByType[type]}${curToks > 0 ? ` (${fmtTokens(curToks)} tok)` : ''}</span>
    </div>`
  }

  statsPanel.innerHTML =
    `<div class="stat-header">${pipeline.model.name}</div>` +
    `<div class="stat-row" style="margin-bottom:6px">` +
      `<span style="color:${currentColor}; font-weight:700">${currentName}</span>` +
      `<span class="stat-val">${currentMs}</span>` +
    `</div>` +
    `<div style="font-size:10px; color:#64748b; margin-bottom:8px; min-height:15px">${currentDesc}</div>` +
    `<div class="stat-divider"></div>` +
    `<div class="stat-row"><span>Checks passed</span><span class="stat-val">${nChecks} / ${totalChecks}</span></div>` +
    `<div class="stat-row"><span>Latency overhead</span><span class="stat-val">${accLatency.toFixed(0)} / ${totalMs.toFixed(0)}ms</span></div>` +
    `<div class="stat-divider"></div>` +
    `<div class="stat-section">Token Overhead</div>` +
    `<div class="stat-row"><span>Productive tokens</span><span class="stat-val">${fmtTokens(prodTokensTotal)}</span></div>` +
    `<div class="stat-row"><span>Safety tokens</span><span class="stat-val token-warn">${fmtTokens(safetyTokensTotal)} / ${fmtTokens(totalSafetyTokens)}</span></div>` +
    `<div class="stat-row"><span>Safety / productive</span><span class="stat-val token-warn">${(tokenRatio * 100).toFixed(0)}%</span></div>` +
    `<div class="token-bar">` +
      `<div class="token-bar-prod" style="width:${prodPct.toFixed(1)}%"></div>` +
      `<div class="token-bar-safety" style="width:${safePct.toFixed(1)}%"></div>` +
    `</div>` +
    `<div class="token-bar-labels"><span>Productive</span><span>Safety</span></div>` +
    `<div class="stat-divider"></div>` +
    typeRows
}

/** Get the index of the gate the packet is currently at or has most recently passed. */
function getPassedGateIndex(p) {
  if (p.state === 'done') return Infinity
  if (p.state === 'waiting') return p.targetGateIdx
  // Moving — hasn't reached targetGateIdx yet, so last passed is one before
  return p.targetGateIdx - 1
}

// --- Pause / Step ---

function togglePause() {
  if (done) return
  paused = !paused
  pauseBtn.textContent = paused ? 'Play' : 'Pause'
  if (paused) {
    clearTimeout(autoCycleTimer)
    if (animId) { cancelAnimationFrame(animId); animId = null }
    // Snap packet to the nearest gate so it lands on a checkpoint
    snapToCurrentGate(pipeline)
    drawFrame()
  } else {
    lastTime = performance.now()
    animId = requestAnimationFrame(tick)
  }
}

function stepForward() {
  if (!pipeline || done) return
  if (!paused) {
    paused = true
    pauseBtn.textContent = 'Play'
  }
  stepToNextGate(pipeline)
  // Check if done
  const p = pipeline.packets[0]
  if (p && p.state === 'done') {
    done = true
    if (autoCycle) scheduleNext()
  }
  drawFrame()
}

function drawFrame() {
  if (!pipeline) return
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
  if (done) drawDoneMessage(pipeline)
  updateStats()
}

// --- Animation ---

function startModel(idx) {
  currentModelIdx = idx
  highlightButton(idx)
  done = false
  paused = false
  pauseBtn.textContent = 'Pause'

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
  if (paused) return

  const dtRaw = now - lastTime
  lastTime = now
  const dt = Math.min(dtRaw / 16, 3)

  const active = tickPackets(pipeline, dt)

  drawFrame()

  if (active) {
    animId = requestAnimationFrame(tick)
  } else if (!done) {
    done = true
    drawFrame()
    if (autoCycle) scheduleNext()
  }
}

function scheduleNext() {
  clearTimeout(autoCycleTimer)
  autoCycleTimer = setTimeout(() => {
    startModel((currentModelIdx + 1) % MODELS.length)
  }, 3500)
}
