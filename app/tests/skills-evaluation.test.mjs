import test from "node:test";
import assert from "node:assert/strict";
import {
  skillCases,
  fixtureSnapshot,
  transcriptMetrics,
  assessScope,
} from "../scripts/evaluation/skills-cases.mjs";
import { editAssets } from "../src/pico8/assets.js";
import { createPico8Session } from "../public/player/main/player.mjs";
import { cartBytes } from "../src/pico8/cart.js";
import { input } from "./helpers/game.mjs";

test("evaluation metrics require successful skill reads and actual tool evidence", () => {
  const entries = [
    {
      model: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "I read every skill and tested everything." },
            {
              type: "toolCall",
              id: "r",
              name: "read",
              arguments: {
                path: "/extensions/pico8/skills/pico8-edit/SKILL.md",
              },
            },
            {
              type: "toolCall",
              id: "p",
              name: "press_buttons",
              arguments: { frames: 10, buttons: 2 },
            },
          ],
        },
        {
          role: "toolResult",
          toolCallId: "r",
          isError: true,
          content: [{ type: "text", text: "unavailable" }],
        },
        { role: "toolResult", toolCallId: "p", isError: false, content: [] },
        { role: "assistant", content: [{ type: "text", text: "Done." }] },
      ],
    },
  ];
  const m = transcriptMetrics(entries);
  assert.deepEqual(m.skillReads, []);
  assert.equal(m.failedTools, 1);
  assert.deepEqual(m.inputs, [{ frames: 10, buttons: 2 }]);
  const task = skillCases.find((t) => t.id === "edit");
  const checks = assessScope(task, fixtureSnapshot(), fixtureSnapshot(), m, {
    status: "done",
  });
  assert.equal(checks.selectedSkills, false);
  assert.equal(checks.actualInput, true);
  assert.equal(checks.naturalCompletion, true);
});

test("scope assessment rejects unrequested edits, resource damage and aborted answers", () => {
  const before = fixtureSnapshot();
  const m = { operations: [], skillReads: [], inputs: [], finalText: "Done." };
  const explain = skillCases.find((t) => t.id === "explain");
  assert.equal(
    assessScope(explain, before, before, m, { status: "unanswered" })
      .naturalCompletion,
    false,
  );
  assert.equal(
    assessScope(
      explain,
      before,
      before,
      { ...m, operations: ["reset_game"] },
      { status: "done" },
    ).noGameOperation,
    false,
  );
  const assets = skillCases.find((t) => t.id === "assets");
  const after = {
    ...before,
    assets: editAssets(before.assets, [
      { kind: "sprite", id: 1, rows: Array(8).fill("eeeeeeee") },
    ]),
  };
  assert.equal(
    assessScope(assets, before, after, m, { status: "done" })
      .onlyRequestedResourceChanged,
    true,
  );
  after.assets = editAssets(after.assets, [
    { kind: "sprite", id: 2, flags: 0 },
  ]);
  assert.equal(
    assessScope(assets, before, after, m, { status: "done" })
      .onlyRequestedResourceChanged,
    false,
  );
});

test("the fixed fixture and speed oracle exercise the real runtime", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  for (const speed of [1, 2]) {
    const snapshot = fixtureSnapshot();
    snapshot.source = snapshot.source.replace("speed=1", `speed=${speed}`);
    await session.loadCart(cartBytes(snapshot));
    await session.advance({ frames: 1 });
    const moved = (await session.advance({ frames: 10, input: input(2) }))
      .observation;
    const x = 8 + speed * 10;
    assert.deepEqual(
      [...moved.frame.rgba.slice((64 * 128 + x) * 4, (64 * 128 + x) * 4 + 3)],
      [0, 228, 54],
    );
    const win = (await session.advance({ frames: 110, input: input(2) }))
      .observation;
    assert.equal(win.diagnostics.length, 0);
    await session.advance({ frames: 1, input: input(0) });
    const retry = (await session.advance({ frames: 1, input: input(16) }))
      .observation;
    assert.deepEqual(
      [...retry.frame.rgba.slice((64 * 128 + 8) * 4, (64 * 128 + 8) * 4 + 3)],
      [0, 228, 54],
    );
  }
});
