// A generic tool loop over complete(). Knows nothing about PICO-8: it sends the
// conversation, runs requested tools, and stops on done, text, caps or errors.

const OMITTED = { type: "text", text: "[older screenshot omitted]" };

// Only the newest image is sent; the stored conversation keeps every image.
export function newestImageOnly(messages) {
  let kept = false;
  return messages
    .slice()
    .reverse()
    .map((m) => {
      if (!Array.isArray(m.content) || !m.content.some((c) => c.type === "image")) return m;
      const content = m.content.map((c) => (c.type !== "image" ? c : kept ? OMITTED : ((kept = true), c)));
      return { ...m, content };
    })
    .reverse();
}

export const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, requests: 0 });
export function addUsage(total, u) {
  total.input += u?.input ?? 0;
  total.output += u?.output ?? 0;
  total.cacheRead += u?.cacheRead ?? 0;
  total.requests += 1;
  return total;
}

/**
 * @returns {Promise<{status:"done"|"text"|"turns"|"tools"|"time"|"error", done?:object,
 *   text?:string, error?:string, messages:object[], usage:object, toolCalls:number, toolErrors:number}>}
 */
export async function runLoop({ complete, system, messages, tools, thinking, maxTurns, budget, deadline, onEvent = () => {}, maxTokens }) {
  const usage = emptyUsage(),
    byName = new Map(tools.map((t) => [t.name, t]));
  let toolCalls = 0,
    toolErrors = 0;
  const result = (status, extra = {}) => ({ status, messages, usage, toolCalls, toolErrors, ...extra });
  for (let turn = 0; turn < maxTurns; turn++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return result("time");
    let reply;
    try {
      reply = await complete({ system, messages: newestImageOnly(messages), tools, thinking, maxTokens, signal: AbortSignal.timeout(remaining) });
    } catch (e) {
      return result(Date.now() >= deadline ? "time" : "error", { error: String(e?.message ?? e) });
    }
    addUsage(usage, reply.usage);
    if (["error", "aborted"].includes(reply.stopReason))
      return result(Date.now() >= deadline ? "time" : "error", { error: reply.errorMessage ?? reply.stopReason });
    messages.push(reply);
    const calls = reply.content.filter((p) => p.type === "toolCall");
    onEvent({ kind: "reply", turn, calls: calls.map((c) => c.name), usage: reply.usage });
    if (!calls.length)
      return result("text", { text: reply.content.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim() });
    let finished = null;
    for (const call of calls) {
      if (budget.toolCalls <= 0) return result("tools");
      budget.toolCalls--;
      toolCalls++;
      const tool = byName.get(call.name);
      let out;
      try {
        out = tool
          ? await tool.execute(call.arguments ?? {})
          : { isError: true, content: [{ type: "text", text: `Unknown tool ${call.name}. Available: ${[...byName.keys()].join(", ")}.` }] };
      } catch (e) {
        out = { isError: true, content: [{ type: "text", text: `Tool failed: ${e?.message ?? e}` }] };
      }
      if (out.isError) toolErrors++;
      onEvent({ kind: "tool", name: call.name, isError: !!out.isError, text: out.content.find((c) => c.type === "text")?.text ?? "" });
      messages.push({ role: "toolResult", toolCallId: call.id, toolName: call.name, content: out.content, isError: !!out.isError, timestamp: Date.now() });
      if (out.done) finished = out.done;
    }
    if (finished) return result("done", { done: finished });
  }
  return result("turns");
}
