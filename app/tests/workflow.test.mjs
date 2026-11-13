import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { TestGame } from "./helpers/game.mjs";
import { Agent, load, index } from "./helpers/knowledge.mjs";
import { createKnowledgeFiles } from "../src/pico8/knowledge-files.js";
import { defaultConfig } from "../src/model-config.js";
import { compactTranscript } from "../src/project-store.js";

const machine = await readFile(
  new URL("../../docs/pico8-agent/MACHINE.md", import.meta.url),
  "utf8",
);
const blocks = [...machine.matchAll(/```lua\n([\s\S]*?)\n```/g)];
assert.equal(blocks.length, 1, "one executable reset skeleton is published");
const source = blocks[0][1];
const head = (r) => JSON.parse(r.output[0].text.split("\n")[0]);
const read = async (g) =>
  head(
    await g.execute("inspect_game", {
      mode: "read",
      paths: [
        ["g", "mode"],
        ["g", "player", "x"],
        ["g", "score"],
        ["g", "progress"],
        ["g", "entities"],
      ],
    }),
  ).values;
const press = (g, frames, buttons, tap = false) =>
  g.execute("press_buttons", { steps: [{ frames, buttons, tap }] });

test("published reset skeleton wins, loses and recreates every round field in real WASM", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  const loaded = await g.execute("load_game", { source });
  assert.equal(loaded.isError, false);
  const initial = await read(g);
  assert.deepEqual(initial.slice(0, 4), ["play", 8, 0, 0]);
  assert.equal(initial[4].entries.length, 3);
  await press(g, 47, 2);
  const won = await read(g);
  assert.deepEqual(won.slice(0, 4), ["win", 102, 3, 1]);
  assert.equal(won[4].entries.length, 0);
  await press(g, 1, 16, true);
  assert.deepEqual(await read(g), initial);
  await press(g, 5, 1);
  assert.equal((await read(g))[0], "lose");
  await press(g, 1, 16, true);
  assert.deepEqual(await read(g), initial);
  assert.equal(g.playtests.active.purpose, "normal");
  // Extra/mutated round fields must disappear too, rather than only resetting a score.
  await g.execute("inspect_game", {
    mode: "debug",
    code: 'previous_g=g; best_score=99; g.mode="lose"; g.timer=77; g.player.stale=true; g.entities[1].x=1',
  });
  await press(g, 1, 16, true);
  assert.deepEqual(await read(g), initial);
  const extra = head(
    await g.execute("inspect_game", {
      mode: "debug",
      code: "return g==previous_g,g.timer,g.player.stale,best_score",
    }),
  ).values;
  assert.deepEqual(extra, [false, { type: "nil" }, { type: "nil" }, 99]);
});

