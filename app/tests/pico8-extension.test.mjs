import test from "node:test";
import assert from "node:assert/strict";
import { Agent } from "./helpers/knowledge.mjs";
import { knowledge, index, load } from "./helpers/knowledge.mjs";
import { createPico8Extension } from "../src/pico8/extension.js";
import { defaultConfig } from "../src/model-config.js";
import { compactTranscript } from "../src/project-store.js";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const response = (delta, reason) =>
  new Response(
    `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
test("references are English, complete, bounded and isolated", async () => {
  let calls = 0;
  const ext = createPico8Extension({
    game: {
      execute() {
        calls++;
      },
    },
    knowledge,
  });
  const tool = ext.tools.find((t) => t.name === "read");
  for (const file of Object.keys(index.files)) {
    const r = await tool.execute({ path: "/extensions/pico8/" + file }, {}, {});
    assert.equal(r.isError, undefined, file);
    assert.ok(r.output[0].text.length > 0);
    assert.ok(!/[\u3400-\u9fff]/u.test(r.output[0].text));
  }
  assert.equal(calls, 0);
  await assert.rejects(() => tool.execute({ path: "/etc/passwd" }, {}, {}));
  const c = new AbortController();
  c.abort();
  await assert.rejects(() =>
    tool.execute(
      { path: "/extensions/pico8/references/audio.md" },
      {},
      { abortSignal: c.signal },
    ),
  );
});
test("actual provider requests replace legacy rules and preserve references across restore without replay", async (t) => {
  const bodies = [];
  let gameCalls = 0;
  let saved;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const system = body.messages
      .filter((m) => m.role === "system")
      .map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      )
      .join("\n");
    assert.ok(system.includes("PICO-8 game author"));
    assert.ok(system.includes("16.16"));
    assert.ok(system.includes("bright green"));
    assert.ok(system.includes("references/game-design.md"));
    assert.ok(!system.includes("## Observed implementation"));
    assert.ok(!system.includes("LEGACY_JUMP_ONLY"));
    assert.equal(body.tools.length, 7);
    assert.ok(body.tools.some((t) => t.function.name === "edit"));
    assert.ok(body.tools.some((t) => t.function.name === "read"));
    if (bodies.length === 1)
      return response(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "ref-1",
              type: "function",
              function: {
                name: "read",
                arguments:
                  '{"path":"/extensions/pico8/games/lantern-vault.lua"}',
              },
            },
          ],
        },
        "tool_calls",
      );
    assert.ok(
      body.messages.some(
        (m) =>
          m.role === "tool" &&
          String(m.content).includes("function blocked(x,y)"),
      ),
    );
    return response(
      { role: "assistant", content: "Reference checked." },
      "stop",
    );
  });
  const game = {
    execute() {
      gameCalls++;
      throw Error("No game side effects");
    },
    cancelTests() {},
  };
  const old = [
    {
      role: "system",
      content: "",
      sections: { instructions: "LEGACY_JUMP_ONLY" },
      timestamp: 1,
    },
    { role: "user", content: "Make a turn-based game", timestamp: 2 },
  ];
  const a = new Agent(game, () => {});
  try {
    await a.open(old);
    assert.equal(bodies.length, 0);
    await a.configure({ ...defaultConfig, apiKey: "fixture" });
    await a.send("Read the vault microgame recipe.");
    assert.equal(bodies.length, 2);
    saved = compactTranscript([...a.transcriptEntries.values()]);
  } finally {
    await a.dispose();
  }
  const b = new Agent(game, () => {});
  try {
    await b.open(saved);
    assert.equal(bodies.length, 2);
    await b.configure({ ...defaultConfig, apiKey: "fixture" });
    await b.send("Continue.");
    assert.equal(bodies.length, 3);
    assert.equal(gameCalls, 0);
  } finally {
    await b.dispose();
  }
});

test("Pi delivers complete full/cropped ASCII and restores it without replaying game operations", async (t) => {
  const { createPico8Session } =
    await import("../public/player/main/player.mjs");
  const { Game } = await import("../src/game.js");
  const { observationOptions, observationText } =
    await import("../src/pico8/observation.js");
  const session = await createPico8Session();
  t.after(() => session.dispose());
  await session.loadSource(`function _draw()
    cls(0) pal(8,136,1)
    for y=0,127 do for x=0,127 do pset(x,y,(x+y)%16) end end
  end`);
  await session.advance({ frames: 1 });
  const crop = { format: "ascii", region: { x: 1, y: 3, width: 7, height: 5 } };
  const expectedFull = observationText(
    session.observe(),
    observationOptions({ format: "ascii" }),
  );
  const expectedCrop = observationText(
    session.observe(),
    observationOptions(crop),
  );
  assert.ok(
    Buffer.byteLength(expectedFull) > 16384,
    "exercise the old reference-size boundary",
  );
  let reads = 0;
  let requests = 0;
  let saved;
  const game = new Game(() => {});
  game.ensureWorker = async () => {};
  game.player = { pause: async () => {} };
  game.rpc = async (action) => {
    reads++;
    assert.equal(action, "observe");
    return session.observe();
  };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    requests++;
    const tool = body.tools.find(
      (t) => t.function.name === "observe_game",
    ).function;
    assert.deepEqual(tool.parameters.properties.format.enum, [
      "png",
      "ascii",
      "both",
    ]);
    assert.equal(tool.parameters.properties.region.additionalProperties, false);
    const system = JSON.stringify(
      body.messages.filter((m) => m.role === "system"),
    );
    assert.ok(system.includes("Historical frames are past evidence"));
    assert.ok(!system.includes("no ASCII"));
    const resultText = body.messages
      .filter((m) => m.role === "tool")
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n"),
      );
    if (requests > 1)
      assert.ok(
        resultText.includes(expectedFull),
        "full grid, legend and identity reach the provider intact",
      );
    if (requests > 2) assert.ok(resultText.includes(expectedCrop));
    if (requests < 3)
      return response(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `ascii-${requests}`,
              type: "function",
              function: {
                name: "observe_game",
                arguments: JSON.stringify(
                  requests === 1 ? { format: "ascii" } : crop,
                ),
              },
            },
          ],
        },
        "tool_calls",
      );
    return response(
      { role: "assistant", content: "Fixture: observation inspected." },
      "stop",
    );
  });
  const first = new Agent(game, () => {});
  try {
    await first.open();
    await first.configure({ ...defaultConfig, apiKey: "fixture" });
    await first.send("Inspect full pixels, then crop.");
    assert.equal(requests, 3);
    assert.equal(reads, 2);
    saved = compactTranscript([...first.transcriptEntries.values()]);
    assert.ok(JSON.stringify(saved).includes("pico8-slots-v1"));
  } finally {
    await first.dispose();
  }
  const restored = new Agent(game, () => {});
  try {
    await restored.open(saved);
    assert.equal(reads, 2);
    assert.equal(requests, 3);
    await restored.configure({ ...defaultConfig, apiKey: "fixture" });
    await restored.send("Review the historical evidence.");
    assert.equal(requests, 4);
    assert.equal(reads, 2, "restoring transcript must not replay observations");
  } finally {
    await restored.dispose();
  }
});

test("design references resolve and knowledge compilation rejects stale microgame receipts", async (t) => {
  for (const file of Object.keys(index.files)) {
    const text = await load(file);
    for (const [path] of text.matchAll(
      /\/extensions\/pico8\/[A-Za-z0-9_./-]+\.(?:md|lua)/g,
    )) {
      assert.ok(
        index.files[path.slice("/extensions/pico8/".length)],
        `${file} links to missing ${path}`,
      );
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "pico8-knowledge-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const docs = join(dir, "docs/pico8-agent");
  const script = join(dir, "app/scripts/prepare-knowledge.mjs");
  await cp(new URL("../../docs/pico8-agent/", import.meta.url), docs, {
    recursive: true,
  });
  await mkdir(join(dir, "app/scripts"), { recursive: true });
  await cp(
    new URL("../scripts/prepare-knowledge.mjs", import.meta.url),
    script,
  );
  const compile = () =>
    spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(compile().status, 0, "fresh receipts compile");
  const source = join(docs, "games/lantern-vault.lua");
  const original = await readFile(source, "utf8");
  await writeFile(source, original + "\n-- unverified change\n");
  let result = compile();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unverified recipe recipe\/lantern-vault/);
  await writeFile(source, original);
  const path = join(docs, "games/validation-results.json");
  const receipts = JSON.parse(await readFile(path, "utf8"));
  receipts.checks.find(
    (c) => c.name === "lantern-vault: original Lua and exported cart",
  ).passed = false;
  await writeFile(path, JSON.stringify(receipts));
  result = compile();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unverified recipe recipe\/lantern-vault/);
});
