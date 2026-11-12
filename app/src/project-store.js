export const projectKey = "pico-maker-project-v1";

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
              text: "上次操作因页面关闭而中断，结果未知。请读取当前源码并重新验证。",
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

export function readProject(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(projectKey));
    if (
      data?.schema !== 1 ||
      typeof data.id !== "string" ||
      !Array.isArray(data.transcript) ||
      !Array.isArray(data.versions) ||
      !data.versions.length ||
      !data.versions.every((v) => typeof v === "string" && v.length <= 100000)
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export function writeProject(project, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(projectKey, JSON.stringify({ ...project, schema: 1 }));
    return true;
  } catch {
    return false;
  }
}

export function readLegacyVersions(storage) {
  try {
    storage ??= globalThis.localStorage;
    const versions = JSON.parse(storage.getItem("pico-demo-versions-v1"));
    return Array.isArray(versions) &&
      versions.length &&
      versions.every((v) => typeof v === "string" && v.length <= 100000)
      ? versions.slice(-12)
      : null;
  } catch {
    return null;
  }
}
