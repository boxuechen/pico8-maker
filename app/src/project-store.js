export const interruptedToolResult =
  "上次操作因页面关闭而中断，结果未知。请读取当前源码并重新验证。";

// Persist transcript text/tool results, never screenshots or model credentials.
export function compactTranscript(entries = []) {
  return entries
    .flatMap((entry) => entry.model ?? [])
    .map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content
            .filter((part) => part.type !== "thinking")
            .map((part) =>
              part.type === "image"
                ? {
                    type: "text",
                    text: "[历史测试截图未保存；请重新观察当前游戏。]",
                  }
                : part,
            )
        : message.content,
    }));
}

export function recoverTranscript(messages = []) {
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
