/**
 * Security model definitions — derived from drift's security_models/*.yaml
 *
 * Each model defines checkpoints that a request passes through at each
 * pipeline step. Checkpoint types determine color and animation speed.
 *
 * Token estimates for LLM-based checks:
 *   Each LLM guard receives the productive output as input (~1500 tokens
 *   for a typical code review) plus its own system prompt / safety taxonomy.
 *   Output is short for classifiers ("safe" / "unsafe\nS6" = ~10 tokens),
 *   longer for CoT auditors (~300 tokens of reasoning).
 *
 *   Non-LLM checks (classifiers, static analysis, deterministic, crypto)
 *   consume zero LLM tokens — they run fixed models or code paths.
 *
 * Baseline productive LLM call for reference:
 *   Input: ~1000 tokens (system prompt + user code)
 *   Output: ~1500 tokens (code review / generated code)
 */

/** Typical productive output size fed to each guard as input context. */
export const PRODUCTIVE_TOKENS = { input: 1000, output: 1500 }

export const CHECKPOINT_TYPES = {
  llm:             { color: '#ef4444', label: 'LLM Guard',       speed: 0.3 },
  classifier:      { color: '#f59e0b', label: 'Classifier',      speed: 0.7 },
  static_analysis: { color: '#8b5cf6', label: 'Static Analysis', speed: 0.6 },
  deterministic:   { color: '#22c55e', label: 'Deterministic',    speed: 0.95 },
  crypto:          { color: '#06b6d4', label: 'Crypto',           speed: 0.9 },
}

