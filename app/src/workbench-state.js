import { interruptedToolResult } from "./project-store.js";

// UI-only grouping: raw model history remains untouched for replay/recovery.
export function groupAssistantTurns(messages) {
  const grouped = [];
  for (const message of messages) {
    const previous = grouped.at(-1);
    if (message.role === "assistant" && previous?.role === "assistant") {
      previous.content.push(...message.content);
      previous.status = message.status;
    } else grouped.push({ ...message, content: [...message.content] });
  }
  return grouped;
}
export function toolState(tool, running) {
  if (tool.isError && tool.result === interruptedToolResult)
    return "interrupted";
  if (tool.result === undefined) return running ? "running" : "interrupted";
  return tool.isError ? "failed" : "completed";
}
export function summarizeTools(tools, running) {
  const states = tools.map((tool) => toolState(tool, running));
  if (running)
    return {
      state: "running",
      label: "Building & playtesting",
      detail: `${states.filter((s) => s === "completed").length} / ${tools.length} steps completed`,
    };
  const failed = states.filter((s) => s === "failed").length;
  const interrupted = states.filter((s) => s === "interrupted").length;
  return {
    state: failed ? "failed" : interrupted ? "interrupted" : "completed",
    label: "Build & playtest",
    detail: `${tools.length} steps${failed ? ` · ${failed} failed` : ""}${interrupted ? ` · ${interrupted} interrupted` : ""}`,
  };
}
