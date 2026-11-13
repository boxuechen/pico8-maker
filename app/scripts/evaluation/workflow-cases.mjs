import { outcomeMetrics } from "./outcome-metrics.mjs";
import { emptySnapshot, editAssets } from "../../src/pico8/assets.js";

export const fixtureSource = `-- Preserve unrelated mechanics and the credit.
speed=1
credit="WORKFLOW FIXTURE"
function _init() x=8 mode="play" end
function _update()
 if mode!="play" then
  if btnp(4) then _init() end
  return
 end
 if btn(0) then x-=speed end
 if btn(1) then x+=speed end
 if x>=104 then mode="win" end
 if x<0 then mode="lose" end
end
function _draw()
 cls(1)
 print(credit,1,1,7)
 print("arrows: move o: retry",1,10,7)
 spr(2,104,64)
 spr(1,x,64)
 if mode!="play" then print(mode,52,90,7) end
end`;
export function fixtureSnapshot() {
  const snapshot = emptySnapshot(fixtureSource);
  snapshot.assets = editAssets(snapshot.assets, [
    { kind: "sprite", id: 1, rows: Array(8).fill("bbbbbbbb"), flags: 7 },
    { kind: "sprite", id: 2, rows: Array(8).fill("77777777"), flags: 3 },
  ]);
  return snapshot;
}

export const workflowCases = [
  {
    id: "create",
    prompt:
      "做一个完整但很小的 PICO-8 游戏：左右键移动角色，抵达右边旗帜获胜，走出左边界失败；胜负后按 O 重试。开场就能操作，角色和旗帜清楚可见。完成并验证核心玩法即可。",
  },
  {
    id: "edit",
    prompt:
      "把现有游戏的水平移动速度从每帧 1 像素改为 2 像素，验证修改。保留其他规则、资源和 WORKFLOW FIXTURE 署名。",
  },
  {
    id: "assets",
    prompt:
      "只把已有 sprite 1 的全部 8×8 像素改成粉色（颜色 14），保留它的 flags 和所有其他资源、Lua 代码。提交并检查显示。",
  },
  {
    id: "playtest",
    prompt:
      "只试玩现有游戏：验证左右移动、右边旗帜获胜、左边越界失败和 O 重试。报告实际观察结果，不修改代码或资源。",
  },
  {
    id: "explain",
    prompt:
      "只解释现有游戏的控制、胜负和重试规则。可以读源码，但不要运行、重置、按键、修改或加载游戏。",
  },
  {
    id: "compact",
    compact: true,
    prompt:
      "继续之前的游戏，把水平移动速度改为每帧 2 像素并验证。保留现有资源、其他规则和 WORKFLOW FIXTURE 署名。",
  },
];

export function transcriptMetrics(entries) {
  const messages = entries.flatMap((e) => e.model ?? []);
  const results = new Map(
    messages
      .filter((m) => m.role === "toolResult")
      .map((m) => [m.toolCallId, m]),
  );
  const calls = messages.flatMap((m) =>
    m.role === "assistant"
      ? m.content.filter((p) => p.type === "toolCall")
      : [],
  );
  const successful = calls.filter(
    (c) => results.has(c.id) && !results.get(c.id).isError,
  );
  const assistant = messages.filter((m) => m.role === "assistant");
  return {
    outcomes: outcomeMetrics(entries),
    checksProfile: "workflow-scope",
    tools: calls.length,
    failedTools: calls.filter((c) => results.get(c.id)?.isError).length,
    referenceReads: successful.filter(
      (c) =>
        c.name === "read" && c.arguments.path?.startsWith("/extensions/pico8/"),
    ).length,
    inputs: successful
      .filter((c) => c.name === "press_buttons")
      .map((c) => c.arguments),
    inputSteps: successful
      .filter((c) => c.name === "press_buttons")
      .reduce((n, c) => n + (c.arguments.steps?.length ?? 1), 0),
    resourcePreviews: successful.filter(
      (c) =>
        c.name === "read_assets" &&
        ["png", "both"].includes(c.arguments.format),
    ).length,
    operations: calls.map((c) => c.name),
    finalText: (assistant.at(-1)?.content ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n"),
    reportedTokens: assistant.reduce(
      (n, m) => n + (m.usage?.totalTokens ?? 0),
      0,
    ),
  };
}

// Deterministic scope checks are separate from gameplay quality. In particular,
// a create run never receives an automated "fun" or complete-gameplay score.
export function assessScope(task, before, after, metrics, settled) {
  const checks = {
    naturalCompletion: settled?.status === "done" && Boolean(metrics.finalText),
  };
  if (task.mechanic) checks.preservedResources = before.assets === after.assets;
  if (["playtest", "explain"].includes(task.id)) {
    checks.preservedCart =
      before.source === after.source && before.assets === after.assets;
    checks.noAuthoring = !metrics.operations.some((n) =>
      ["edit", "edit_assets", "load_game"].includes(n),
    );
  }
  if (task.id === "explain")
    checks.noGameOperation = !metrics.operations.some((n) =>
      [
        "load_game",
        "reset_game",
        "press_buttons",
        "observe_game",
        "inspect_game",
      ].includes(n),
    );
  else if (task.id !== "assets") checks.actualInput = metrics.inputs.length > 0;
  if (["edit", "compact"].includes(task.id)) {
    checks.preservedResources = before.assets === after.assets;
    checks.preservedCredit = after.source.includes('credit="WORKFLOW FIXTURE"');
  }
  if (task.id === "assets") {
    checks.sourceUnchanged = before.source === after.source;
    checks.onlyRequestedResourceChanged =
      after.assets ===
      editAssets(before.assets, [
        { kind: "sprite", id: 1, rows: Array(8).fill("eeeeeeee") },
      ]);
  }
  return checks;
}
