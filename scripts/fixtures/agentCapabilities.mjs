export const grokInitialize = {
  protocolVersion: 1,
  _meta: { modelState: { currentModelId: "grok-runtime", availableModels: [
    { modelId: "grok-runtime", name: "Grok Runtime", _meta: { supportsReasoningEffort: true, reasoningEffort: "high", reasoningEfforts: [
      { value: "xhigh", label: "Extra High", default: false }, { value: "high", label: "High", default: true }, { value: "low", label: "Low", default: false },
    ] } },
    { modelId: "grok-legacy", name: "Grok Legacy", _meta: { supportsReasoningEffort: true, reasoningEfforts: [{ id: "low" }, { id: "high", default: true }] } },
    { modelId: "grok-simple", name: "Grok Simple", _meta: { supportsReasoningEffort: false } },
  ] } },
};
export const grokHelp = "--permission-mode <MODE>\n  Permission mode\n  [possible values: default, acceptEdits, auto, dontAsk, bypassPermissions, plan]\n--prompt-file <PATH>";
export const antigravityModels = "gemini-runtime-high\tGemini Runtime (High)\nclaude-runtime\tClaude Runtime (Thinking)\n";
export const antigravityHelp = "Usage of agy:\n  --effort Reasoning effort (low|medium|high|xhigh|max)\n  --mode Set the agent execution mode (accept-edits, plan)\n  --model Model for current session\n";
