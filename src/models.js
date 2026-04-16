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
        { name: 'Sanitize (C1)', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C1: Input validation and sanitization' },
        { name: 'AI Gateway (C2)', type: 'llm', latency_ms: 290, tokens_in: 1300, tokens_out: 10, desc: 'C2: AI gateway content filtering' },
        { name: 'Prompt Shield', type: 'classifier', latency_ms: 19, tokens_in: 0, tokens_out: 0, desc: 'Jailbreak/injection detection at gateway' },
        { name: 'Policy (C13)', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'C13: Policy-as-code enforcement (ABAC)' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        { name: 'Sanitize (C23)', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C23: Output sanitization (PII, secrets)' },
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 1800, tokens_out: 10, desc: 'Content safety classification' },
        { name: 'DLP Scan (C19)', type: 'classifier', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'C19: DLP scanning for MNPI and sensitive data' },
        { name: 'Approval (C26)', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'C26: Non-bypassable approval workflow check' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, tokens_in: 0, tokens_out: 0, desc: 'Static analysis of generated code' },
      ]},
      { phase: 'tool_call',   checks: [
        { name: 'Params (C35)', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C35: MCP parameter schema validation' },
        { name: 'Domain (C28)', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C28: Domain whitelisting for external calls' },
        { name: 'JIT (C17)', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C17: JIT permission scoping' },
      ]},
      { phase: 'tool_response', checks: [
        { name: 'Content Filter', type: 'llm', latency_ms: 290, tokens_in: 800, tokens_out: 10, desc: 'Tool response content safety' },
        { name: 'RAG Valid. (C33)', type: 'classifier', latency_ms: 10, tokens_in: 0, tokens_out: 0, desc: 'C33: RAG document validation' },
        { name: 'Data Min. (C32)', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C32: Data minimization enforcement' },
      ]},
      { phase: 'inter_agent', checks: [
        { name: 'Agent Card (C36)', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C36: Cryptographic agent card verification' },
        { name: 'Identity (C12)', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C12: SPIFFE/mTLS identity verification' },
        { name: 'Collusion Det.', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'Agent coordination/collusion anomaly detection' },
      ]},
      { phase: 'memory',      checks: [
        { name: 'Ctx Guard (C33)', type: 'classifier', latency_ms: 10, tokens_in: 0, tokens_out: 0, desc: 'C33/C2: Scan context window for injection/poisoning artifacts' },
        { name: 'Mem Isol. (C34)', type: 'deterministic', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C34: Cross-session memory isolation, cryptographic binding' },
        { name: 'Knowledge (C18)', type: 'deterministic', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C18: Validate knowledge source provenance and integrity' },
      ]},
      { phase: 'evaluation',  checks: [
        { name: 'Feedback (C27)', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C27: Multi-source feedback aggregation and trust scoring' },
        { name: 'Quota (C22)', type: 'deterministic', latency_ms: 0.1, tokens_in: 0, tokens_out: 0, desc: 'C22: Per-request resource quota enforcement (CPU, memory, time)' },
      ]},
      { phase: 'audit',       checks: [
        { name: 'Audit Log (C9)', type: 'deterministic', latency_ms: 2, tokens_in: 0, tokens_out: 0, desc: 'C9: Write-once audit trail (SOX/SR 11-7)' },
        { name: 'Decision (C20)', type: 'crypto', latency_ms: 1, tokens_in: 0, tokens_out: 0, desc: 'C20: Signed decision records for regulatory compliance' },
        { name: 'Anomaly (C15)', type: 'classifier', latency_ms: 5, tokens_in: 0, tokens_out: 0, desc: 'C15: Runtime behavioral anomaly detection' },
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
