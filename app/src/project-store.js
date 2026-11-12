export const interruptedToolResult =
  "上次操作因页面关闭而中断，结果未知。请读取当前源码并重新验证。";

// Keep entry boundaries and context heads so compaction survives reopening.
// Thinking signatures are protocol state and must travel with assistant messages.
// Screenshots are transient; credentials are never part of this snapshot.
export function compactTranscript(entries = []) {
  const cleanMessage = (message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) =>
          part.type === "image"
            ? {
                type: "text",
                text: "[历史测试截图未保存；请重新观察当前游戏。]",
              }
            : part,
        )
      : message.content,
  });
  return entries.map((entry, index) => ({
    id: entry.id ?? `saved-${index}`,
    kind: entry.kind ?? "restored",
    ...(entry.head === undefined ? {} : { head: entry.head }),
    ...(entry.model ? { model: entry.model.map(cleanMessage) } : {}),
    ...(entry.edits
      ? {
          edits: entry.edits.map((edit) => ({
            ...edit,
            ...(edit.messages
              ? { messages: edit.messages.map(cleanMessage) }
              : {}),
          })),
        }
      : {}),
  }));
}

export function recoverTranscript(messages = []) {
  if (messages[0]?.kind)
    messages = messages.flatMap((entry) => entry.model ?? []);
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "toolResult") continue;
    result.push(message);
    if (message.role !== "assistant" || !Array.isArray(message.content))
      continue;
    const calls = message.content.filter((part) => part.type === "toolCall");
    let end = i + 1;
    while (messages[end]?.role === "toolResult") end++;
    for (const call of calls) {
      result.push(
        messages.slice(i + 1, end).find((m) => m.toolCallId === call.id) ?? {
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [
            {
              type: "text",
              text: interruptedToolResult,
            },
          ],
          isError: true,
          timestamp: Date.now(),
        },
      );
    }
  }
  return result;
}

export function recoverEntries(transcript = []) {
  // Old carts stored a flat message array. Upgrade it without replaying tools.
  if (!transcript[0]?.kind)
    return transcript.length
      ? [
          {
            id: "legacy",
            kind: "restored",
            model: recoverTranscript(transcript),
          },
        ]
      : [];
  const entries = structuredClone(transcript);
  const results = new Set(
    entries
      .flatMap((entry) => entry.model ?? [])
      .filter((message) => message.role === "toolResult")
      .map((message) => message.toolCallId),
  );
  for (const entry of entries) {
    for (const message of [...(entry.model ?? [])]) {
      if (message.role !== "assistant" || !Array.isArray(message.content))
        continue;
      for (const call of message.content.filter(
        (part) => part.type === "toolCall",
      )) {
        if (results.has(call.id)) continue;
        entry.model.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: interruptedToolResult }],
          isError: true,
          timestamp: message.timestamp,
        });
        results.add(call.id);
      }
    }
  }
  return entries;
}
