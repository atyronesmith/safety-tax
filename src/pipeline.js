/**
 * Pipeline animation engine.
 *
 * Manages packets flowing through security checkpoints.
 * Each packet is a glowing dot that travels left-to-right,
 * pausing at each gate proportional to its latency.
 */

import { CHECKPOINT_TYPES, flattenChecks } from './models.js'

// Animation-time scale: how fast gates process (higher = faster animation)
const SPEED_SCALE = 0.1125

// Layout constants
const LEFT_PAD = 0.04
const RIGHT_PAD = 0.96
const LANE_Y = 0.50
const GATE_W = 8
const GATE_H = 40

// Multi-row layout
const HEADER_H = 70
const ROW_HEIGHT = 130
const FOOTER_H = 40

/** Compute required canvas height for a given number of pipeline steps. */
export function computeCanvasHeight(steps) {
  if (steps <= 1) return 400
  return HEADER_H + steps * ROW_HEIGHT + FOOTER_H
}

function rowCenterY(row, steps, h) {
  if (steps <= 1) return LANE_Y * h
  const bandH = (h - HEADER_H - FOOTER_H) / steps
  return HEADER_H + bandH * row + bandH / 2
}

/** Pipeline state for one security model. */
export function createPipeline(model, steps) {
  const checksPerStep = flattenChecks(model)
  return {
    model,
    steps,
    checksPerStep,
    gates: [],
    packets: [],
    totalChecks: checksPerStep.length * steps,
    totalLatency: checksPerStep.reduce((s, c) => s + c.latency_ms, 0) * steps,
    totalTokens: checksPerStep.reduce((s, c) => s + (c.tokens_in || 0) + (c.tokens_out || 0), 0) * steps,
    completedPackets: 0,
  }
}

/** Compute gate positions across the full pipeline (all steps).
 *  For multi-step pipelines, each step gets its own row. */
export function layoutGates(pipeline, w, h) {
  const { checksPerStep, steps } = pipeline
  const gates = []

  const inputChecks = checksPerStep.filter(c => c.phase === 'input')
  const outputChecks = checksPerStep.filter(c => c.phase !== 'input')

  // Per-row slot count (same for every step)
  const slotsPerStep = inputChecks.length + 1 + outputChecks.length
  const usableW = (RIGHT_PAD - LEFT_PAD) * w
  const spacing = usableW / (slotsPerStep + 1)
  const startX = LEFT_PAD * w

  for (let s = 0; s < steps; s++) {
    const y = rowCenterY(s, steps, h)
    let slotIdx = 0

    for (const c of inputChecks) {
      slotIdx++
      gates.push({
        x: startX + slotIdx * spacing,
        y, check: c, step: s, isLLM: false,
        width: GATE_W, height: GATE_H,
      })
    }

    slotIdx++
    gates.push({
      x: startX + slotIdx * spacing,
      y,
      check: { name: steps > 1 ? `LLM ${s + 1}` : 'LLM', type: 'productive', latency_ms: 0, desc: 'Productive inference' },
      step: s, isLLM: true,
      width: GATE_W * 2.5, height: GATE_H * 1.3,
    })

    for (const c of outputChecks) {
      slotIdx++
      gates.push({
        x: startX + slotIdx * spacing,
        y, check: c, step: s, isLLM: false,
        width: GATE_W, height: GATE_H,
      })
    }
  }

  pipeline.gates = gates
  return gates
}

/** Spawn a new packet at the left edge of the first row. */
export function spawnPacket(pipeline, w, h) {
  const y0 = pipeline.gates.length ? pipeline.gates[0].y : rowCenterY(0, pipeline.steps, h)
  pipeline.packets.push({
    x: LEFT_PAD * w - 20,
    y: y0,
    targetGateIdx: 0,
    waitFrames: 0,
    state: 'moving',    // moving, waiting, done
    trail: [],
    accLatency: 0,
    accTokensIn: 0,
    accTokensOut: 0,
    currentCheckName: '',
    speed: 3,
  })
}

