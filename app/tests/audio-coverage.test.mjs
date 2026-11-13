import test from "node:test";
import assert from "node:assert/strict";
import { TestGame } from "./helpers/game.mjs";
import { mergeAudio } from "../src/pico8/input-sequence.js";
import { revisionCoverage, coverageNote } from "../src/pico8/playtests.js";
import { sessionContext, activeSession } from "../src/sessions.js";
import { newCart } from "../src/cart-store.js";

const audioOf = (r) =>
  r.output
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .filter((t) => t.startsWith('{"audio"'))
    .map((t) => JSON.parse(t).audio);
const sounds = `function _init()
 for id=0,1 do local b=0x3200+id*68 poke(b,24,10) poke(b+65,32) end
 poke(0x3100,0,0x41,0x42,0x43) music(0)
end
n=0
function _update() n+=1
 if btnp(4) then sfx(1,3) end
 if btnp(5) then sfx(1,0) end
end
function _draw() cls(1) end`;

test("load and input results report sfx/music starts with the voice and music conflicts", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  const loaded = await g.execute("load_game", { source: sounds });
  assert.deepEqual(
    audioOf(loaded)[0].events.map(({ frameId, ...e }) => e),
    [{ music: 0 }],
    "_init music() is reported with the startup frame",
  );
  const pressed = await g.execute("press_buttons", {
    steps: [
      { frames: 1, buttons: 16, tap: true, capture: true },
      { frames: 4, buttons: 0 },
      { frames: 1, buttons: 32, tap: true },
    ],
  });
  const [audio, ...extra] = audioOf(pressed);
  assert.equal(
    extra.length,
    0,
    "one audio block per call, on the first header",
  );
  assert.deepEqual(
    audio.events.map(({ frameId, ...e }) => e),
    [
      { sfx: 1, channel: 3 },
      { sfx: 1, channel: 0, overMusic: true },
    ],
  );
  assert.ok(audio.events[0].frameId < audio.events[1].frameId);
  assert.equal(audio.dropped, undefined);
  // Silent inputs add no audio block.
  const quiet = await g.execute("press_buttons", {
    steps: [{ frames: 2, buttons: 0 }],
  });
  assert.equal(audioOf(quiet).length, 0);
  // Merging across advances stays bounded.
  const merged = mergeAudio(
    { events: Array(30).fill({ sfx: 0 }), dropped: 1 },
    { events: Array(5).fill({ sfx: 1 }), dropped: 2 },
  );
  assert.equal(merged.events.length, 32);
  assert.equal(merged.dropped, 6);
});

test("coverage facts follow the committed revision without judging gameplay", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  const first = await g.execute("load_game", {
    source: "function _draw() cls(1) end",
  });
  const rev = g.revision;
  assert.match(
    first.output[0].text,
    new RegExp(`Revision ${rev}: no normal-input route recorded yet`),
  );
  await g.execute("press_buttons", { steps: [{ frames: 3, buttons: 0 }] });
  await g.execute("reset_game", {});
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  // A debug route and an input-free route do not count as normal coverage.
  await g.execute("reset_game", {});
  await g.execute("inspect_game", { mode: "debug", code: "x=1" });
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  await g.execute("reset_game", {});
  assert.deepEqual(revisionCoverage(g.playtests.runs, rev), {
    revision: rev,
    normalRoutes: 2,
    longestNormalCalls: 2,
    debugRoutes: 1,
  });
  const unchanged = await g.execute("load_game", {});
  assert.match(
    unchanged.output[0].text,
    /no new version\. Revision \d+: 2 normal-input route/,
  );
  const next = await g.execute("load_game", {
    source: "function _draw() cls(2) end",
  });
  const text = next.output[0].text;
  assert.match(
    text,
    new RegExp(`Revision ${rev + 1}: no normal-input route recorded yet`),
  );
  assert.match(text, new RegExp(`Revision ${rev} had 2 normal-input route`));
  assert.match(text, /rerun the affected routes on this revision/);
  // The same fact is part of the request-start project context.
  const cart = {
    ...newCart({ title: "Coverage" }),
    versions: g.versions,
    revision: g.revision,
    playtests: g.playtests.runs,
  };
  const context = sessionContext(cart, activeSession(cart));
  assert.match(
    context,
    /Recorded playtests: Revision \d+: no normal-input route recorded yet/,
  );
  assert.equal(
    coverageNote({ revision: 3, normalRoutes: 1, longestNormalCalls: 4 }),
    "Revision 3: 1 normal-input route(s) recorded, longest 4 input call(s).",
  );
});

test("normal input before the first debug event keeps its coverage; declared debug starts do not", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  await g.execute("load_game", {
    source: "x=0 function _update() x+=1 end function _draw() cls(1) end",
  });
  const rev = g.revision;
  // Normal play (e.g. a full win and retry), then edge cases injected in the same route.
  await g.execute("press_buttons", { steps: [{ frames: 2, buttons: 0 }] });
  await g.execute("press_buttons", { steps: [{ frames: 2, buttons: 0 }] });
  await g.execute("inspect_game", { mode: "debug", code: "x=99" });
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  assert.equal(
    g.playtests.active.purpose,
    "debug",
    "the route itself stays debug",
  );
  // A route declared debug from its start never counts as normal input.
  await g.execute("reset_game", { purpose: "debug" });
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  await g.execute("inspect_game", { mode: "debug", code: "x=1" });
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  assert.deepEqual(revisionCoverage(g.playtests.runs, rev), {
    revision: rev,
    normalRoutes: 1,
    longestNormalCalls: 2,
    debugRoutes: 2,
  });
  const next = await g.execute("load_game", {
    source: "function _draw() cls(2) end",
  });
  assert.match(
    next.output[0].text,
    new RegExp(
      `Revision ${rev} had 1 normal-input route\\(s\\) \\(longest 2 input calls\\)`,
    ),
  );
});
