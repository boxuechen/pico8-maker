import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Agent } from "./helpers/knowledge.mjs";
import { knowledge, index, load } from "./helpers/knowledge.mjs";
import { createPico8Extension } from "../src/pico8/extension.js";
import { createKnowledgeFiles } from "../src/pico8/knowledge-files.js";
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
test(
  "Pi advertises skill metadata and reads only the selected SKILL.md on demand",
  { timeout: 10000 },
  async (t) => {
    const loaded = [];
    const docs = createKnowledgeFiles({
      load: async (file) => {
        loaded.push(file);
        return load(file);
      },
    });
    let requests = 0;
    const path = "/extensions/pico8/skills/pico8-edit/SKILL.md";
    const expected = await load("skills/pico8-edit/SKILL.md");
    const bodies = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (++requests === 1)
        return response(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "skill-1",
                type: "function",
                function: { name: "read", arguments: JSON.stringify({ path }) },
              },
            ],
          },
          "tool_calls",
        );
      return response(
        { role: "assistant", content: "Editing workflow read." },
        "stop",
      );
    });
    const a = new Agent(
      {
        execute() {
          throw Error("Reading a skill must not run the game");
        },
        cancelTests() {},
      },
      () => {},
      { knowledge: docs },
    );
    t.after(() => a.dispose());
    await a.open();
    assert.ok(!loaded.some((file) => file.startsWith("skills/")));
    await a.configure({ ...defaultConfig, apiKey: "fixture" });
    await a.send("Read the editing skill before changing a coin animation.");
    assert.equal(requests, 2);
    const system = JSON.stringify(
      bodies[0].messages.filter((m) => m.role === "system"),
    );
    for (const name of [
      "pico8-create",
      "pico8-edit",
      "pico8-assets",
      "pico8-playtest",
    ])
      assert.ok(system.includes(`/skills/${name}/SKILL.md`));
    assert.ok(
      !system.includes("Identify the smallest change and reproduce"),
      "skill bodies are not permanent system sections",
    );
    assert.ok(
      bodies[1].messages.some(
        (m) => m.role === "tool" && m.content === expected,
      ),
      "full original skill reaches the model through read",
    );
    assert.deepEqual(
      loaded.filter((file) => file.startsWith("skills/")),
      ["skills/pico8-edit/SKILL.md"],
    );
  },
);
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
    assert.ok(system.includes("## Completion"));
    assert.ok(
      system.includes(
        "Once the requested behavior and relevant checks pass, stop calling tools",
      ),
    );
    assert.ok(system.includes("Repeated attempts without new evidence"));
    assert.ok(system.includes("16.16"));
    assert.ok(system.includes("bright green"));
    assert.ok(system.includes("/extensions/pico8/REFERENCE_INDEX.md"));
    assert.ok(!system.includes("references/game-design.md"));
    assert.ok(!system.includes("## Observed implementation"));
    assert.ok(!system.includes("LEGACY_JUMP_ONLY"));
    assert.ok(!system.includes("LEGACY_KEEP_PLAYTESTING_FOREVER"));
    assert.equal(body.tools.length, 9);
    assert.ok(!body.tools.some((t) => t.function.name === "read_game"));
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
      sections: {
        instructions: "LEGACY_JUMP_ONLY",
        pico8_agent: "LEGACY_KEEP_PLAYTESTING_FOREVER",
      },
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

test(
  "a long tool sequence ends on the model's final reply and accepts another request",
  { timeout: 15000 },
  async (t) => {
    let requests = 0;
    let gameCalls = 0;
    const views = [];
    let finished;
    const idle = new Promise((resolve) => {
      finished = resolve;
    });
    t.mock.method(globalThis, "fetch", async () => {
      requests++;
      // Beyond the former 24-round cap: completion belongs to the model.
      if (requests <= 26)
        return response(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `step-${requests}`,
                type: "function",
                function: {
                  name: "press_buttons",
                  arguments: "{\"steps\":[{\"frames\":1,\"buttons\":0}]}",
                },
              },
            ],
          },
          "tool_calls",
        );
      return response(
        { role: "assistant", content: "Done. Controls and checks reported." },
        "stop",
      );
    });
    const a = new Agent(
      {
        execute() {
          gameCalls++;
          return {
            output: [{ type: "text", text: `Observed frame ${gameCalls}.` }],
          };
        },
        cancelTests() {},
      },
      (view) => {
        views.push(view);
        if (
          !view.isRunning &&
          JSON.stringify(view.messages).includes("Controls and checks reported")
        )
          finished();
      },
    );
    t.after(() => a.dispose());
    await a.open();
    await a.configure({ ...defaultConfig, apiKey: "fixture" });
    await a.send("Create and check a game.");
    await idle;
    assert.equal(requests, 27);
    assert.equal(gameCalls, 26);
    assert.equal(views.at(-1).isRunning, false);
    assert.equal(views.at(-1).error, null);
    await a.send("Explain the controls without changing the game.");
    assert.equal(requests, 28, "no automatic follow-up after a final reply");
    assert.equal(gameCalls, 26);
  },
);

