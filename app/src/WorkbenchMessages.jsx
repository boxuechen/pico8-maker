import { createContext, useContext, useEffect, useState } from "react";
import {
  MessagePrimitive,
  ActionBarPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Check, X, Square, ChevronRight, Copy } from "lucide-react";
import {
  summarizeTools,
  mergeSteps,
  describeTool,
} from "./workbench-state.js";
import { t, useLang } from "./i18n.js";
export const ActivityContext = createContext({ running: false });

function StateIcon({ state }) {
  return state === "running" ? (
    <i className="state-dot" aria-label={t("stRunning")} />
  ) : state === "failed" ? (
    <X size={14} aria-label={t("stFailed")} />
  ) : state === "interrupted" ? (
    <Square size={11} aria-label={t("stInterrupted")} />
  ) : (
    <Check size={14} aria-label={t("stCompleted")} />
  );
}
function Spinner() {
  return <i className="spinner" aria-hidden="true" />;
}
function resultText(tool, running) {
  return tool.result === undefined
    ? running
      ? t("waitingResult")
      : t("noResult")
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
            <span>
              {t("input")} · {tool.toolName}
            </span>
            <pre>{toolInput(tool)}</pre>
            <span>{t("result")}</span>
            <pre>{resultText(tool, running)}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}
function ToolActivity({ tools, running }) {
  useLang();
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
            <Step
              key={step.tools[0].toolCallId}
              step={step}
              running={running}
            />
          ))}
        </div>
      )}
    </section>
  );
}
// Compact, readable tool input: line counts for whole sources, -/+ for edits.
function toolInput(tool) {
  const args = tool.args ?? {};
  if (tool.toolName === "bash" && typeof args.command === "string")
    return args.command;
  if (tool.toolName === "edit" && Array.isArray(args.edits))
    return args.edits
      .map((e) =>
        [
          ...String(e.oldText ?? "")
            .split("\n")
            .map((l) => `- ${l}`),
          ...String(e.newText ?? "")
            .split("\n")
            .map((l) => `+ ${l}`),
        ].join("\n"),
      )
      .join("\n…\n");
  return JSON.stringify(args, null, 2);
}
function VersionCard({ tool, edits, isLast }) {
  const { canUndo, onUndo, onViewCode, busy } = useContext(ActivityContext);
  useLang();
  const detail = t("nEdits", { n: edits });
  const version = [
    ...String(tool.result ?? "").matchAll(/Maker: committed as version (\d+)/g),
  ].at(-1)?.[1];
  return (
    <div className="version-card">
      <svg
        className="pixel-icon mini-cart"
        viewBox="0 0 16 20"
        aria-hidden="true"
      >
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
          {t("cartUpdated")}
          {version ? ` · v${version}` : ""}
        </strong>
        <code>
          {detail} · {t("passedLoad")}
        </code>
      </div>
      <button onClick={onViewCode}>{t("viewCodeBtn")}</button>
      {isLast && (
        <button className="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          {t("undo")}
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
  useLang();
  const running = activity.running && isLast;
  const tools = parts.filter((p) => p.type === "tool-call");
  const firstTool = parts.findIndex((p) => p.type === "tool-call");
  const update = running
    ? null
    : tools.findLast(
        (t) =>
          t.toolName === "bash" &&
          /Maker: committed as version \d+/.test(String(t.result ?? "")),
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
          edits={
            tools.filter(
              (t) =>
                t.toolName === "edit" ||
                t.toolName === "write" ||
                t.toolName === "edit_assets",
            ).length
          }
          isLast={isLast}
        />
      )}
      <ActionBarPrimitive.Root
        className="message-actions"
        hideWhenRunning
        autohide="not-last"
      >
        <ActionBarPrimitive.Copy
          title={t("copyReply")}
          aria-label={t("copyReply")}
        >
          <Copy size={13} />
          <span>{t("copy")}</span>
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
