/**
 * Security model definitions — derived from drift's security_models/*.yaml
 *
 * Each model defines checkpoints that a request passes through at each
 * pipeline step. Checkpoint types determine color and animation speed.
 */

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
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Llama Guard 3-1B' },
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
        { name: 'PromptGuard 2', type: 'classifier', latency_ms: 19, desc: 'DeBERTa jailbreak classifier (86M)' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        { name: 'AlignmentCheck', type: 'llm', latency_ms: 500, desc: 'CoT reasoning auditor (70B)' },
        { name: 'Content Filter', type: 'llm', latency_ms: 165, desc: 'Llama Guard 3-1B' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, desc: 'Static analysis, 50+ CWEs' },
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
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Violence, hate, sexual, self-harm' },
        { name: 'Prompt Shield', type: 'classifier', latency_ms: 19, desc: 'Jailbreak/injection detection' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Output content safety' },
        { name: 'Groundedness', type: 'llm', latency_ms: 200, desc: 'Hallucination detection' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, desc: 'Code static analysis' },
      ]},
      { phase: 'tool_call',   checks: [
        { name: 'Param Validation', type: 'deterministic', latency_ms: 1, desc: 'MCP schema validation' },
        { name: 'JIT Permissions', type: 'deterministic', latency_ms: 1, desc: 'Just-in-time scoping' },
      ]},
      { phase: 'tool_response', checks: [
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Tool response safety' },
      ]},
      { phase: 'inter_agent', checks: [
        { name: 'Identity', type: 'crypto', latency_ms: 1, desc: 'Ed25519/SPIFFE identity' },
        { name: 'Policy', type: 'deterministic', latency_ms: 0.1, desc: 'Policy engine' },
      ]},
    ],
  },
  {
    id: 'finos_regulated',
    name: 'FINOS Regulated FSI',
    description: '36 controls, 9 layers, SOX/SR 11-7 compliance',
    source: 'FINOS AI Reference Architecture',
    checkpoints: [
      { phase: 'input',       checks: [
        { name: 'Sanitization', type: 'deterministic', latency_ms: 5, desc: 'Input validation' },
        { name: 'AI Gateway', type: 'llm', latency_ms: 290, desc: 'Gateway content filter' },
        { name: 'Prompt Shield', type: 'classifier', latency_ms: 19, desc: 'Jailbreak detection' },
        { name: 'Policy (ABAC)', type: 'deterministic', latency_ms: 0.1, desc: 'Policy-as-code' },
      ]},
      { phase: 'llm',         checks: [] },
      { phase: 'output',      checks: [
        { name: 'Sanitization', type: 'deterministic', latency_ms: 5, desc: 'PII/secret scrub' },
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Content safety' },
        { name: 'DLP Scan', type: 'classifier', latency_ms: 50, desc: 'MNPI leakage scan' },
        { name: 'Approval Gate', type: 'deterministic', latency_ms: 0.1, desc: 'Non-bypassable workflow' },
        { name: 'CodeShield', type: 'static_analysis', latency_ms: 50, desc: 'Code static analysis' },
      ]},
      { phase: 'tool_call',   checks: [
        { name: 'Param Validation', type: 'deterministic', latency_ms: 1, desc: 'MCP schema validation' },
        { name: 'Domain Whitelist', type: 'deterministic', latency_ms: 1, desc: 'Domain whitelisting' },
        { name: 'JIT Permissions', type: 'deterministic', latency_ms: 1, desc: 'JIT scoping' },
      ]},
      { phase: 'tool_response', checks: [
        { name: 'Content Filter', type: 'llm', latency_ms: 290, desc: 'Tool response safety' },
        { name: 'RAG Validation', type: 'classifier', latency_ms: 10, desc: 'RAG doc validation' },
        { name: 'Data Minimization', type: 'deterministic', latency_ms: 5, desc: 'Data minimization' },
      ]},
      { phase: 'inter_agent', checks: [
        { name: 'Agent Card', type: 'crypto', latency_ms: 1, desc: 'Crypto agent card' },
        { name: 'Identity', type: 'crypto', latency_ms: 1, desc: 'SPIFFE/mTLS' },
        { name: 'Collusion Detect', type: 'classifier', latency_ms: 5, desc: 'Anomaly detection' },
      ]},
      { phase: 'audit',       checks: [
        { name: 'Audit Log', type: 'deterministic', latency_ms: 2, desc: 'SOX/SR 11-7 trail' },
        { name: 'Decision Bind', type: 'crypto', latency_ms: 1, desc: 'Signed decision record' },
        { name: 'Anomaly Detect', type: 'classifier', latency_ms: 5, desc: 'Behavioral anomaly' },
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

/** Count checks by type. */
export function countByType(model) {
  const counts = {}
  for (const c of flattenChecks(model)) {
    counts[c.type] = (counts[c.type] || 0) + 1
  }
  return counts
}
