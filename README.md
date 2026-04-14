# The Safety Tax

Interactive visualization of hidden LLM guard overhead in AI security architectures.

Watch an inference request flow through security checkpoints — from a minimal single-guard setup to a full regulated financial services stack with 36 controls. Gates are colored by type (LLM guard, classifier, static analysis, deterministic, crypto) and sized by latency.

## What it shows

Six reference architectures — four security models plus a before/after agentic pipeline optimization:

| Architecture | Checks/step | Overhead/step | Source |
|-------------|-------------|---------------|--------|
| Drift Baseline | 1 | 290ms | Empirical measurement |
| Meta LlamaFirewall | 4 | 734ms | arXiv:2505.03574 |
| Microsoft Azure Foundry | 9 | 1,142ms | Azure AI Content Safety |
| FINOS Regulated FSI | 22 | 1,039ms | FINOS AI Reference Architecture |
| AAP Log Triage (Agentic) | 5 | 1,350ms | RH AI Quickstart |
| AAP Log Triage (Drift) | 6 | 618ms | drift hybrid (projected) |

The AAP Log Triage models show agentic pipeline overhead: a 4-stage LangGraph pipeline where classify and route are replaceable with deterministic rules, and summarize scope is reducible via pre-digestion. Projected ~50% call reduction — probe data pending.

Toggle between 1-step, 3-step, and 5-step (iterative) pipelines to see how overhead compounds.

## Key findings from drift

- **47.8% false positive rate** — Llama Guard 3-1B flagged 107/224 legitimate SE outputs as unsafe
- **96.4% compound pipeline rejection** — 3-step pipeline, at least one step blocked
- **1.3% after category override** — disabling S6/S8 is a configuration fix, not compute
- **5-19x production multiplier** — real architectures require 15-290 checks vs. 3 measured
- **Guard confidence is a coin flip** — 0% of outputs at >=0.90 confidence, mean entropy 0.94 bits
- **CodeShield vs Llama Guard** — static analysis found 0 CWEs in 144 code outputs; all 114 guard flags confirmed false positives

## Run

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

No build step, no dependencies. Just static HTML/CSS/JS with ES6 modules.

## Data sources

- Security model definitions derived from drift's `security_models/` YAML files
- Latency data from vendor benchmarks and drift empirical measurements

## License

Apache 2.0
