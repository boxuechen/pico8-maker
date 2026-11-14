// Headless rerun of a retained two-turn case study (Sweet Garden / Lodge Podge)
// with the production Agent, knowledge, tools and Worker protocol. Only the
// browser transport and PNG encoding are replaced (EvaluationGame). Uses a
// disposable cart; never touches the user's library.
//
//   DEEPSEEK_API_KEY=... node scripts/evaluation/run-case.mjs --case garden [--flow shell]
//
// The key is read from the environment only and redacted from the archive.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../../src/agent.js";
import index from "../../src/generated/pico8-files.js";
import { createKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { newCart } from "../../src/cart-store.js";
import { activeSession, sessionContext } from "../../src/sessions.js";
import { emptySnapshot } from "../../src/pico8/assets.js";
import { cartBytes, cartText } from "../../src/pico8/cart.js";
import { defaultConfig } from "../../src/model-config.js";
import { inputPlan } from "../../src/pico8/input-sequence.js";
import { revisionCoverage } from "../../src/pico8/playtests.js";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { EvaluationGame } from "./node-game.mjs";
import { startNodeP8Worker } from "./p8-worker-node.mjs";
import { outcomeMetrics } from "./outcome-metrics.mjs";
import { png } from "./png.mjs";

const cases = {
  garden: {
    slug: "sweet-garden",
    baseline: "sweet-garden",
    prompts: [
      "做一个像 Seedy’s Sweet Garden 那样温暖可爱的 PICO-8 花园消除小游戏：交换相邻花朵，三个相同就消除，掉落后能连锁。在有限步数内完成目标，有清楚的操作提示、轻快的音效和背景音乐，结束后可以再来一局。",
      "有些花朵不太好辨认，尤其紫色容易和底色混在一起。请让五种花在小屏幕上更容易分清，并让开场就能看懂“先选中、再按方向交换”的操作。保留现在的目标、步数和计分规则，方便比较前后的操作体验。",
    ],
  },
  lodge: {
    slug: "lodge-podge",
    baseline: "lodge-podge",
    prompts: [
      "做一个叫 Lodge Podge 的 PICO-8 俯视角小游戏：玩家控制一只可爱的像素海狸，啃倒小树收集木棍，在地图中央建成自己的窝。画面温暖可爱，有动作动画、音效和轻松的背景音乐，完成后能重新开始。",
      "海狸再圆胖可爱一点，扁尾巴和门牙要容易认出来。现在草地太亮、细碎花纹太密，请让背景安静一点，角色、材料和窝更突出。参照官方案例，把建窝材料扩展成木棍、泥和树叶，让采集与建造有一点变化；各材料的来源和剩余需求要看得懂，开场就告诉玩家移动和采集的按键。保留轻松氛围、动画、音效和背景音乐。请用最终正常的初始状态实际玩通并检查重开，不要把预置资源或进度的调试结果当作完整通关。",
    ],
  },
};
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const spec = cases[arg("case")];
if (!spec) throw Error("--case garden|lodge is required");
const flow = arg("flow") ?? "frozen";
if (!["frozen", "shell"].includes(flow)) throw Error("--flow frozen|shell");
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw Error("DEEPSEEK_API_KEY is required");
const millisecondsPerTurn = 900000; // Same per-turn limit as the baseline; no tool cap.
const id = crypto.randomUUID();
const out = new URL(
  `../../../.cache/evaluations/case-${spec.slug}${flow === "shell" ? "-shell" : ""}-${id}/`,
  import.meta.url,
);
await mkdir(out, { recursive: true });
const redact = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "string" ? v.replaceAll(apiKey, "[REDACTED]") : v),
    2,
  );
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const knowledge = createKnowledgeFiles({
  load: (file) =>
    readFile(
      new URL(
        `../../public/extensions/pico8/${index.version}/${file}`,
        import.meta.url,
      ),
      "utf8",
    ),
});
const cart = newCart({
  title: `${spec.slug} rerun`,
  workingDraft: emptySnapshot(),
});
const session = activeSession(cart);
let firstPlayableMs, turnStarted;
const revisions = [];
const game = new EvaluationGame({
  versions: [],
  draft: cart.workingDraft,
  onDraft: (d) => {
    cart.workingDraft = d;
    cart.contentVersion++;
  },
  onSave: (versions, revision) => {
    cart.versions = versions;
    cart.revision = revision;
    cart.contentVersion++;
    firstPlayableMs ??= Math.round(performance.now() - turnStarted);
    revisions.push({ revision, at: new Date().toISOString() });
    log(`commit r${revision}`);
  },
});
game.playtests.onChange = (runs) => {
  cart.playtests = runs;
};
let lastCount = 0;
const agent = new Agent(
  game,
  (_view, all) => {
    const n = outcomeMetrics(all).toolCalls;
    if (n !== lastCount && n % 10 === 0) log(`${n} tool calls`);
    lastCount = n;
  },
  {
    knowledge,
    projectContext: () => sessionContext(cart, session),
    flow,
    ...(flow === "shell" ? { startP8: startNodeP8Worker } : {}),
  },
);
const report = {
  schemaVersion: 1,
  suite: `${spec.slug}-case-rerun`,
  id,
  startedAt: new Date().toISOString(),
  model: {
    provider: defaultConfig.provider,
    model: defaultConfig.model,
    thinkingLevel: defaultConfig.thinkingLevel,
  },
  knowledgeVersion: index.version,
  flow,
  limits: { millisecondsPerTurn, toolCalls: null },
  runs: [],
};
const entries = async () =>
  (await agent.root.entries({ order: "ascending" }, 5000, undefined, context))
    .items;

