import test from "node:test";
import assert from "node:assert/strict";
import { TestGame } from "./helpers/game.mjs";
import { createPico8Tools } from "../src/pico8/tools.js";
import { editAssetsSchema } from "../src/pico8/asset-tools.js";
import { knowledge } from "./helpers/knowledge.mjs";

const tool = (tools, name) => tools.find((t) => t.name === name);

test("tool errors point small models at the right next step", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  const tools = createPico8Tools({ game: g, knowledge });
  g.setDraft(""); // a new cart: main.lua starts empty
  // edit on an empty main.lua explains that new games go through load_game.
  await assert.rejects(
    () =>
      tool(tools, "edit").execute(
        { path: "/cart/main.lua", edits: [{ oldText: "", newText: "x=1" }] },
        {},
        {},
      ),
    /is empty.*load_game \{source\}/,
  );
  // A guessed knowledge path names the real index.
  await assert.rejects(
    () =>
      tool(tools, "read").execute(
        { path: "/extensions/pico8/README.md" },
        {},
        {},
      ),
    /does not exist.*REFERENCE_INDEX\.md/,
  );
  // Once source exists, edit works as before.
  await g.execute("load_game", { source: "x=1 function _draw() cls() end" });
  await tool(tools, "edit").execute(
    { path: "/cart/main.lua", edits: [{ oldText: "x=1", newText: "x=2" }] },
    {},
    {},
  );
  assert.match(g.draft.source, /^x=2/);
  // Sprite rows describe their format.
  const rows = JSON.stringify(editAssetsSchema).match(
    /"description":"Exactly 8 strings[^"]*/,
  );
  assert.ok(rows, "sprite rows carry a format description");
});
