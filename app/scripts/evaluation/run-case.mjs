// Headless rerun of a retained two-turn case study (Sweet Garden / Lodge Podge)
// with the production Agent, tools, p8 Worker and test Worker protocol. Only the
// browser transport and PNG encoding are replaced (EvaluationGame). Uses a
// disposable cart; never touches the user's library.
//
//   DEEPSEEK_API_KEY=... node scripts/evaluation/run-case.mjs --case garden
//
// The key is read from the environment only and redacted from the archive.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cartBytes, cartText } from "../../src/pico8/cart.js";
import { defaultConfig } from "../../src/model-config.js";
import { inputPlan } from "../../src/pico8/input-sequence.js";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { runConversation } from "./conversation.mjs";
import { png } from "./png.mjs";
import { resultReplay } from "./result-replay.mjs";

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
// --model deepseek-v4-pro runs another DeepSeek model with the same prompts and limits.
const config = { ...defaultConfig, ...(arg("model") ? { model: arg("model") } : {}) };
if (!spec) throw Error("--case garden|lodge is required");
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw Error("DEEPSEEK_API_KEY is required");
const millisecondsPerTurn = 900000; // Same per-turn limit as the baseline; no tool cap.
const id = crypto.randomUUID();
const out = new URL(
  `../../../.cache/evaluations/case-${spec.slug}-${id}/`,
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

const report = {
  schemaVersion: 1,
  suite: `${spec.slug}-case-rerun`,
  id,
  startedAt: new Date().toISOString(),
  model: {
    provider: config.provider,
    model: config.model,
    thinkingLevel: config.thinkingLevel,
  },
  limits: { millisecondsPerTurn, toolCalls: null },
  runs: [],
};
const result = await runConversation({
  title: `${spec.slug} rerun`,
  prompts: spec.prompts,
  config,
  apiKey,
  millisecondsPerTurn,
  log,
  afterTurn: async (run, game) => {
    report.runs.push(run);
    await writeFile(new URL("report.json", out), redact({ ...report, playtests: game.playtests.runs }));
    await writeFile(new URL(`${run.id}.p8`, out), cartText(run.after));
  },
});
report.playtests = result.playtests;
report.revisions = result.revisions;

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
// Did normal play on the final version reach a win, a loss and a restart (g.mode)?
report.resultReplay = await resultReplay(report.runs.at(-1).after, report.playtests, report.runs.at(-1).revision);
log(`result replay: ${report.resultReplay.summary}`);
await writeFile(new URL("report.json", out), redact(report));
await writeFile(new URL("final.p8", out), cartText(report.runs.at(-1).after));
log(`archive ${out.pathname}`);
process.exit(0);
