# Agents Guide

## Project overview

Standalone visualization of LLM security guard overhead. Animates inference requests flowing through checkpoint architectures to show the hidden cost of safety infrastructure.

## Tech stack

- Vanilla JavaScript (ES6 modules)
- Canvas 2D for all rendering
- Zero dependencies — serve with any HTTP server

## Key files

| File | Purpose |
|------|---------|
| `src/models.js` | Security model definitions (4 architectures with checkpoint data) |
| `src/pipeline.js` | Animation state machine — packet movement, gate waiting, timing |
| `src/renderer.js` | Canvas drawing — gates, packets, trails, labels, legend |
| `src/main.js` | Entry point — DOM events, animation loop, auto-cycling |
| `index.html` | Layout, styles (inline), info cards with key metrics |

## Data source

Checkpoint latency values come from drift's `security_models/*.yaml` files and vendor benchmarks. The four models are: Drift Baseline, Meta LlamaFirewall, Microsoft Azure Foundry, and FINOS Regulated FSI.

## How the animation works

1. A pipeline is created for the selected security model with N steps
2. Gate positions are computed across the canvas (input checks -> LLM block -> output checks, repeated per step)
3. A packet spawns at the left edge and moves right
4. At each gate, the packet pauses proportional to the check's latency (scaled by `SPEED_SCALE`)
5. Gate color indicates type: red=LLM (~290ms), yellow=classifier (~19ms), green=deterministic (<1ms), purple=static analysis (~50ms), cyan=crypto (~1ms)
6. A running latency counter above the packet accumulates total safety overhead
7. After completing all gates, the model auto-cycles to the next (if enabled)

## Conventions

- No frameworks, no build tools, no package managers
- All rendering via Canvas 2D API
- Colors defined as constants in renderer.js
- Model data is self-contained in models.js (no external data loading)
