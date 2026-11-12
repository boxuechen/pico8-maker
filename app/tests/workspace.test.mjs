import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { CartWorkspace, mainPath } from "../src/pico8/workspace.js";
import { createPico8Extension } from "../src/pico8/extension.js";
import { Game } from "../src/game.js";
import { knowledge } from "./helpers/knowledge.mjs";

function memoryWorkspace(text = "", maxLength) {
  const box = { text, writes: 0 };
  const ws = new CartWorkspace({
    read: () => box.text,
    write: (t) => {
      box.text = t;
      box.writes++;
    },
    maxLength,
  });
  return { box, ws };
}

test("the workspace exposes exactly one writable file", async () => {
  const { box, ws } = memoryWorkspace("print(1)");
  assert.equal((await ws.absolutePath("main.lua", context)).value, mainPath);
  assert.equal(
    (await ws.absolutePath("./x/../main.lua", context)).value,
    mainPath,
  );
  assert.equal((await ws.readTextFile("main.lua", context)).value, "print(1)");
  assert.equal((await ws.fileInfo("/cart", context)).value.kind, "directory");
  assert.equal(
    (await ws.fileInfo("other.lua", context)).error.code,
    "not_found",
  );
  assert.equal(
    (await ws.writeFile("/etc/passwd", "x", context)).error.code,
    "permission_denied",
  );
  assert.equal(
    (await ws.exec("ls", undefined, context)).error.code,
    "shell_unavailable",
  );
  assert.equal((await ws.writeFile("main.lua", "print(2)", context)).ok, true);
  assert.equal(box.text, "print(2)");
  const small = memoryWorkspace("", 4).ws;
  assert.equal(
    (await small.writeFile("main.lua", "12345", context)).error.code,
    "invalid",
  );
});

test("the agent's edit tool changes only the targeted block of main.lua", async () => {
  const { box, ws } = memoryWorkspace(
    "jump_speed=-3\nfunction _update() end\nfunction _draw() cls(1) end\n",
  );
  const ext = createPico8Extension({ game: { workspace: ws }, knowledge });
  const edit = ext.tools.find((t) => t.name === "edit");
  assert.ok(edit.description.includes(mainPath));
  const result = await edit.execute(
    {
      path: "main.lua",
      edits: [{ oldText: "jump_speed=-3", newText: "jump_speed=-4.5" }],
    },
    {},
    context,
  );
  assert.equal(result.isError, undefined);
  assert.equal(
    box.text,
    "jump_speed=-4.5\nfunction _update() end\nfunction _draw() cls(1) end\n",
  );
  assert.match(result.details.diff, /-4\.5/);
  await assert.rejects(() =>
    edit.execute(
      { path: "main.lua", edits: [{ oldText: "not here", newText: "x" }] },
      {},
      context,
    ),
  );
  await assert.rejects(() =>
    edit.execute(
      { path: "other.lua", edits: [{ oldText: "a", newText: "b" }] },
      {},
      context,
    ),
  );
  const load = ext.tools.find((t) => t.name === "load_game");
  assert.deepEqual(load.parameters.required ?? [], []);
});

// A Game with a scripted test session: "bad" sources fault on load.
function scriptedGame(options) {
  const loads = [];
  const drafts = [];
  const game = new Game(() => {}, {
    versions: [emptySnapshot("v1")],
    onSave: () => {},
    onDraft: (t) => drafts.push(t),
    ...options,
  });
  game.ensureWorker = async () => {};
  game.player = { pause: async () => {}, loadCart: async () => {} };
  const ok = { state: "running", frame: null, diagnostics: [] };
  game.rpc = async (action, args) => {
    if (action === "load") {
      const source = new TextDecoder()
        .decode(args.cart)
        .split("__lua__\n")[1]
        .split("\n__gfx__")[0];
      loads.push(source);
      return source.includes("bad")
        ? { state: "faulted", diagnostics: [] }
        : ok;
    }
    return {
      observation: ok,
      requestedFrames: args.frames,
      completedFrames: args.frames,
      outcome: "completed",
    };
  };
  game.output = (observation) => ({
    output: [{ type: "text", text: observation.state }],
    isError: observation.state === "faulted",
  });
  return { game, loads, drafts };
}

