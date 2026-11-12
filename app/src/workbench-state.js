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
      detail: `step ${Math.min(tools.length, states.filter((s) => s === "completed").length + 1)} / ${tools.length}`,
    };
  const failed = states.filter((s) => s === "failed").length;
  const interrupted = states.filter((s) => s === "interrupted").length;
  return {
    state: failed ? "failed" : interrupted ? "interrupted" : "completed",
    label: failed
      ? "Finished with errors"
      : interrupted
        ? "Stopped before finishing"
        : "Built and playtested",
    detail: `${tools.length} steps${failed ? ` · ${failed} failed` : ""}${interrupted ? ` · ${interrupted} interrupted` : ""}`,
  };
}

const buttonNames = [
  [1, "←"],
  [2, "→"],
  [4, "↑"],
  [8, "↓"],
  [16, "Z"],
  [32, "X"],
];
/** Tool button mask (left=1 … X=32) → "→ + X". */
export function formatButtons(mask = 0) {
  const pressed = buttonNames.filter(([bit]) => mask & bit).map(([, n]) => n);
  return pressed.length ? pressed.join(" + ") : "release";
}
const toolLabels = {
  read: "Read a file",
  read_game: "Read the cart source",
  load_game: "Loaded the cart",
  edit: "Edited main.lua",
  read_assets: "Read resources",
  edit_assets: "Edited resources",
  press_buttons: "Pressed",
  observe_game: "Looked at the screen",
  reset_game: "Restarted the test",
};
export function describeTool(tool) {
  const args = tool?.args ?? {};
  if (tool?.toolName === "press_buttons" && Array.isArray(args.steps))
    return {
      label: "Played an input sequence",
      meta: `${args.steps.length} steps · ${args.steps.reduce((n, s) => n + (s.frames ?? 0), 0)}f`,
    };
  if (tool?.toolName === "read_assets" && ["png", "both"].includes(args.format))
    return {
      label:
        args.kind === "map"
          ? "Previewed map resources"
          : "Previewed sprite resources",
      meta: args.version === "committed" ? "committed" : "draft",
    };
  if (tool?.toolName === "press_buttons")
    return {
      label: args.buttons
        ? `${toolLabels.press_buttons} ${formatButtons(args.buttons)}`
        : "Let the game run",
      meta: Number.isInteger(args.frames) ? `${args.frames}f` : "",
    };
  if (tool?.toolName === "load_game")
    return typeof args.source === "string"
      ? {
          label: "Loaded source and resources",
          meta: `${args.source.split("\n").length} lines`,
        }
      : { label: toolLabels.load_game, meta: "" };
  if (tool?.toolName === "edit" || tool?.toolName === "edit_assets") {
    const n = Array.isArray(args.edits) ? args.edits.length : 1;
    return {
      label: toolLabels[tool.toolName],
      meta: `${n} ${n === 1 ? "change" : "changes"}`,
    };
  }
  return {
    label: toolLabels[tool?.toolName] ?? tool?.toolName ?? "Tool",
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
      tool.toolName !== "load_game" &&
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