const response = (delta, reason = "stop") =>
  new Response(
    `data: ${JSON.stringify({ id: "workflow-fixture", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
const systemText = (body) =>
  body.messages
    .filter((m) => m.role === "system")
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : m.content.map((p) => p.text ?? "").join("\n"),
    )
    .join("\n");

test(
  "full ordered Workflow survives real compaction/restore and can start with authoring instead of document reads",
  { timeout: 15000 },
  async (t) => {
    const fetched = [],
      bodies = [],
      operations = [];
    const docs = createKnowledgeFiles({
      load: async (file) => {
        fetched.push(file);
        return load(file);
      },
    });
    const game = new TestGame();
    const execute = game.execute.bind(game);
    game.execute = (name, ...args) => {
      operations.push(name);
      return execute(name, ...args);
    };
    let project = "PROJECT_FIRST",
      compacting = false,
      next = 0;
    const route = [
      ["load_game", { source }],
      ["press_buttons", { steps: [{ frames: 47, buttons: 2 }] }],
      [
        "inspect_game",
        {
          mode: "read",
          paths: [
            ["g", "mode"],
            ["g", "score"],
          ],
        },
      ],
      ["press_buttons", { steps: [{ frames: 1, buttons: 16, tap: true }] }],
      [
        "inspect_game",
        {
          mode: "read",
          paths: [
            ["g", "mode"],
            ["g", "score"],
          ],
        },
      ],
    ];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push({ body, compacting });
      if (compacting)
        return response({
          role: "assistant",
          content:
            "SUMMARY: the final cart collected three targets, won and retried through normal input.",
        });
      const call = route[next++];
      if (call)
        return response(
          {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `workflow-${next}`,
                type: "function",
                function: { name: call[0], arguments: JSON.stringify(call[1]) },
              },
            ],
          },
          "tool_calls",
        );
      return response({
        role: "assistant",
        content:
          "Gameplay: collect three targets.\nControls: arrows and O.\nVerified: normal win and retry.\nUnverified: none in this fixture.",
      });
    });
    let agent = new Agent(game, () => {}, {
      knowledge: docs,
      projectContext: () => `# Project\n${project}`,
    });
    t.after(async () => {
      await agent.dispose();
      await game.dispose();
    });
    await agent.open();
    await agent.configure({ ...defaultConfig, apiKey: "fixture" });
    await agent.send("Create and verify the small reset-skeleton game.");
    assert.deepEqual(
      operations,
      route.map(([name]) => name),
    );
    assert.equal(game.playtests.active.purpose, "normal");
    assert.equal((await read(game))[0], "play");
    assert.deepEqual(fetched, Object.values(index.sections));
    const beforeCount = operations.length;
    compacting = true;
    await agent.root.configure(
      { compaction: { keepRecentTokens: 1 } },
      context,
    );
    const task = await agent.root.compact(undefined, context);
    await agent.harness.waitForTask(task, context);
    assert.equal(
      (await agent.root.context(context)).head.kind,
      "pi.compaction",
    );
    compacting = false;
    await agent.send("Explain the controls without changing the game.");
    const entries = (
      await agent.root.entries({ order: "ascending" }, 1000, undefined, context)
    ).items;
    await agent.dispose({ preserveGame: true });
    project = "PROJECT_RESTORED";
    agent = new Agent(game, () => {}, {
      knowledge: docs,
      projectContext: () => `# Project\n${project}`,
    });
    await agent.open(compactTranscript(entries));
    await agent.configure({ ...defaultConfig, apiKey: "fixture" });
    await agent.send("Continue the explanation.");
    assert.equal(
      operations.length,
      beforeCount,
      "compaction and reopening do not replay tools",
    );
    const documents = await Promise.all(
      Object.values(index.sections).map(load),
    );
    for (const { body } of bodies.filter((b) => !b.compacting)) {
      const text = systemText(body);
      let previous = -1;
      for (const document of documents) {
        const at = text.indexOf(document.trim());
        assert.ok(at > previous, "startup documents retain their order");
        previous = at;
        assert.equal(
          text.split(document.trim()).length - 1,
          1,
          "each full body appears once",
        );
      }
      assert.ok(text.indexOf("# Host") > previous);
      assert.ok(text.indexOf("# Project") > text.indexOf("# Host"));
      assert.ok(!/SKILL\.md|SKILLS\.md|pico8_skills/.test(text));
    }
    const first = systemText(bodies[0].body),
      last = systemText(bodies.at(-1).body);
    assert.ok(last.includes("PROJECT_RESTORED"));
    assert.ok(!last.includes("PROJECT_FIRST"));
    assert.equal(
      first.slice(0, first.indexOf("# Project")),
      last.slice(0, last.indexOf("# Project")),
      "only the dynamic suffix changes",
    );
    assert.ok(
      bodies
        .at(-1)
        .body.messages.some((m) =>
          JSON.stringify(m.content).includes("SUMMARY:"),
        ),
    );
    t.diagnostic(
      `Static provider system prefix: ${Buffer.byteLength(first.slice(0, first.indexOf("# Project")))} UTF-8 bytes`,
    );
  },
);
