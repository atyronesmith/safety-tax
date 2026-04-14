/**
 * Canvas renderer — draws the pipeline, gates, packets, and stats.
 */

import { CHECKPOINT_TYPES } from './models.js'

const C = {
  bg:         '#0f172a',
  lane:       '#1e293b',
  laneStroke: '#334155',
  glow:       '#38bdf8',
  core:       '#ffffff',
  prod:       '#3b82f6',
  text:       '#e2e8f0',
  dim:        '#94a3b8',
  bright:     '#f8fafc',
  sep:        '#475569',
}

let canvas, ctx

export function initRenderer(el) {
  canvas = el
  ctx = canvas.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
}

export function resize() {
  const r = canvas.parentElement.getBoundingClientRect()
  const w = r.width
  const h = 400
  const d = devicePixelRatio || 1
  canvas.width = w * d
  canvas.height = h * d
  canvas.style.height = h + 'px'
  ctx.setTransform(d, 0, 0, d, 0, 0)
  return { w, h }
}

export function getSize() {
  const d = devicePixelRatio || 1
  return { w: canvas.width / d, h: canvas.height / d }
}

export function clear() {
  const { w, h } = getSize()
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, w, h)
}

export function drawLane(pipeline) {
  const { w, h } = getSize()
  const y = h * 0.50
  ctx.strokeStyle = C.laneStroke
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(w * 0.02, y)
  ctx.lineTo(w * 0.98, y)
  ctx.stroke()
  ctx.setLineDash([])
}

export function drawStepLabels(pipeline) {
  const { w, h } = getSize()
  if (!pipeline.gates.length || pipeline.steps <= 1) return

  ctx.font = '11px "DM Sans", system-ui, sans-serif'
  ctx.textAlign = 'center'

  for (let s = 0; s < pipeline.steps; s++) {
    const stepGates = pipeline.gates.filter(g => g.step === s)
    if (!stepGates.length) continue
    const minX = Math.min(...stepGates.map(g => g.x))
    const maxX = Math.max(...stepGates.map(g => g.x))
    const cx = (minX + maxX) / 2

    ctx.fillStyle = C.dim
    ctx.fillText(`Step ${s + 1}`, cx, h * 0.16)

    // Bracket
    ctx.strokeStyle = C.sep
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(minX - 8, h * 0.19)
    ctx.lineTo(minX - 8, h * 0.22)
    ctx.lineTo(maxX + 8, h * 0.22)
    ctx.lineTo(maxX + 8, h * 0.19)
    ctx.stroke()
  }
}

