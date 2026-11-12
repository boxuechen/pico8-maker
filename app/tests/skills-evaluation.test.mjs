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
import { TestGame } from "./helpers/game.mjs";
import {
  mechanicsCases,
  verifyMechanics,
} from "../scripts/evaluation/mechanics-cases.mjs";

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

test("resource skill routing rejects missing, failed and late reads in creation tasks", () => {
  const read = {
    type: "toolCall",
    id: "r",
    name: "read",
    arguments: { path: "/extensions/pico8/skills/pico8-assets/SKILL.md" },
  };
  const edit = {
    type: "toolCall",
    id: "e",
    name: "edit_assets",
    arguments: {},
  };
  for (const [calls, isError, expected] of [
    [[edit], false, false],
    [[read, edit], true, false],
    [[edit, read], false, false],
    [[read, edit], false, true],
  ]) {
    const entries = [
      {
        model: [
          { role: "assistant", content: calls },
          { role: "toolResult", toolCallId: "r", isError, content: [] },
          { role: "toolResult", toolCallId: "e", isError: false, content: [] },
        ],
      },
    ];
    const metrics = transcriptMetrics(entries);
    const checks = assessScope(
      skillCases.find((t) => t.id === "create"),
      fixtureSnapshot(),
      fixtureSnapshot(),
      metrics,
      { status: "done" },
    );
    assert.equal(checks.resourceSkillBeforeEdits, expected);
  }
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

for (const task of mechanicsCases) {
  test(`${task.id} pixel checks reject the broken fixture and accept a repaired game`, async (t) => {
    const game = new TestGame();
    t.after(() => game.dispose());
    const broken = task.snapshot();
    game.versions = [broken];
    game.draft = { ...broken };
    const before = await verifyMechanics(task.id, game);
    assert.equal(before.checks.noRuntimeFault, true);
    assert.ok(
      Object.values(before.checks).includes(false),
      "A runnable broken game must fail gameplay checks",
    );
    const source = broken.source
      .replace(
        "if btnp(4) then vy=-4 end",
        "if btnp(4) and y==88 then vy=-4 end",
      )
      .replace("then hp-=1 inv=0 end", "then hp-=1 inv=20 end")
      .replace(
        "if true then x=nx y=ny end",
        "if mget(nx,ny)!=1 then x=nx y=ny end",
      )
      .replace(
        "if mget(x,y)==2 then score+=1 end",
        "if mget(x,y)==2 then score+=1 mset(x,y,0) end",
      );
    await game.execute("load_game", { source });
    const after = await verifyMechanics(task.id, game);
    assert.ok(
      Object.values(after.checks).every(Boolean),
      JSON.stringify(after.checks),
    );
    assert.ok(after.evidence.length > 1);
    assert.equal(game.snapshot.assets, broken.assets);
  });
}
