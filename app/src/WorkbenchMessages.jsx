import { createContext, useContext, useEffect, useState } from "react";
import {
  MessagePrimitive,
  ActionBarPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Check, X, Square, ChevronRight, Copy } from "lucide-react";
import { summarizeTools, toolState, mergeSteps, describeTool } from "./workbench-state.js";
export const ActivityContext = createContext({ running: false });

function StateIcon({ state }) {
  return state === "running" ? (
    <i className="state-dot" aria-label="Running" />
  ) : state === "failed" ? (
    <X size={14} aria-label="Failed" />
  ) : state === "interrupted" ? (
    <Square size={11} aria-label="Interrupted" />
  ) : (
    <Check size={14} aria-label="Completed" />
  );
}
function Spinner() {
  return <i className="spinner" aria-hidden="true" />;
}
function resultText(tool, running) {
  return tool.result === undefined
    ? running
      ? "Waiting for tool result…"
      : "No result was recorded. Run another test to verify the game."
    : typeof tool.result === "string"
      ? tool.result
      : JSON.stringify(tool.result, null, 2);
}
function Step({ step, running }) {
  const { label, meta } = describeTool(step.tools.at(-1));
  return (
    <details className={`step step-${step.state}`}>
      <summary>
        <StateIcon state={step.state} />
        <span className="step-label">
          {label}
          {step.tools.length > 1 && <em> ×{step.tools.length}</em>}
        </span>
        {meta && <code>{meta}</code>}
      </summary>
      <div className="step-detail">
        {step.tools.map((tool) => (
          <div key={tool.toolCallId}>
            <span>INPUT · {tool.toolName}</span>
            <pre>
              {toolInput(tool)}
            </pre>
            <span>RESULT</span>
            <pre>{resultText(tool, running)}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}
function ToolActivity({ tools, running }) {
  const [open, setOpen] = useState(running);
  useEffect(() => setOpen(running), [running]);
  const summary = summarizeTools(tools, running);
  const steps = mergeSteps(tools, running);
  return (
    <section className={`activity activity-${summary.state}`}>
      <button
        className="activity-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {summary.state === "running" ? (
          <Spinner />
        ) : (
          <span className="activity-badge">
            <StateIcon state={summary.state} />
          </span>
        )}
        <strong>{summary.label}</strong>
        <small>{summary.detail}</small>
        <ChevronRight className={open ? "expanded" : ""} size={14} />
      </button>
      {open && (
        <div className="activity-steps">
          {steps.map((step) => (
            <Step key={step.tools[0].toolCallId} step={step} running={running} />
          ))}
        </div>
      )}
    </section>
  );
}
// Compact, readable tool input: line counts for whole sources, -/+ for edits.
function toolInput(tool) {
  const args = tool.args ?? {};
  if (tool.toolName === "load_game")
    return typeof args.source === "string"
      ? `${args.source.split("\n").length} lines of Lua`
      : "main.lua (current edits)";
  if (tool.toolName === "edit" && Array.isArray(args.edits))
    return args.edits
      .map((e) =>
        [
          ...String(e.oldText ?? "").split("\n").map((l) => `- ${l}`),
          ...String(e.newText ?? "").split("\n").map((l) => `+ ${l}`),
        ].join("\n"),
      )
      .join("\n…\n");
  return JSON.stringify(args, null, 2);
}
function VersionCard({ tool, edits, isLast }) {
  const { canUndo, onUndo, onViewCode, busy } = useContext(ActivityContext);
  const detail =
    typeof tool.args?.source === "string"
      ? `${tool.args.source.split("\n").length} lines`
      : `${edits} ${edits === 1 ? "edit" : "edits"}`;
  const version = String(tool.result ?? "").match(/Committed as version (\d+)/)?.[1];
  return (
    <div className="version-card">
      <svg className="pixel-icon mini-cart" viewBox="0 0 16 20" aria-hidden="true">
        <path d="M1 0h14v1h1v18h-1v1H1v-1H0V1h1z" fill="#5f574f" />
        <path d="M2 2h12v11H2z" fill="#1d2b53" />
        <path d="M2 10h12v3H2z" fill="#7e2553" />
        <path d="M9 7h2v3H9z" fill="#ffa300" />
        <path d="M12 8h1v2h-1z" fill="#00e436" />
        <path d="M2 15h12v3H2z" fill="#3b3633" />
        <path d="M3 16h6v1H3z" fill="#fff1e8" />
      </svg>
      <div className="version-text">
        <strong>
          Cart updated
          {version ? ` · v${version}` : ""}
        </strong>
        <code>{detail} · passed load check</code>
      </div>
      <button onClick={onViewCode}>View code</button>
      {isLast && (
        <button className="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
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
  const update = running
    ? null
    : tools.findLast(
        (t) =>
          t.toolName === "load_game" &&
          toolState(t, false) === "completed" &&
          /Committed as version \d+/.test(String(t.result ?? "")),
      );
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
      {update && (
        <VersionCard
          tool={update}
          edits={tools.filter((t) => t.toolName === "edit").length}
          isLast={isLast}
        />
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
