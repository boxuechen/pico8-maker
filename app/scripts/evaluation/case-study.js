import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../../src/agent.js";
import { Game } from "../../src/game.js";
import { emptySnapshot } from "../../src/pico8/assets.js";
import { downloadCart } from "../../src/pico8/cart.js";
import { readModelConfig } from "../../src/model-store.js";
import { readableError } from "../../src/model-config.js";
import { newCart } from "../../src/cart-store.js";
import { activeSession, sessionContext } from "../../src/sessions.js";
import { defaultKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { transcriptMetrics } from "./skills-cases.mjs";

const $ = (id) => document.getElementById(id);
const garden = new URLSearchParams(location.search).get("case") === "garden";
const caseTitle = garden ? "Sweet Garden" : "Lodge Podge";
const caseSlug = garden ? "sweet-garden" : "lodge-podge";
const reference = garden
  ? "https://developers.openai.com/modretro/seedys-sweet-garden"
  : "https://developers.openai.com/blog/build-a-game-with-modretro-chromatic";
document.title = `${caseTitle} · PICO-8 case study`;
$("case-title").textContent = `${caseTitle} · PICO-8 创作验证`;
$("reference").href = reference;
$("reference").textContent = garden ? "OpenAI 官方花园消除案例" : "OpenAI 官方海狸建窝案例";
if (garden) $("prompt").value = "做一个像 Seedy’s Sweet Garden 那样温暖可爱的 PICO-8 花园消除小游戏：交换相邻花朵，三个相同就消除，掉落后能连锁。在有限步数内完成目标，有清楚的操作提示、轻快的音效和背景音乐，结束后可以再来一局。";
const config = readModelConfig();
const cart = newCart({ title: `${caseTitle} case study`, workingDraft: emptySnapshot() });
const session = activeSession(cart);
const report = {
  schemaVersion: 1,
  suite: `${caseSlug}-case-study`,
  id: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  model: { provider: config.provider, model: config.model, thinkingLevel: config.thinkingLevel },
  reference,
  knowledgeVersion: defaultKnowledgeFiles.version,
  limits: { millisecondsPerTurn: 900000 },
  limitations: ["One model, one case; no general quality or human enjoyment claim.", "Independent test inputs are separate from model playtesting.", "Audio authoring is inspectable; listening is not verified by agent tools."],
  revisions: [],
  runs: [],
  evaluatorEvidence: [],
};
let busy = false, stopped = false, turnStart = 0, agent, startTime, firstPlayableMs;
const safeJSON = (value) => JSON.stringify(value, (_, v) =>
  typeof v === "string" && config.apiKey ? v.replaceAll(config.apiKey, "[REDACTED]") : v, 2);
const entries = async () => (await agent.root.entries({ order: "ascending" }, 1000, undefined, context)).items;
async function archive() {
  const saved = await fetch("/__skills-evaluation", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: safeJSON(report),
  });
  if (!saved.ok) throw new Error(`Archive failed: ${saved.status}`);
  $("archive").textContent = (await saved.json()).path;
}
function controls() {
  $("send").disabled = busy || !agent || !config.apiKey;
  $("stop").disabled = !busy;
  $("test").disabled = busy || !game.hasGame;
  $("export").disabled = busy || !game.hasGame;
  $("play").disabled = busy || !game.hasGame;
  $("restart").disabled = busy || !game.hasGame;
}
const game = new Game((state) => {
  $("revision").textContent = `Committed revision: ${state.revision}; draft dirty: ${game.cartStatus().draftDirty}`;
  $("source").textContent = state.source;
  if (state.testFrame) {
    const rgba = new Uint8ClampedArray(state.testFrame.rgba);
    $("frame").getContext("2d").putImageData(new ImageData(rgba, 128, 128), 0, 0);
  }
  controls();
}, {
  versions: [], draft: cart.workingDraft,
  onDraft: (draft) => { cart.workingDraft = draft; cart.contentVersion++; },
  onSave: (versions, revision) => {
    cart.versions = versions; cart.revision = revision; cart.contentVersion++;
    firstPlayableMs ??= Math.round(performance.now() - startTime);
    report.revisions.push({ revision, at: new Date().toISOString(), snapshot: { ...versions.at(-1) } });
  },
});
$("model").textContent = config.apiKey ? `${config.provider} / ${config.model} / thinking ${config.thinkingLevel}` : "此来源没有已保存的模型配置，请先在主页设置。";
controls();
try {
  await game.mount($("stage"));
  agent = new Agent(game, (_view, all) => {
    const metrics = transcriptMetrics(all.slice(turnStart));
    if (busy) $("status").textContent = `创作中 · ${Math.round((performance.now() - startTime) / 1000)}s · ${metrics.tools} tools · ${metrics.operations.at(-1) ?? "thinking"}`;
    if (metrics.finalText) $("response").textContent = metrics.finalText;
  }, { projectContext: () => sessionContext(cart, session) });
  await agent.open();
  if (config.apiKey) await agent.configure(config);
  await archive();
  $("status").textContent = "准备就绪：独立临时卡带";
} catch (e) {
  $("status").textContent = readableError(e, config.apiKey);
}
controls();

