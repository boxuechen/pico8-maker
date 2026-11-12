import {
  mkdir,
  readFile,
  writeFile,
  appendFile,
  access,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import {
  Harness,
  MemoryStorage,
  createRegistry,
} from "@earendil-works/pi-durable";
import { createPico8Extension } from "../../src/pico8/extension.js";
import { createConnection } from "../../src/model-config.js";
import { cartText } from "../../src/pico8/cart.js";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { EvaluationGame, RunBudget, sha, png, blankSource } from "./core.mjs";
import { root, freezePacks } from "./packs.mjs";
const args = process.argv.slice(2),
  arg = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
const dir = resolve(
  arg(
    "--out",
    join(
      root,
      ".cache/evaluations",
      new Date().toISOString().replace(/[:.]/g, "-"),
    ),
  ),
);
await mkdir(dir, { recursive: true });
try {
  await access(join(dir, "plan.json"));
  throw Error(
    "Output directory already contains a plan; choose a new directory to preserve attempts.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const packs = await freezePacks(dir);
const tasks = JSON.parse(
  await readFile(
    join(root, "docs/pico8-agent/research/evaluation-tasks.json"),
    "utf8",
  ),
).tasks;
const limits = {
  tokens: Number(arg("--tokens", "200000")),
  tools: 80,
  milliseconds: 12 * 60 * 1000,
};
const repetitions = Number(arg("--repetitions", "1"));
const spec = {
  provider: "deepseek",
  model: "deepseek-flash",
  baseUrl: "https://api.deepseek.com",
};
const plans = [];
for (let repeat = 1; repeat <= repetitions; repeat++)
  for (const task of tasks) {
    const conditions = randomInt(2) ? ["A", "B"] : ["B", "A"];
    for (const condition of conditions)
      plans.push({
        id: randomUUID().slice(0, 8),
        task: task.id,
        condition,
        repeat,
        prompt: task.prompt,
      });
  }
const fingerprintFiles = [
  "app/scripts/evaluation/run.mjs",
  "app/scripts/evaluation/core.mjs",
  "app/scripts/evaluation/packs.mjs",
  "app/src/game.js",
  "app/src/pico8/extension.js",
  "app/src/model-config.js",
  "app/src/pico8/observation.js",
  "app/public/player/main/player.mjs",
  "app/public/player/wasm/z8lua-runtime-v1.wasm",
];
const fingerprints = Object.fromEntries(
  await Promise.all(
    fingerprintFiles.map(async (p) => [p, sha(await readFile(join(root, p)))]),
  ),
);
const plan = {
  createdAt: new Date().toISOString(),
  status: "prepared",
  config: spec,
  limits,
  repetitions,
  concurrency: 2,
  thinkingLevel: "off",
  temperature: "provider default",
  seed: null,
  tools: 6,
  referenceSchema:
    "identical string ID schema for both arms; reference IDs only in condition-specific index",
  initialSourceSha256: sha(blankSource),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  fingerprints,
  packs: Object.fromEntries(
    Object.entries(packs).map(([k, v]) => [
      k,
      {
        revision: v.revision,
        version: v.pack.version,
        bundleSha256: v.bundleSha256,
        references: Object.keys(v.pack.references).length,
      },
    ]),
  ),
  tokenAccounting:
    "Provider-reported cumulative input + output + cache tokens. Checked on streaming usage and before next request/tool; input usage may arrive after a request is admitted. Any overshoot is explicitly reported. Per-response output capped at remaining budget and 12000.",
  costAccounting:
    "Pi catalog estimates, not billing receipts; raw provider usage is archived.",
  runs: plans,
};
await writeFile(join(dir, "plan.json"), JSON.stringify(plan, null, 2));
console.log("Prepared", plans.length, "runs at", dir);
if (args.includes("--prepare-only")) process.exit(0);
let apiKey = process.env.DEEPSEEK_API_KEY;
if (args.includes("--key-stdin")) {
  console.log("Waiting for API credential on stdin (do not echo or persist)");
  const rl = createInterface({ input: process.stdin, terminal: false });
  apiKey = await new Promise((r) =>
    rl.once("line", (line) => {
      rl.close();
      process.stdin.pause();
      r(line.trim());
    }),
  );
}
if (!apiKey) throw Error("DEEPSEEK_API_KEY or --key-stdin is required");
const redact = (value) =>
  JSON.stringify(value, (_, v) =>
    typeof v === "string" ? v.replaceAll(apiKey, "[REDACTED]") : v,
  );
// Record a real server model-list receipt without credentials or response headers.
const listing = await fetch(spec.baseUrl + "/models", {
  headers: { Authorization: "Bearer " + apiKey },
  signal: AbortSignal.timeout(30000),
});
const catalog = await listing.json();
await writeFile(
  join(dir, "model-list.json"),
  redact({
    at: new Date().toISOString(),
    status: listing.status,
    body: catalog,
  }),
);
if (!listing.ok || !catalog.data?.some((m) => m.id === spec.model))
  throw Error("Requested model unavailable; no benchmark generation started");
console.log(
  "Model confirmed:",
  catalog.data.find((m) => m.id === spec.model).name ?? spec.model,
);
plan.status = "running";
await writeFile(join(dir, "plan.json"), JSON.stringify(plan, null, 2));
async function run(item) {
  const folder = join(dir, item.id);
  await mkdir(folder, { recursive: true });
  const budget = new RunBudget(limits),
    controller = new AbortController();
  let rootConversation,
    harness,
    requests = 0,
    terminalError = null,
    lastFailure = null;
  const abort = (reason) => {
    budget.reason ??= reason;
    controller.abort();
    void rootConversation?.abort(context).catch(() => {});
  };
  const timer = setTimeout(() => abort("time_budget"), limits.milliseconds);
  const log = async (event) => {
    await appendFile(
      join(folder, "events.jsonl"),
      redact({ at: new Date().toISOString(), ...event }) + "\n",
    );
  };
  const game = new EvaluationGame((source, revision) => {
    pending.push(writeFile(join(folder, `version-${revision}.lua`), source));
  });
  const pending = [];
  const ext = createPico8Extension({
    game,
    knowledge: packs[item.condition].pack,
  });
  ext.tools = ext.tools.map((tool) => ({
    ...tool,
    parameters:
      tool.name === "read_reference"
        ? { ...tool.parameters, properties: { id: { type: "string" } } }
        : tool.parameters,
    execute: async (a, api, ctx) => {
      try {
        budget.tool();
      } catch (e) {
        abort(budget.reason ?? "budget");
        throw e;
      }
      const number = budget.toolCalls;
      await log({ type: "tool_start", number, name: tool.name, args: a });
      let result;
      try {
        result = await tool.execute(a, api, ctx);
      } catch (e) {
        await log({ type: "tool_error", number, error: String(e.message) });
        throw e;
      }
      for (const [i, p] of (result.output ?? []).entries())
        if (p.type === "image")
          await writeFile(
            join(folder, `tool-${number}-${i}.png`),
            Buffer.from(p.data, "base64"),
          );
      await log({ type: "tool_result", number, name: tool.name, result });
      console.log(
        item.id,
        item.condition,
        item.task,
        "tool",
        number,
        tool.name,
        result.isError ? "ERROR" : "ok",
      );
      return result;
    },
  }));
  const { model, provider } = createConnection({ ...spec, apiKey });
  function stream(method, m, transcript, options = {}) {
    const out = createAssistantMessageEventStream();
    void (async () => {
      const n = ++requests;
      let lastServerModel;
      try {
        budget.check();
        await writeFile(
          join(folder, `request-${n}-context.json`),
          redact(transcript),
        );
        const signal = options.signal
          ? AbortSignal.any([options.signal, controller.signal])
          : controller.signal;
        const s = provider[method](m, transcript, {
          ...options,
          signal,
          maxTokens: Math.max(
            1,
            Math.min(12000, limits.tokens - budget.tokens),
          ),
          timeoutMs: Math.min(
            120000,
            Math.max(1, limits.milliseconds - (Date.now() - budget.started)),
          ),
          maxRetries: 0,
          onPayload: async (payload) => {
            await writeFile(
              join(folder, `request-${n}-payload.json`),
              redact(payload),
            );
          },
          onResponse: async (r) =>
            log({ type: "http_response", request: n, status: r.status }),
          onProviderStreamEvent: async (e) => {
            // Keep usage and reported server model only; no HTTP headers/secrets.
            if (e.usage || (e.model && e.model !== lastServerModel))
              await log({
                type: "provider_metadata",
                request: n,
                model: e.model,
                usage: e.usage,
                system_fingerprint: e.system_fingerprint,
              });
            lastServerModel = e.model ?? lastServerModel;
          },
        });
        for await (const event of s) {
          if (event.type === "done" || event.type === "error") {
            const response = event.message ?? event.error;
            budget.usage(response.usage);
            await writeFile(
              join(folder, `response-${n}.json`),
              redact(response),
            );
            await log({
              type: "response",
              request: n,
              stopReason: response.stopReason,
              usage: response.usage,
            });
          } else if (
            event.partial?.usage?.totalTokens &&
            budget.tokens + event.partial.usage.totalTokens >= limits.tokens
          ) {
            abort("token_budget");
          }
          out.push(event);
        }
        out.end(await s.result());
      } catch (e) {
        terminalError = String(e.message).replaceAll(apiKey, "[REDACTED]");
        const error = {
          role: "assistant",
          content: [],
          api: m.api,
          provider: m.provider,
          model: m.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "error",
          errorMessage: terminalError,
          timestamp: Date.now(),
        };
        out.push({ type: "error", reason: "error", error });
        out.end(error);
      }
    })();
    return out;
  }
  const models = createModels();
  models.setProvider({
    ...provider,
    stream: (...a) => stream("stream", ...a),
    streamSimple: (...a) => stream("streamSimple", ...a),
  });
  try {
    const registry = createRegistry();
    registry.install(ext);
    harness = await Harness.open(
      new MemoryStorage(),
      {
        models,
        registry,
        settings: () => ({
          retry: { maxRetries: 0 },
          compaction: { enabled: false },
          toolExecution: "sequential",
        }),
      },
      context,
    );
    rootConversation = await harness.root(context, {
      agent: {
        extensions: [ext],
        model: { provider: model.provider, modelId: model.id },
        thinkingLevel: "off",
        maxTurns: 80,
      },
    });
    const submission = await rootConversation.submit(
      { type: "input", content: item.prompt },
      context,
    );
    await submission.wait(context);
    const view = await rootConversation.context(context);
    await writeFile(join(folder, "transcript.json"), redact(view));
    const watch = await rootConversation.watch(context);
    lastFailure = watch.value.docs?.["pi.live"]?.runFailure ?? null;
    await watch.stop();
    await writeFile(
      join(folder, "usage.json"),
      redact(await harness.usage(context)),
    );
  } catch (e) {
    terminalError = String(e.message).replaceAll(apiKey, "[REDACTED]");
  } finally {
    clearTimeout(timer);
    await Promise.all(pending);
    const final = game.source;
    await writeFile(join(folder, "final.lua"), final);
    await writeFile(
      join(folder, "final.p8"),
      cartText(final, game.testFrame?.rgba),
    );
    const checks = { createdGame: final !== blankSource };
    if (checks.createdGame) {
      const s = await createPico8Session();
      try {
        const loaded = await s.loadCart(
          new TextEncoder().encode(cartText(final)),
        );
        checks.exportLoad = loaded.state === "ready";
        checks.diagnostics = loaded.diagnostics;
        if (checks.exportLoad) {
          const advanced = await s.advance({ frames: 120 });
          checks.idle120 = advanced.outcome === "completed";
          checks.diagnostics = advanced.observation.diagnostics;
          if (advanced.observation.frame)
            await writeFile(
              join(folder, "idle.png"),
              png(advanced.observation.frame.rgba),
            );
        }
      } catch (e) {
        checks.error = String(e.message);
      } finally {
        await s.dispose();
      }
    }
    const result = {
      ...item,
      promptSha256: sha(item.prompt),
      packVersion: packs[item.condition].pack.version,
      model: spec.model,
      finishedAt: new Date().toISOString(),
      budget: budget.snapshot(),
      requests,
      terminalError,
      lastFailure,
      sourceSha256: sha(final),
      sourceBytes: Buffer.byteLength(final),
      checks,
    };
    await writeFile(join(folder, "result.json"), redact(result));
    await harness?.close(context);
    await game.dispose();
    console.log(
      "FINISHED",
      item.id,
      item.condition,
      item.task,
      "tokens",
      budget.tokens,
      "tools",
      budget.toolCalls,
      "game",
      checks.createdGame,
      "stop",
      budget.reason ?? lastFailure?.reason ?? terminalError ?? "complete",
    );
    return result;
  }
}
const results = [];
let cursor = 0;
await Promise.all(
  [0, 1].map(async () => {
    while (cursor < plans.length) {
      const item = plans[cursor++];
      results.push(await run(item));
      await writeFile(join(dir, "results.json"), redact(results));
    }
  }),
);
plan.status = "completed";
plan.finishedAt = new Date().toISOString();
await writeFile(join(dir, "plan.json"), JSON.stringify(plan, null, 2));
console.log("All", results.length, "runs finished. Artifacts:", dir);