/** Advance all packets one frame. Returns true if any packet is still active. */
export function tickPackets(pipeline, dt) {
  let anyActive = false

  for (const p of pipeline.packets) {
    if (p.state === 'done') continue
    anyActive = true

    if (p.state === 'waiting') {
      p.waitFrames -= dt
      if (p.waitFrames <= 0) {
        p.state = 'moving'
        p.targetGateIdx++
      }
      continue
    }

    // Past all gates — slide to right edge and finish
    if (p.targetGateIdx >= pipeline.gates.length) {
      p.x += p.speed * dt * 1.5
      const rightEdge = pipeline.gates[pipeline.gates.length - 1].x + 50
      if (p.x > rightEdge) {
        p.state = 'done'
        pipeline.completedPackets++
      }
      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > 30) p.trail.shift()
      continue
    }

    const gate = pipeline.gates[p.targetGateIdx]
    const dx = gate.x - p.x
    const dy = gate.y - p.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Speed up inter-row transitions so they don't feel sluggish
    const interRow = Math.abs(dy) > 5
    const spd = interRow ? p.speed * 4 : p.speed

    if (dist < spd * dt + 1) {
      // Arrived at gate
      p.x = gate.x
      p.y = gate.y
      if (gate.isLLM) {
        p.targetGateIdx++
      } else {
        p.state = 'waiting'
        p.waitFrames = gate.check.latency_ms * SPEED_SCALE
        p.accLatency += gate.check.latency_ms
        p.accTokensIn += gate.check.tokens_in || 0
        p.accTokensOut += gate.check.tokens_out || 0
        p.currentCheckName = gate.check.name
      }
    } else {
      p.x += (dx / dist) * spd * dt
      p.y += (dy / dist) * spd * dt
    }

    p.trail.push({ x: p.x, y: p.y })
    if (p.trail.length > 30) p.trail.shift()
  }

  return anyActive
}

/** Snap the first active packet to its current target gate (for pause). */
export function snapToCurrentGate(pipeline) {
  for (const p of pipeline.packets) {
    if (p.state === 'done') continue

    if (p.state === 'waiting') {
      p.waitFrames = 0
      break
    }

    while (p.targetGateIdx < pipeline.gates.length && pipeline.gates[p.targetGateIdx].isLLM) {
      p.targetGateIdx++
    }

    if (p.targetGateIdx < pipeline.gates.length) {
      const gate = pipeline.gates[p.targetGateIdx]
      p.x = gate.x
      p.y = gate.y
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'waiting'
      p.waitFrames = 0
      p.accLatency += gate.check.latency_ms
      p.accTokensIn += gate.check.tokens_in || 0
      p.accTokensOut += gate.check.tokens_out || 0
      p.currentCheckName = gate.check.name
    } else {
      const last = pipeline.gates[pipeline.gates.length - 1]
      p.x = last.x + 50
      p.y = last.y
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'done'
      pipeline.completedPackets++
    }
    break
  }
}

/** Jump the first active packet to the next gate instantly. */
export function stepToNextGate(pipeline) {
  for (const p of pipeline.packets) {
    if (p.state === 'done') continue

    if (p.state === 'waiting') {
      p.waitFrames = 0
      p.state = 'moving'
      p.targetGateIdx++
    }

    while (p.targetGateIdx < pipeline.gates.length && pipeline.gates[p.targetGateIdx].isLLM) {
      p.targetGateIdx++
    }

    if (p.targetGateIdx < pipeline.gates.length) {
      const gate = pipeline.gates[p.targetGateIdx]
      p.x = gate.x
      p.y = gate.y
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'waiting'
      p.waitFrames = 0
      p.accLatency += gate.check.latency_ms
      p.accTokensIn += gate.check.tokens_in || 0
      p.accTokensOut += gate.check.tokens_out || 0
      p.currentCheckName = gate.check.name
    } else {
      const last = pipeline.gates[pipeline.gates.length - 1]
      p.x = last.x + 50
      p.y = last.y
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'done'
      pipeline.completedPackets++
    }

    break
  }
}
