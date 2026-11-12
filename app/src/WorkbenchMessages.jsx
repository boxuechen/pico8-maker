import { createContext, useContext, useEffect, useState } from "react";
import {
  MessagePrimitive,
  ActionBarPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  Check,
  X,
  Square,
  ChevronRight,
  Copy,
  LoaderCircle,
} from "lucide-react";
import { summarizeTools, toolState } from "./workbench-state.js";
export const ActivityContext = createContext({ running: false });
const names = {
  read_reference: "Read reference",
  read_game: "Read source",
  load_game: "Update game",
  press_buttons: "Test controls",
  observe_game: "Observe game",
  reset_game: "Reset test",
};
function StateIcon({ state }) {
  return state === "running" ? (
    <LoaderCircle size={14} className="spin" />
  ) : state === "failed" ? (
    <X size={14} />
  ) : state === "interrupted" ? (
    <Square size={12} />
  ) : (
    <Check size={14} />
  );
}
function ToolDetail({ tool, running }) {
  const state = toolState(tool, running);
  return (
    <details className={`tool tool-${state}`}>
      <summary>
        <StateIcon state={state} />
        <span>{names[tool.toolName] ?? tool.toolName}</span>
        <small>{state}</small>
        <ChevronRight size={12} />
      </summary>
      <div className="tool-detail">
        <span>INPUT</span>
        <pre>{JSON.stringify(tool.args, null, 2)}</pre>
        <span>RESULT</span>
        <pre>
          {tool.result === undefined
            ? running
              ? "Waiting for tool result…"
              : "No result was recorded. Run another test to verify the game."
            : typeof tool.result === "string"
              ? tool.result
              : JSON.stringify(tool.result, null, 2)}
        </pre>
      </div>
    </details>
  );
}
function ToolActivity({ tools, running }) {
  const [open, setOpen] = useState(running);
  useEffect(() => setOpen(running), [running]);
  const summary = summarizeTools(tools, running);
  return (
    <section className={`tool-activity activity-${summary.state}`}>
      <button
        className="activity-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <StateIcon state={summary.state} />
        <span>
          {summary.label}
          <small>{summary.detail}</small>
        </span>
        <ChevronRight className={open ? "expanded" : ""} size={14} />
      </button>
      {open && (
        <div className="activity-steps">
          {tools.map((tool) => (
            <ToolDetail key={tool.toolCallId} tool={tool} running={running} />
          ))}
          <p className="activity-note">
            Tool execution log. Gameplay findings are described in the reply.
          </p>
        </div>
      )}
    </section>
  );
}
export function UserMessage() {
  return (
    <MessagePrimitive.Root className="message user">
      <div className="user-bubble">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}
export function AssistantMessage() {
  const parts = useAuiState((s) => s.message.parts);
  const isLast = useAuiState((s) => s.message.isLast);
  const activity = useContext(ActivityContext);
  const running = activity.running && isLast;
  const tools = parts.filter((p) => p.type === "tool-call");
  const firstTool = parts.findIndex((p) => p.type === "tool-call");
  return (
    <MessagePrimitive.Root className="message assistant">
      {parts.map((part, index) =>
        part.type === "tool-call" ? (
          index === firstTool ? (
            <ToolActivity key="activity" tools={tools} running={running} />
          ) : null
        ) : (
          <MessagePrimitive.PartByIndex
            key={index}
            index={index}
            components={{ Text: MarkdownTextPrimitive }}
          />
        ),
      )}
      <ActionBarPrimitive.Root
        className="message-actions"
        hideWhenRunning
        autohide="not-last"
      >
        <ActionBarPrimitive.Copy title="Copy reply" aria-label="Copy reply">
          <Copy size={13} />
          <span>Copy</span>
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
