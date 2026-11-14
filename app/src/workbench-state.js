import { interruptedToolResult } from "./project-store.js";
import { t } from "./i18n.js";

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
const resultText = (result) =>
  typeof result === "string"
    ? result
    : Array.isArray(result)
      ? result.map((p) => (typeof p?.text === "string" ? p.text : "")).join("")
      : "";
// A command that ran and exited nonzero (a failing p8 check, grep
// with no match) is an ordinary step, not a tool failure.
const exitedNonzero = (tool) =>
  tool.toolName === "bash" &&
  /Command exited with code \d+/.test(resultText(tool.result));
export function toolState(tool, running) {
  if (tool.isError && tool.result === interruptedToolResult)
    return "interrupted";
  if (tool.result === undefined) return running ? "running" : "interrupted";
  return tool.isError && !exitedNonzero(tool) ? "failed" : "completed";
}
export function summarizeTools(tools, running) {
  const states = tools.map((tool) => toolState(tool, running));
  if (running)
    return {
      state: "running",
      label: t("toolBuilding"),
      detail: t("toolStep", {
        i: Math.min(
          tools.length,
          states.filter((s) => s === "completed").length + 1,
        ),
        n: tools.length,
      }),
    };
  const failed = states.filter((s) => s === "failed").length;
  const interrupted = states.filter((s) => s === "interrupted").length;
  return {
    state: failed ? "failed" : interrupted ? "interrupted" : "completed",
    label: failed
      ? t("toolErrors")
      : interrupted
        ? t("toolStopped")
        : t("toolDone"),
    detail: t("toolSteps", { n: tools.length, failed, interrupted }),
  };
}

const toolNames = new Set([
  "read",
  "write",
  "edit",
  "bash",
]);
const toolLabel = (name) => (toolNames.has(name) ? t(`tool_${name}`) : null);
export function describeTool(tool) {
  const args = tool?.args ?? {};
  if (tool?.toolName === "bash" && typeof args.command === "string") {
    const command = args.command.trim().split("\n")[0];
    return {
      label: toolLabel("bash"),
      meta: command.length > 60 ? `${command.slice(0, 59)}…` : command,
    };
  }
  if (tool?.toolName === "edit") {
    const n = Array.isArray(args.edits) ? args.edits.length : 1;
    return { label: toolLabel(tool.toolName), meta: t("nChanges", { n }) };
  }
  return {
    label: toolLabel(tool?.toolName) ?? tool?.toolName ?? t("toolFallback"),
    meta: "",
  };
}
/** Merge consecutive calls of the same tool into one display step. */
export function mergeSteps(tools, running) {
  const steps = [];
  for (const tool of tools) {
    const state = toolState(tool, running);
    const last = steps.at(-1);
    if (
      last &&
      last.tools[0].toolName === tool.toolName &&
      last.state === "completed"
    ) {
      last.tools.push(tool);
      last.state = state;
    } else steps.push({ tools: [tool], state });
  }
  return steps;
}
/** The tool currently executing in the latest assistant turn, if any. */
export function currentTool(messages, running) {
  if (!running) return null;
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;
  return (
    last.content.findLast(
      (p) => p.type === "tool-call" && p.result === undefined,
    ) ?? null
  );
}