export const MODELS = [
  {
    id: 'drift_baseline',
    name: 'Drift Baseline',
    description: 'Minimal: single output guard per step',
    source: 'Empirical measurement',
    checkpoints: [
      { phase: 'input',       checks: [] },
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        // Llama Guard: ingests output (1500) + safety taxonomy prompt (300), emits ~10
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 1800, tokens_out: 10, desc: 'Llama Guard 3-1B' },
      ]},
    ],
  },
  {
    id: 'llamafirewall',
    name: 'Meta LlamaFirewall',
    description: 'PromptGuard + AlignmentCheck + CodeShield',
    source: 'arXiv:2505.03574',
    checkpoints: [
      { phase: 'input',       checks: [
        // BERT classifier — no LLM tokens
        { name: 'PromptGuard 2', type: 'classifier', latency_ms: 19, tokens_in: 0, tokens_out: 0, desc: 'DeBERTa jailbreak classifier (86M)' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        // AlignmentCheck: 70B model, CoT reasoning. Ingests output + audit prompt, generates reasoning trace
        { name: 'AlignmentCheck', type: 'llm', latency_ms: 500, tokens_in: 2000, tokens_out: 300, desc: 'CoT reasoning auditor (Llama 3.3 70B)' },
        // Llama Guard: output + taxonomy
        { name: 'Content Filter', type: 'llm', latency_ms: 165, tokens_in: 1800, tokens_out: 10, desc: 'Llama Guard 3-1B' },
        // Static analysis — no LLM tokens
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'Static analysis, 50+ CWEs' },
      ]},
    ],
  },
  {
    id: 'microsoft_foundry',
    name: 'Microsoft Azure Foundry',
    description: '4 intervention points, MCP gateway, inter-agent trust',
    source: 'Azure AI Content Safety',
    checkpoints: [
      { phase: 'input',       checks: [
        // Input-side content filter: scans user prompt (~1000 tokens) + system prompt (200)
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 1200, tokens_out: 10, desc: 'Violence, hate, sexual, self-harm' },
        { name: 'Prompt Shield', type: 'classifier', latency_ms: 19, tokens_in: 0, tokens_out: 0, desc: 'Jailbreak/injection detection' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        // Output content filter: scans LLM output (1500) + taxonomy (300)
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 1800, tokens_out: 10, desc: 'Output content safety' },
        // Groundedness: output (1500) + source context (500) + prompt (200)
        { name: 'Groundedness', type: 'llm', latency_ms: 200, tokens_in: 2200, tokens_out: 20, desc: 'Hallucination detection' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'Code static analysis' },
      ]},
      { phase: 'tool_call',   checks: [
        { name: 'Param Validation', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'MCP schema validation' },
        { name: 'JIT Permissions', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Just-in-time scoping' },
      ]},
      { phase: 'tool_response', checks: [
        // Tool response filter: scans tool output (~500) + taxonomy (300)
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 800, tokens_out: 10, desc: 'Tool response safety' },
      ]},
      { phase: 'inter_agent', checks: [
        { name: 'Identity', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Ed25519/SPIFFE identity' },
        { name: 'Policy', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'Policy engine' },
      ]},
    ],
  },
  {
    id: 'finos_regulated',
    name: 'FINOS Regulated FSI',
    description: '36 controls, 11 layers, 43 threats, SOX/SR 11-7 compliance',
    source: 'FINOS AI Reference Architecture (Apr 2026 threat model)',
    checkpoints: [
      { phase: 'input',       checks: [
        { name: 'Sanitization', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Input validation' },
        // AI Gateway: scans user prompt (1000) + policy prompt (300)
        { name: 'AI Gateway', type: 'llm', latency_ms: 290, tokens_in: 1300, tokens_out: 10, desc: 'Gateway content filter' },
        { name: 'Prompt Shield', type: 'classifier', latency_ms: 19, tokens_in: 0, tokens_out: 0, desc: 'Jailbreak detection' },
        { name: 'Policy (ABAC)', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'Policy-as-code' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        { name: 'Sanitization', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'PII/secret scrub' },
        // Output content filter: output (1500) + taxonomy (300)
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 1800, tokens_out: 10, desc: 'Content safety' },
        { name: 'DLP Scan', type: 'classifier', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'MNPI leakage scan' },
        { name: 'Approval Gate', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'Non-bypassable workflow' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'Code static analysis' },
      ]},
      { phase: 'tool_call',   checks: [
        { name: 'Param Validation', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'MCP schema validation' },
        { name: 'Domain Whitelist', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Domain whitelisting' },
        { name: 'JIT Permissions', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'JIT scoping' },
      ]},
      { phase: 'tool_response', checks: [
        // Tool response filter: tool output (~500) + taxonomy (300)
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 800, tokens_out: 10, desc: 'Tool response safety' },
        { name: 'RAG Validation', type: 'classifier', latency_ms: 10, tokens_in: 0, tokens_out: 0, desc: 'RAG doc validation' },
        { name: 'Data Minimization', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Data minimization' },
      ]},
      { phase: 'inter_agent', checks: [
        { name: 'Agent Card', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Crypto agent card' },
        { name: 'Identity', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'SPIFFE/mTLS' },
        { name: 'Collusion Detect', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Anomaly detection' },
      ]},
      { phase: 'memory',      checks: [
        { name: 'Context Guard', type: 'classifier', latency_ms: 10, tokens_in: 0, tokens_out: 0, desc: 'Context window injection scan' },
        { name: 'Memory Isolation', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Cross-session isolation (C34)' },
        { name: 'Knowledge Valid.', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Source provenance (C18)' },
      ]},
      { phase: 'evaluation',  checks: [
        { name: 'Feedback Valid.', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Multi-source trust scoring (C27)' },
        { name: 'Resource Quota', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'Per-request quota (C22)' },
      ]},
      { phase: 'audit',       checks: [
        { name: 'Audit Log', type: 'deterministic', latency_ms: 2, tokens_in: 0, tokens_out: 0, desc: 'SOX/SR 11-7 trail' },
        { name: 'Decision Bind', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'Signed decision record' },
        { name: 'Anomaly Detect', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Behavioral anomaly' },
      ]},
    ],
  },
]

/** Flatten all checks for a model into a single ordered list with phase labels. */
export function flattenChecks(model) {
  const out = []
  for (const cp of model.checkpoints) {
    for (const c of cp.checks) {
      out.push({ ...c, phase: cp.phase })
    }
  }
  return out
}

/** Sum total latency for a model (one pipeline step). */
export function totalLatency(model) {
  return flattenChecks(model).reduce((s, c) => s + c.latency_ms, 0)
}

/** Sum total tokens for a model (one pipeline step). */
export function totalTokens(model) {
  const checks = flattenChecks(model)
  return {
    input: checks.reduce((s, c) => s + (c.tokens_in || 0), 0),
    output: checks.reduce((s, c) => s + (c.tokens_out || 0), 0),
  }
}

/** Count checks by type. */
export function countByType(model) {
  const counts = {}
  for (const c of flattenChecks(model)) {
    counts[c.type] = (counts[c.type] || 0) + 1
  }
  return counts
}
