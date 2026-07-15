// In-memory agent runtime state: the model override (applies to every agent
// call — fix, convert, refine, and playground generate) and token accounting
// reported by the claude CLI. Each `claude -p` call is a fresh context; `last`
// reflects the most recent call, `totals` accumulate until reset.

const state = {
  model: null,          // user-chosen override; null → the CLI's default
  lastModel: null,      // model id actually reported by the last run
  last: null,           // { input, output, total } of the last run
  totals: { calls: 0, input: 0, output: 0 },
};

// Approximate context-window size for a model id.
export function windowFor(model) {
  if (!model) return 200_000;
  return /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000;
}

export function getAgentState() {
  const window = windowFor(state.lastModel || state.model);
  return { ...state, totals: { ...state.totals }, last: state.last ? { ...state.last } : null, window };
}

export function setModelOverride(model) {
  state.model = (typeof model === 'string' && model.trim()) ? model.trim() : null;
}

export function recordRun({ model, usage } = {}) {
  if (model) state.lastModel = model;
  if (!usage) return;
  const input = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const output = usage.output_tokens || 0;
  state.last = { input, output, total: input + output };
  state.totals.calls += 1;
  state.totals.input += input;
  state.totals.output += output;
}

export function resetTotals() {
  state.last = null;
  state.totals = { calls: 0, input: 0, output: 0 };
}