export function drawGates(pipeline, activeGateIdx) {
  for (let i = 0; i < pipeline.gates.length; i++) {
    const g = pipeline.gates[i]
    const active = i === activeGateIdx
    const past = i < activeGateIdx

    if (g.isLLM) {
      drawLLMBlock(g, active, past)
      continue
    }

    const info = CHECKPOINT_TYPES[g.check.type] || CHECKPOINT_TYPES.deterministic
    const color = info.color
    const gw = g.width
    const gh = g.height

    // Gate body
    ctx.fillStyle = past ? color + '30' : (active ? color + 'dd' : color + '70')
    ctx.strokeStyle = active ? color : color + '80'
    ctx.lineWidth = active ? 2.5 : 1
    roundRect(ctx, g.x - gw / 2, g.y - gh / 2, gw, gh, 3)
    ctx.fill()
    ctx.stroke()

    // Active glow
    if (active) {
      ctx.shadowColor = color
      ctx.shadowBlur = 14
      roundRect(ctx, g.x - gw / 2, g.y - gh / 2, gw, gh, 3)
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Name (rotated above)
    ctx.save()
    ctx.translate(g.x, g.y - gh / 2 - 8)
    ctx.rotate(-Math.PI / 6)
    ctx.fillStyle = past ? C.dim : C.text
    ctx.font = '12px "DM Sans", system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(g.check.name, 0, 0)
    ctx.restore()

    // Latency below
    ctx.fillStyle = C.dim
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.fillText(fmtMs(g.check.latency_ms), g.x, g.y + gh / 2 + 16)
  }
}

function drawLLMBlock(g, active, past) {
  const bw = g.width * 2
  const bh = g.height
  ctx.fillStyle = past ? C.prod + '35' : C.prod + '90'
  ctx.strokeStyle = C.prod
  ctx.lineWidth = active ? 2.5 : 1.5
  roundRect(ctx, g.x - bw / 2, g.y - bh / 2, bw, bh, 6)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = C.bright
  ctx.font = 'bold 10px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillText(g.check.name, g.x, g.y + 4)
}

export function drawPacket(packet) {
  // Trail
  for (let i = 0; i < packet.trail.length; i++) {
    const t = packet.trail[i]
    const a = Math.round((i / packet.trail.length) * 100)
    ctx.fillStyle = `rgba(56, 189, 248, ${a / 255})`
    ctx.beginPath()
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Outer glow
  ctx.shadowColor = C.glow
  ctx.shadowBlur = 18
  ctx.fillStyle = C.glow
  ctx.beginPath()
  ctx.arc(packet.x, packet.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Core
  ctx.fillStyle = C.core
  ctx.beginPath()
  ctx.arc(packet.x, packet.y, 3.5, 0, Math.PI * 2)
  ctx.fill()
}

export function drawLatencyCounter(packet) {
  if (packet.state === 'done') return

  const totalTokens = packet.accTokensIn + packet.accTokensOut

  // All text below the lane (below per-gate latency labels)
  ctx.textAlign = 'center'
  let yOff = packet.y + 58

  // Accumulated latency
  ctx.fillStyle = C.bright
  ctx.font = 'bold 13px "JetBrains Mono", monospace'
  ctx.fillText(`${packet.accLatency.toFixed(0)}ms`, packet.x, yOff)
  yOff += 16

  // Accumulated tokens
  if (totalTokens > 0) {
    ctx.fillStyle = '#f59e0b'
    ctx.font = 'bold 11px "JetBrains Mono", monospace'
    ctx.fillText(`${fmtTokens(totalTokens)} tokens`, packet.x, yOff)
    yOff += 16
  }

  // Current check name
  if (packet.state === 'waiting' && packet.currentCheckName) {
    ctx.fillStyle = C.glow
    ctx.font = 'bold 11px "DM Sans", system-ui, sans-serif'
    ctx.fillText(packet.currentCheckName, packet.x, yOff)
  }
}

export function drawHeader(pipeline) {
  const { w } = getSize()

  ctx.fillStyle = C.bright
  ctx.font = 'bold 18px "DM Sans", system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(pipeline.model.name, w * 0.04, 30)

  ctx.fillStyle = C.dim
  ctx.font = '12px "DM Sans", system-ui, sans-serif'
  ctx.fillText(pipeline.model.description, w * 0.04, 48)

  // Stats top-right
  ctx.textAlign = 'right'
  ctx.font = '12px "JetBrains Mono", monospace'
  ctx.fillStyle = C.dim
  ctx.fillText(`${pipeline.totalChecks} checks  |  ${pipeline.totalLatency.toFixed(0)}ms  |  ${fmtTokens(pipeline.totalTokens)} tokens`, w * 0.96, 30)

  if (pipeline.steps > 1) {
    ctx.fillText(`${pipeline.steps}-step pipeline`, w * 0.96, 46)
  }
}

export function drawLegend() {
  const { w, h } = getSize()
  let x = w * 0.04
  const y = h - 14

  ctx.font = '10px "DM Sans", system-ui, sans-serif'
  ctx.textAlign = 'left'

  // Productive
  ctx.fillStyle = C.prod
  ctx.fillRect(x, y - 6, 10, 10)
  ctx.fillStyle = C.text
  ctx.fillText('Productive LLM', x + 14, y + 3)
  x += 110

  for (const [, info] of Object.entries(CHECKPOINT_TYPES)) {
    ctx.fillStyle = info.color
    ctx.fillRect(x, y - 6, 10, 10)
    ctx.fillStyle = C.text
    ctx.fillText(info.label, x + 14, y + 3)
    x += ctx.measureText(info.label).width + 28
  }
}

export function drawDoneMessage(pipeline) {
  const { w, h } = getSize()
  const p = pipeline.packets[0]
  if (!p) return

  const totalTokens = p.accTokensIn + p.accTokensOut
  const y = h * 0.50 + 58

  ctx.font = 'bold 14px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'

  // Latency line
  ctx.fillStyle = C.glow
  ctx.fillText(
    `Safety overhead: ${p.accLatency.toFixed(0)}ms latency  \u00b7  ${pipeline.totalChecks} checks`,
    w / 2, y
  )

  // Token line
  if (totalTokens > 0) {
    ctx.fillStyle = '#f59e0b'
    ctx.font = 'bold 13px "JetBrains Mono", monospace'
    ctx.fillText(
      `${fmtTokens(totalTokens)} hidden tokens  (${fmtTokens(p.accTokensIn)} in + ${fmtTokens(p.accTokensOut)} out)`,
      w / 2, y + 20
    )
  }
}

function fmtMs(ms) {
  return `${ms}ms`
}

function fmtTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