test(
  "STOP interrupts an active playtest and settles the submission",
  { timeout: 10000 },
  async (t) => {
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let cancelled = 0;
    let finished;
    const idle = new Promise((resolve) => {
      finished = resolve;
    });
    t.mock.method(globalThis, "fetch", async () =>
      response(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "pending-input",
              type: "function",
              function: {
                name: "press_buttons",
                arguments: "{\"steps\":[{\"frames\":600,\"buttons\":2}]}",
              },
            },
          ],
        },
        "tool_calls",
      ),
    );
    const a = new Agent(
      {
        execute(_name, _args, signal) {
          return new Promise((_resolve, reject) => {
            signal.throwIfAborted();
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
            entered();
          });
        },
        cancelTests() {
          cancelled++;
        },
      },
      (view) => {
        if (cancelled && !view.isRunning) finished();
      },
    );
    t.after(() => a.dispose());
    await a.open();
    await a.configure({ ...defaultConfig, apiKey: "fixture" });
    const submission = a.send("Playtest the game.");
    // Observe rejection immediately, even if cancellation settles before abort returns.
    const settled = Promise.allSettled([submission]);
    await started;
    await a.abort();
    await settled;
    await idle;
    assert.equal(cancelled, 1);
  },
);

test("Pi delivers complete full/cropped ASCII and restores it without replaying game operations", async (t) => {
  const { createPico8Session } =
    await import("../public/player/main/player.mjs");
  const { Game } = await import("../src/game.js");
  const { observationOptions, observationText } =
    await import("../src/pico8/observation.js");
  const session = await createPico8Session();
  t.after(() => session.dispose());
  const source = `function _draw()
    cls(0) pal(8,136,1)
    for y=0,127 do for x=0,127 do pset(x,y,(x+y)%16) end end
  end`;
  await session.loadSource(source);
  await session.advance({ frames: 1 });
  const crop = { format: "ascii", region: { x: 1, y: 3, width: 7, height: 5 } };
  const game = new Game(() => {}, { versions: [emptySnapshot(source)] });
  const expectedFull = observationText(
    { ...session.observe(), cart: game.cartStatus("committed") },
    observationOptions({ format: "ascii" }),
  );
  const expectedCrop = observationText(
    { ...session.observe(), cart: game.cartStatus("committed") },
    observationOptions(crop),
  );
  assert.ok(
    Buffer.byteLength(expectedFull) > 16384,
    "exercise the old reference-size boundary",
  );
  let reads = 0;
  let requests = 0;
  let saved;
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
    assert.ok(
      system.includes("Establish fresh evidence after restoring a session"),
    );
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
  const skillPath = join(docs, "skills/pico8-create/SKILL.md");
  const skill = await readFile(skillPath, "utf8");
  await writeFile(
    skillPath,
    skill.replace("name: pico8-create", "name: invalid-name"),
  );
  let invalid = compile();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Invalid skill metadata/);
  await writeFile(
    skillPath,
    skill + "\nRead /extensions/pico8/skills/missing/SKILL.md\n",
  );
  invalid = compile();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown documentation link/);
  await writeFile(skillPath, skill);
  const source = join(docs, "games/lantern-vault.lua");
  const original = await readFile(source, "utf8");
  await writeFile(source, original + "\n-- unverified change\n");
  let result = compile();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unverified recipe games\/lantern-vault\.lua/);
  await writeFile(source, original);
  const path = join(docs, "games/validation-results.json");
  const receipts = JSON.parse(await readFile(path, "utf8"));
  receipts.checks.find(
    (c) => c.name === "lantern-vault: original Lua and exported cart",
  ).passed = false;
  await writeFile(path, JSON.stringify(receipts));
  result = compile();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unverified recipe games\/lantern-vault\.lua/);
});

test("agent sends high/low/off thinking, uses model output capacity and retries transient failures", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1)
      return Response.json(
        { error: { message: "temporarily unavailable" } },
        { status: 503 },
      );
    return response({ role: "assistant", content: "Done." }, "stop");
  });
  const a = new Agent({ cancelTests() {} }, () => {});
  t.after(() => a.dispose());
  await a.open();
  await a.configure({ ...defaultConfig, apiKey: "fixture" });
  await a.send("Say done");
  assert.equal(bodies.length, 2, "Pi retries one transient provider failure");
  assert.equal(bodies[1].thinking.type, "enabled");
  assert.equal(bodies[1].reasoning_effort, "high");
  assert.ok(bodies[1].max_tokens > 12000);
  for (const level of ["low", "off"]) {
    await a.configure({
      ...defaultConfig,
      apiKey: "fixture",
      thinkingLevel: level,
    });
    await a.send("Say done again");
    assert.equal(
      bodies.at(-1).thinking.type,
      level === "off" ? "disabled" : "enabled",
    );
    if (level !== "off") assert.equal(bodies.at(-1).reasoning_effort, level);
  }
});
