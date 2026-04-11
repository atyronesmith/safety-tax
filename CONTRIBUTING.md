# Contributing

## Setup

```bash
git clone https://github.com/atyronesmith/safety-tax.git
cd safety-tax
python3 -m http.server 8000
```

No build step, no package manager, no dependencies.

## Adding a security model

1. Add the model definition to `src/models.js` in the `MODELS` array
2. Each model has an array of `checkpoints`, each with a `phase` and `checks` array
3. Each check needs: `name`, `type` (one of: `llm`, `classifier`, `static_analysis`, `deterministic`, `crypto`), `latency_ms`, and `desc`
4. The corresponding YAML should also be added to `drift/security_models/`

## Architecture

- `src/models.js` — security model data
- `src/pipeline.js` — packet animation state machine
- `src/renderer.js` — Canvas 2D drawing
- `src/main.js` — event wiring and animation loop
- `index.html` — layout and styles (inline CSS)

Zero dependencies. Pure static files.
