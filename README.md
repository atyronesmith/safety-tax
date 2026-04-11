# The Safety Tax

Interactive visualization of hidden LLM guard overhead in AI security architectures.

Watch an inference request flow through security checkpoints — from a minimal single-guard setup to a full regulated financial services stack with 36 controls. Gates are colored by type (LLM guard, classifier, static analysis, deterministic, crypto) and sized by latency.

## What it shows

Four reference security architectures, derived from [drift](https://github.com/atyronesmith/drift) empirical measurements:

| Architecture | Checks/step | Overhead/step | Source |
|-------------|-------------|---------------|--------|
| Drift Baseline | 1 | 290ms | Empirical measurement |
| Meta LlamaFirewall | 4 | 734ms | arXiv:2505.03574 |
| Microsoft Azure Foundry | 9 | 1,142ms | Azure AI Content Safety |
| FINOS Regulated FSI | 22 | 1,039ms | FINOS AI Reference Architecture |

Toggle between 1-step, 3-step, and 5-step (iterative) pipelines to see how overhead compounds.

## Key findings from drift

- **47.8% false positive rate** — Llama Guard 3-1B flagged 107/224 legitimate SE outputs as unsafe
- **96.4% compound pipeline rejection** — 3-step pipeline, at least one step blocked
- **1.3% after category override** — disabling S6/S8 is a configuration fix, not compute
- **5-19x production multiplier** — real architectures require 15-290 checks vs. 3 measured

## Run

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

No build step, no dependencies. Just static HTML/CSS/JS with ES6 modules.

## Data sources

- Security model definitions from [`drift/security_models/`](https://github.com/atyronesmith/drift/tree/main/security_models)
- Latency data from vendor benchmarks and drift empirical measurements
- See [docs/ai-safety-overhead.md](https://github.com/atyronesmith/drift/blob/main/docs/ai-safety-overhead.md) for full analysis

## License

Apache 2.0