test("load_game commits the working file; failed loads keep edits uncommitted", async () => {
  const { game, loads, drafts } = scriptedGame();
  assert.equal(game.draft.source, "v1");
  await game.workspace.writeFile("main.lua", "v2", context);
  assert.equal((await game.execute("read_game", {})).output[0].text, "v2");
  assert.equal(game.source, "v1");
  // reset_game runs the committed version, not the draft.
  await game.execute("reset_game", {});
  assert.equal(loads.at(-1), "v1");

  const loaded = await game.execute("load_game", {});
  assert.equal(loaded.isError, false);
  assert.match(loaded.output[0].text, /Committed as version 2/);
  assert.deepEqual(
    game.versions.map((s) => s.source),
    ["v1", "v2"],
  );

  const same = await game.execute("load_game", {});
  assert.match(same.output[0].text, /unchanged/);
  assert.equal(game.versions.length, 2);

  const bad = await game.execute("load_game", { source: "bad code" });
  assert.equal(bad.isError, true);
  assert.match(bad.output[0].text, /Not committed/);
  assert.equal(game.draft.source, "bad code");
  assert.equal(game.source, "v2");
  assert.equal(loads.at(-1), "v2");

  await game.execute("load_game", { source: "v3" });
  assert.equal(game.revision, 3);
  await game.undo();
  assert.equal(game.source, "v2");
  assert.equal(game.draft.source, "v2");
  assert.deepEqual(
    drafts.map((s) => s.source),
    ["v2", "bad code", "v3", "v2"],
  );
});

test("a stored draft survives reopening and switching carts", async () => {
  const { game } = scriptedGame({ draft: emptySnapshot("edited") });
  assert.equal(game.draft.source, "edited");
  assert.equal(game.source, "v1");
  await game.switchProject(["a", "b"].map(emptySnapshot), 2);
  assert.equal(game.draft.source, "b");
  await game.switchProject([emptySnapshot("a")], 1, emptySnapshot("a + edits"));
  assert.equal(game.draft.source, "a + edits");
});

test("game tools allow the player frame range and large source without an app cap", async () => {
  const { game } = scriptedGame();
  const source = "-- data\n".repeat(15000);
  await game.execute("load_game", { source });
  assert.equal(game.source, source);
  await game.workspace.writeFile("main.lua", source + "-- edit", context);
  assert.equal(game.draft.source, source + "-- edit");
  await game.execute("press_buttons", { frames: 600, buttons: 0 });
  await assert.rejects(
    () => game.execute("press_buttons", { frames: 601, buttons: 0 }),
    /1–600/,
  );
});

test("empty projects do not play a demo and first successful load creates v1", async () => {
  const { game } = scriptedGame({ versions: [] });
  assert.equal(game.source, "");
  assert.equal(game.draft.source, "");
  assert.equal(game.hasGame, false);
  assert.equal(game.revision, 0);
  await game.play();
  await game.restart();
  await assert.rejects(() => game.execute("observe_game", {}), /No game/);
  await assert.rejects(() => game.execute("load_game", {}), /empty/);
  const failed = await game.execute("load_game", { source: "bad code" });
  assert.equal(failed.isError, true);
  assert.equal(game.hasGame, false);
  assert.equal(game.revision, 0);
  assert.equal(game.draft.source, "bad code");
  await game.execute("load_game", { source: "function _draw() cls(1) end" });
  assert.equal(game.hasGame, true);
  assert.equal(game.revision, 1);
  assert.equal(game.versions.length, 1);
  await game.switchProject([], 0);
  assert.equal(game.source, "");
  assert.equal(game.draft.source, "");
  assert.equal(game.hasGame, false);
  assert.equal(game.revision, 0);
});