$("send").onclick = async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt || busy || !agent) return;
  busy = true; stopped = false; firstPlayableMs = null; startTime = performance.now();
  turnStart = (await entries()).length;
  const before = { ...game.snapshot };
  controls();
  let timedOut = false, settled, error;
  const timer = setTimeout(() => { timedOut = true; void agent.abort(); }, report.limits.millisecondsPerTurn);
  try { settled = await agent.send(prompt); }
  catch (e) { error = readableError(e, config.apiKey); }
  finally { clearTimeout(timer); }
  const all = await entries();
  const metrics = transcriptMetrics(all.slice(turnStart));
  const run = {
    id: `turn-${report.runs.length + 1}`, prompt,
    status: timedOut ? "time_limit" : stopped ? "stopped" : error ? "error" : settled?.status,
    error, elapsedMs: Math.round(performance.now() - startTime), firstPlayableMs,
    metrics, before, after: { ...game.snapshot }, draft: { ...game.draft },
    cartStatus: game.cartStatus(), entries: all,
  };
  report.runs.push(run);
  session.lastContentVersion = cart.contentVersion;
  report.updatedAt = new Date().toISOString();
  const li = document.createElement("li");
  li.textContent = `${run.id}: ${run.status} · ${Math.round(run.elapsedMs / 1000)}s · ${metrics.tools} tools · ${metrics.failedTools} tool errors`;
  $("history").append(li);
  $("response").textContent = metrics.finalText || error || "No final answer";
  try { await archive(); $("status").textContent = `${run.id}: ${run.status} · 已保留代码、资源及完整记录`; }
  catch (e) { $("status").textContent = readableError(e, config.apiKey); }
  busy = false;
  $("send").textContent = "提交后续反馈";
  controls();
};
$("stop").onclick = () => { stopped = true; void agent?.abort(); };
$("play").onclick = () => game.play();
$("restart").onclick = () => game.restart();
$("export").onclick = () => downloadCart(game.snapshot, { title: `${caseSlug}-v${report.runs.length}`, label: game.testFrame?.rgba });
$("test").onclick = async () => {
  if (busy || !game.hasGame) return;
  busy = true; controls();
  try {
    const action = $("action").value, args = JSON.parse($("args").value);
    const result = await game.execute(action, args);
    report.evaluatorEvidence.push({ revision: game.revision, action, args, result });
    $("test-result").textContent = result.output.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    await archive();
  } catch (e) { $("test-result").textContent = readableError(e, config.apiKey); }
  finally { busy = false; controls(); }
};
window.addEventListener("beforeunload", (event) => { if (busy) { event.preventDefault(); event.returnValue = ""; } });
