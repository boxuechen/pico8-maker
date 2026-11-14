import { outcomeMetrics } from "./outcome-metrics.mjs";

export function transcriptEvidence(entries) {
  const calls = new Map(),
    results = new Map(),
    assistant = new Map();
  for (const entry of entries)
    for (const m of entry.model ?? []) {
      if (m.role === "assistant") {
        assistant.set(m.id ?? `${m.timestamp}:${JSON.stringify(m.content)}`, m);
        for (const p of m.content ?? [])
          if (p.type === "toolCall") calls.set(p.id, p);
      }
      if (m.role === "toolResult") results.set(m.toolCallId, m);
    }
  const ledger = [],
    counts = new Map();
  let ordinal = 0;
  for (const [id, call] of calls) {
    ordinal++;
    if (call.name !== "press_buttons") continue;
    for (const part of results.get(id)?.content ?? []) {
      if (part.type !== "text") continue;
      try {
        const meta = JSON.parse(part.text.split("\n")[0]);
        if (!meta.run || !meta.execution) continue;
        const n = (counts.get(meta.run) ?? 0) + 1;
        counts.set(meta.run, n);
        ledger.push({ ordinal, run: meta.run, recordedCall: n });
        break;
      } catch {
        /* A diagnostic or later checkpoint is not route metadata. */
      }
    }
  }
  return {
    calls: [...calls.values()],
    results,
    assistant: [...assistant.values()],
    ledger,
  };
}
export function usageMetrics(messages) {
  const known = messages.filter((m) => m.usage?.totalTokens > 0),
    sum = (key) => known.reduce((n, m) => n + (m.usage[key] ?? 0), 0);
  return {
    reportedGenerations: known.length,
    unreportedGenerations: messages.length - known.length,
    tokens: known.length
      ? {
          input: sum("input"),
          output: sum("output"),
          cacheRead: sum("cacheRead"),
          cacheWrite: sum("cacheWrite"),
          total: sum("totalTokens"),
        }
      : null,
    cost:
      known.length &&
      known.every(
        (m) => Number.isFinite(m.usage.cost?.total) && m.usage.cost.total > 0,
      )
        ? {
            value: known.reduce((n, m) => n + m.usage.cost.total, 0),
            currency: "USD",
            basis: known.every((m) => m.usage.cost.totalFromProvider)
              ? "provider"
              : "catalog_estimate",
          }
        : null,
  };
}
export function s4Metrics(entries, agent, independent, elapsedMs) {
  const evidence = transcriptEvidence(entries);
  return {
    ...outcomeMetrics(entries),
    schemaVersion: 3,
    // p8 commands in bash calls: state reads and looks at the screen.
    stateReads: evidence.calls.filter(
      (c) => c.name === "bash" && /\bp8 run\b[^|;&]*--read/.test(c.arguments?.command ?? ""),
    ).length,
    looks: evidence.calls.filter(
      (c) => c.name === "bash" && /\bp8 look\b/.test(c.arguments?.command ?? ""),
    ).length,
    firstVerifiedCoreLoopCall: agent.firstVerifiedCoreLoopCall,
    agentCoverage: agent.coverage,
    independentCoverage: independent.coverage,
    elapsedMs,
    usage: usageMetrics(evidence.assistant),
  };
}