await agent.open();
await agent.configure({ ...defaultConfig, apiKey });
for (const [i, prompt] of spec.prompts.entries()) {
  const before = (await entries()).length;
  turnStarted = performance.now();
  firstPlayableMs = undefined;
  log(`turn ${i + 1} start`);
  let timedOut = false,
    settled,
    error;
  const timer = setTimeout(() => {
    timedOut = true;
    void agent.abort();
  }, millisecondsPerTurn);
  try {
    settled = await agent.send(prompt);
  } catch (e) {
    error = String(e.message).replaceAll(apiKey, "[REDACTED]");
  } finally {
    clearTimeout(timer);
  }
  const all = await entries();
  const turn = all.slice(before);
  const metrics = outcomeMetrics(turn);
  const finalText = turn
    .flatMap((e) => e.model ?? [])
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .at(-1);
  const run = {
    id: `turn-${i + 1}`,
    prompt,
    status: timedOut ? "time_limit" : error ? "error" : settled?.status,
    error,
    elapsedMs: Math.round(performance.now() - turnStarted),
    firstPlayableMs: firstPlayableMs ?? null,
    revision: game.revision,
    draftDirty: game.cartStatus().draftDirty,
    coverage: revisionCoverage(game.playtests.runs, game.revision),
    metrics,
    finalText,
    after: structuredClone(game.snapshot),
    entries: turn,
  };
  report.runs.push(run);
  session.lastContentVersion = cart.contentVersion;
  log(
    `turn ${i + 1} ${run.status} ${Math.round(run.elapsedMs / 1000)}s ${metrics.toolCalls} tools`,
  );
  await writeFile(
    new URL("report.json", out),
    redact({ ...report, playtests: game.playtests.runs, revisions }),
  );
  await writeFile(new URL(`turn-${i + 1}.p8`, out), cartText(game.snapshot));
}
report.playtests = structuredClone(game.playtests.runs);
report.revisions = revisions;
await agent.dispose({ preserveGame: true });
await game.dispose();

// Replay the longest normal-input route the Agent recorded on the final
// revision in a fresh session, keeping every call-end frame for review.
const finalRuns = report.playtests.filter(
  (r) =>
    r.revision === report.runs.at(-1).revision &&
    r.purpose === "normal" &&
    !r.debugEvents.length,
);
const route = finalRuns.sort((a, b) => b.calls.length - a.calls.length)[0];
report.finalRouteReplay = null;
if (route) {
  const s = await createPico8Session({ inspection: true });
  await s.loadCart(cartBytes(report.runs.at(-1).after));
  await s.advance({ frames: 1 });
  const frames = [];
  for (const [n, call] of route.calls.entries()) {
    let last;
    for (const step of inputPlan(call.input).steps)
      last = await s.advance({
        frames: step.frames,
        input: {
          controllers: [step.buttons, 0, 0, 0, 0, 0, 0, 0],
          devkit: {
            mouseXRaw: 0,
            mouseYRaw: 0,
            mouseButtons: 0,
            wheelRaw: 0,
            movementXRaw: 0,
            movementYRaw: 0,
            keypresses: [],
          },
        },
      });
    const name = `route-${route.id}-call-${String(n).padStart(3, "0")}.png`;
    await writeFile(new URL(name, out), png(last.observation.frame.rgba));
    frames.push({ call: n, file: name, outcome: last.outcome });
  }
  await s.dispose();
  report.finalRouteReplay = {
    run: route.id,
    calls: route.calls.length,
    frames,
  };
}
await writeFile(new URL("report.json", out), redact(report));
await writeFile(new URL("final.p8", out), cartText(report.runs.at(-1).after));
log(`archive ${out.pathname}`);
process.exit(0);
