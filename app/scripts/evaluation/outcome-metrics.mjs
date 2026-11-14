// Transcript evidence only (bash/p8 calls, commits from the Maker: line).
// Gameplay coverage is supplied by a separate verifier.
// Cumulative snapshots can repeat messages: tool-call identity owns counting.
export function outcomeMetrics(entries) {
  const calls = new Map(), results = new Map();
  for (const entry of entries) for (const message of entry.model ?? []) {
    if (message.role === "assistant" && Array.isArray(message.content))
      for (const part of message.content)
        if (part.type === "toolCall") calls.set(part.id, part);
    if (message.role === "toolResult") results.set(message.toolCallId, message);
  }
  const byTool = {}, byP8 = {}, imageDimensions = {};
  let failed = 0, missing = 0, bytes = 0, chars = 0, images = 0;
  let firstLoad = null, reads = 0, looks = 0;
  let index = 0;
  for (const [id, call] of calls) {
    index++;
    byTool[call.name] = (byTool[call.name] ?? 0) + 1;
    const command = call.name === "bash" ? String(call.arguments?.command ?? "") : "";
    for (const [, sub] of command.matchAll(/\bp8 (\w+)/g)) byP8[sub] = (byP8[sub] ?? 0) + 1;
    if (/\bp8 run\b[^|;&]*--read/.test(command)) reads++;
    if (/\bp8 look\b/.test(command)) looks++;
    const result = results.get(id);
    if (!result) { missing++; continue; }
    if (result.isError) failed++;
    const text = (result.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
    if (firstLoad === null && /Maker: committed as version \d+/.test(text)) firstLoad = index;
    for (const part of result.content ?? []) {
      if (part.type === "text") {
        chars += part.text.length;
        bytes += new TextEncoder().encode(part.text).length;
      }
      if (part.type === "image") {
        images++;
        let size = "unknown";
        if (part.mimeType === "image/png" && part.data) {
          try {
            const header = Uint8Array.from(atob(part.data.slice(0, 32)), c => c.charCodeAt(0));
            if (header[0] === 137 && header[1] === 80 && header.length >= 24) {
              const view = new DataView(header.buffer);
              size = `${view.getUint32(16)}x${view.getUint32(20)}`;
            }
          } catch { /* Archived payload may omit binary content. */ }
        }
        imageDimensions[size] = (imageDimensions[size] ?? 0) + 1;
      }
    }
  }
  return {
    schemaVersion: 2, toolCalls: calls.size, byTool, byP8,
    failedTools: failed, missingResults: missing,
    errorRate: calls.size ? failed / calls.size : 0,
    lookShare: calls.size ? looks / calls.size : 0,
    stateReads: reads,
    firstSuccessfulLoadCall: firstLoad,
    firstVerifiedCoreLoopCall: null,
    resultTextBytes: bytes, resultTextCharacters: chars, images, imageDimensions,
    agentCoverage: { coreLoop: "unknown", victory: "unknown", retry: "unknown" },
    independentCoverage: { coreLoop: "unknown", victory: "unknown", retry: "unknown" },
  };
}
