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

// Layout constants (fractions of canvas width/height)
const LEFT_PAD = 0.04
const RIGHT_PAD = 0.96
const LANE_Y = 0.50
const GATE_W = 8
const GATE_H = 40

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

/** Compute gate positions across the full pipeline (all steps). */
export function layoutGates(pipeline, w, h) {
  const { checksPerStep, steps } = pipeline
  const gates = []

  // Separate checks into input-side and output-side per step
  const inputChecks = checksPerStep.filter(c => c.phase === 'input')
  const outputChecks = checksPerStep.filter(c => c.phase !== 'input')

  // Total slots: per step = inputChecks + 1 LLM block + outputChecks
  const slotsPerStep = inputChecks.length + 1 + outputChecks.length
  const totalSlots = slotsPerStep * steps
  const usableW = (RIGHT_PAD - LEFT_PAD) * w
  const spacing = usableW / (totalSlots + 1)
  const startX = LEFT_PAD * w
  const y = LANE_Y * h

  let slotIdx = 0
  for (let s = 0; s < steps; s++) {
    // Input checks
    for (const c of inputChecks) {
      slotIdx++
      gates.push({
        x: startX + slotIdx * spacing,
        y, check: c, step: s, isLLM: false,
        width: GATE_W, height: GATE_H,
      })
    }
    // LLM block
    slotIdx++
    gates.push({
      x: startX + slotIdx * spacing,
      y,
      check: { name: steps > 1 ? `LLM ${s + 1}` : 'LLM', type: 'productive', latency_ms: 0, desc: 'Productive inference' },
      step: s, isLLM: true,
      width: GATE_W * 2.5, height: GATE_H * 1.3,
    })
    // Output checks
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

/** Spawn a new packet at the left edge. */
export function spawnPacket(pipeline, w, h) {
  pipeline.packets.push({
    x: LEFT_PAD * w - 20,
    y: LANE_Y * h,
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

    if (Math.abs(dx) < p.speed * dt + 1) {
      // Arrived at gate
      p.x = gate.x
      if (gate.isLLM) {
        // Productive LLM — no wait, just pass through
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
      p.x += Math.sign(dx) * p.speed * dt
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

    // Already waiting at a gate — just freeze the timer
    if (p.state === 'waiting') {
      p.waitFrames = 0
      break
    }

    // Moving — snap to the next non-LLM gate
    while (p.targetGateIdx < pipeline.gates.length && pipeline.gates[p.targetGateIdx].isLLM) {
      p.targetGateIdx++
    }

    if (p.targetGateIdx < pipeline.gates.length) {
      const gate = pipeline.gates[p.targetGateIdx]
      p.x = gate.x
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'waiting'
      p.waitFrames = 0
      p.accLatency += gate.check.latency_ms
      p.accTokensIn += gate.check.tokens_in || 0
      p.accTokensOut += gate.check.tokens_out || 0
      p.currentCheckName = gate.check.name
    } else {
      p.x = pipeline.gates[pipeline.gates.length - 1].x + 50
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

    // If waiting, finish the wait and advance
    if (p.state === 'waiting') {
      p.waitFrames = 0
      p.state = 'moving'
      p.targetGateIdx++
    }

    // Skip LLM blocks
    while (p.targetGateIdx < pipeline.gates.length && pipeline.gates[p.targetGateIdx].isLLM) {
      p.targetGateIdx++
    }

    // Snap to the next gate
    if (p.targetGateIdx < pipeline.gates.length) {
      const gate = pipeline.gates[p.targetGateIdx]
      p.x = gate.x
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'waiting'
      p.waitFrames = 0
      p.accLatency += gate.check.latency_ms
      p.accTokensIn += gate.check.tokens_in || 0
      p.accTokensOut += gate.check.tokens_out || 0
      p.currentCheckName = gate.check.name
    } else {
      // Past all gates — done
      p.x = pipeline.gates[pipeline.gates.length - 1].x + 50
      p.trail = [{ x: p.x, y: p.y }]
      p.state = 'done'
      pipeline.completedPackets++
    }

    break  // only step the first active packet
  }
}
