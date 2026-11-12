// Post-generation inspection. These tests and findings are never fed back to the model.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { probe, frameRgba } from "./probe.mjs";
import { sha, input, png } from "./core.mjs";
import { createPico8Session } from "../../public/player/main/player.mjs";
const dir = resolve(
  process.argv[2] ?? ".cache/evaluations/deepseek-flash-20261112-round1",
);
const results = JSON.parse(await readFile(join(dir, "results.json"), "utf8"));
const out = join(dir, "independent-review");
await mkdir(out, { recursive: true });
const reviews = [];
const tap = (p, b) => {
  p.step(0);
  return p.step(b);
};
async function review(id, label, fields, run) {
  if (process.env.REVIEW_ID && !process.env.REVIEW_ID.split(",").includes(id))
    return;
  const record = results.find((r) => r.id === id),
    source = await readFile(join(dir, id, "final.lua"), "utf8");
  assert.equal(sha(source), record.sourceSha256);
  const p = probe(source, fields);
  let findings, observedError;
  try {
    findings = await run(p);
    await p.save(join(out, `${id}-${label}.png`));
  } catch (e) {
    let parsed;
    try {
      parsed = JSON.parse(e.message);
    } catch {
      p.finish();
      throw e;
    }
    if (!parsed.error) {
      p.finish();
      throw e;
    }
    observedError = parsed.error;
    findings = {
      verdict: "Real input triggers a runtime fault.",
      error: observedError,
    };
  }
  const expectedHash = sha(frameRgba(p.frame())),
    evidence = p.finish();
  // Replay the identical input sequence on the unmodified source in the public player.
  const session = await createPico8Session();
  let observation = await session.loadSource(source, {
    instructionBudget: 1000000,
  });
  for (const t of evidence.trace)
    observation = (
      await session.advance({ frames: t.frames, input: input(t.buttons) })
    ).observation;
  const replay = {
    state: observation.state,
    diagnostics: observation.diagnostics,
    rgbaSha256: observation.frame ? sha(observation.frame.rgba) : null,
    instrumentedRgbaSha256: expectedHash,
  };
  replay.pixelExact = replay.rgbaSha256 === expectedHash;
  if (observedError) {
    assert.equal(replay.state, "faulted");
    assert.equal(replay.diagnostics[0].message, observedError.message);
    replay.sameFault = true;
  } else
    assert.equal(
      replay.pixelExact,
      true,
      "Instrumentation changed final pixels",
    );
  await session.dispose();
  const report = {
    id,
    task: record.task,
    condition: record.condition,
    label,
    findings,
    ...evidence,
    unmodifiedReplay: replay,
  };
  await writeFile(
    join(out, `${id}-${label}.json`),
    JSON.stringify(report, null, 2),
  );
  reviews.push({
    id,
    label,
    findings,
    frames: evidence.frames,
    nonSilentPcm: evidence.nonSilentPcm,
    replay,
  });
  console.log(id, label, JSON.stringify(findings));
}
await review(
  "09a1cafe",
  "controls",
  { state: "state", x: "p.x", y: "p.y" },
  (p) => {
    const before = p.step();
    for (const b of [16, 32, 1, 2, 4, 8, 18, 34]) {
      p.step(0);
      p.step(b, 60);
    }
    const after = p.read();
    assert.equal(after.state, "[nil]");
    assert.equal(after.x, before.x);
    assert.equal(after.y, before.y);
    return {
      before,
      after,
      verdict:
        "No playable state: all six controls and moving-jump combinations leave the player stationary; state is never initialized.",
    };
  },
);
await review(
  "81a86279",
  "jump",
  {
    state: "state",
    x: "p.x",
    y: "p.y",
    feet: "p.y+8",
    deaths: "deaths",
    fixed: "fixed",
  },
  (p) => {
    tap(p, 32);
    p.step(0);
    let min = 999;
    for (let i = 0; i < 20; i++) min = Math.min(min, Number(p.step(16).feet));
    const apex = p.read();
    p.step(2, 30);
    const movement = p.read();
    p.step(0, 500);
    const later = p.read();
    assert(min > 88);
    return {
      highestFeet: min,
      lowestRaisedPlatformY: 88,
      apex,
      movement,
      later,
      verdict:
        "Movement and jumping work, but maximum jump cannot reach the lowest raised platform. Antenna objective is inaccessible.",
    };
  },
);
// A boss fails as soon as a real player starts, despite passing idle title checks.
if (!process.env.REVIEW_ID || process.env.REVIEW_ID === "bdedfb71") {
  const id = "bdedfb71",
    source = await readFile(join(dir, id, "final.lua"), "utf8"),
    session = await createPico8Session();
  await session.loadSource(source, { instructionBudget: 1000000 });
  const r = (await session.advance({ frames: 1, input: input(32) }))
    .observation;
  assert.equal(r.state, "faulted");
  const report = {
    id,
    label: "start",
    sourceSha256: sha(source),
    inputs: [{ buttons: 32, frames: 1 }],
    findings: {
      verdict: "Starting the game faults because math is nil.",
      diagnostics: r.diagnostics,
    },
    humanReview: false,
  };
  await writeFile(
    join(out, `${id}-start.json`),
    JSON.stringify(report, null, 2),
  );
  await session.dispose();
  reviews.push(report);
  console.log(id, JSON.stringify(report.findings));
}
const bossFields = {
  state: "state",
  mode: "mode",
  x: "px",
  y: "py",
  hp: "hp",
  hits: "hits",
  phase: "phase",
  kind: "zone and zone.kind",
  index: "zone and zone.index",
  t: "t",
};
await review("5225069a", "win", bossFields, (p) => {
  let s = tap(p, 32),
    previous = 32;
  for (let i = 0; i < 2400 && s.state === "play"; i++) {
    let tx = 64,
      ty = 42;
    const x = +s.x,
      y = +s.y,
      kind = +s.kind,
      index = +s.index;
    if (s.mode !== "open") {
      let best = Infinity;
      for (let col = 0; col < 5; col++)
        for (let row = 0; row < 5; row++) {
          if ((kind !== 1 && col === index) || (kind !== 0 && row === index))
            continue;
          const cx = 34 + col * 20,
            cy = 36 + row * 20,
            score =
              (x - cx) ** 2 +
              (y - cy) ** 2 +
              0.25 * ((cx - 64) ** 2 + (cy - 42) ** 2);
          if (score < best) {
            best = score;
            tx = cx;
            ty = cy;
          }
        }
    }
    let b =
      (Math.abs(x - tx) > 1.5 ? (x < tx ? 2 : 1) : 0) |
      (Math.abs(y - ty) > 1.5 ? (y < ty ? 8 : 4) : 0);
    if (
      s.mode === "open" &&
      (x - 64) ** 2 + (y - 42) ** 2 < 26 ** 2 &&
      !(previous & 32)
    )
      b |= 32;
    s = p.step(b);
    previous = b;
  }
  assert.equal(s.state, "won");
  return {
    final: s,
    verdict:
      "Normal movement, warning avoidance and counterattacks reach all three phases and win.",
  };
});
await review("5225069a", "loss-retry", bossFields, (p) => {
  let s = tap(p, 32);
  for (let i = 0; i < 5000 && s.state === "play"; i++) s = p.step();
  assert.equal(s.state, "dead");
  const lost = s,
    retry = tap(p, 32);
  assert.equal(retry.state, "play");
  assert.equal(retry.hp, "3");
  return {
    lost,
    retry,
    verdict:
      "Taking repeated attacks causes defeat; X resets HP, hits and phase.",
  };
});
await review(
  "5c0fa848",
  "stationary-win",
  {
    mode: "mode",
    x: "px",
    y: "py",
    banked: "banked",
    stranded: "#stranded",
    carrying: "nc",
    hearts: "hearts",
  },
  (p) => {
    const start = tap(p, 32);
    let s = start;
    for (let i = 0; i < 6; i++) s = tap(p, 16);
    assert.equal(s.mode, "clear");
    assert.equal(s.x, start.x);
    assert.equal(s.banked, "6");
    assert.equal(s.stranded, start.stranded);
    return {
      start,
      final: s,
      verdict:
        "Six O presses at the starting position win without crossing. Stranded creatures remain; del(table,1) does not remove a creature table.",
    };
  },
);
await review(
  "5feacc7d",
  "crossings",
  {
    state: "state",
    x: "boat and boat.x",
    y: "boat and boat.y",
    carry: "carryCount",
    rescued: "rescuedTotal",
    level: "levelIdx",
    time: "t",
    direction: "boat and boat.dir",
  },
  (p) => {
    let s = tap(p, 32),
      previous = 32,
      trip = "right",
      maxLevel = 1,
      washouts = 0,
      lastCarry = 0;
    for (let i = 0; i < 18000 && s.state !== "win"; i++) {
      let b = 0;
      if (s.state === "play") {
        const x = +s.x,
          c = +s.carry;
        if (x <= 12 && lastCarry > c) washouts++;
        if (x >= 117.5) trip = "left";
        if (x <= 12) trip = "right";
        if (trip === "right" && x <= 12 && c < 2) b = previous & 32 ? 0 : 32;
        else b = trip === "right" ? 2 : 1;
        // Odd-sized groups need to leave with the last single passenger.
        if (trip === "right" && x <= 12 && c === 1 && i % 160 > 80) b = 2;
        lastCarry = c;
      }
      s = p.step(b);
      previous = b;
      maxLevel = Math.max(maxLevel, +s.level || 1);
    }
    return {
      final: s,
      maxLevel,
      washouts,
      verdict:
        s.state === "win"
          ? "Repeated real crossings and pickups complete all levels."
          : "Bounded input policy exercised crossings and washouts; full completion not established. This is not proof of impossibility.",
    };
  },
);
await review(
  "85f23650",
  "actions",
  {
    state: "state",
    day: "day",
    water: "water",
    seeds: "seeds",
    sel: "sel",
    plant1: "beds and beds[1].kind",
    plant2: "beds and beds[2].kind",
    plant3: "beds and beds[3].kind",
  },
  (p) => {
    const start = tap(p, 16);
    for (let i = 0; i < 4; i++)
      for (const b of [1, 2, 4, 8, 16, 32, 36]) tap(p, b);
    const end = p.read();
    assert.equal(end.day, "1");
    assert.equal(end.water, "10");
    assert.equal(end.seeds, "1");
    return {
      start,
      final: end,
      verdict:
        "No bound action plants a seed or advances the empty garden. The planting function is unreachable from controls.",
    };
  },
);
const gardenFields = {
  state: "state",
  day: "day",
  water: "water",
  harvested: "harvested",
  score: "score",
  dose: "flower[1] and flower[1].dose",
  kind: "flower[1] and flower[1].kind",
  sky: "sky",
};
await review("d45dc10f", "rest-retry", gardenFields, (p) => {
  tap(p, 16);
  let s;
  for (let i = 0; i < 6; i++) s = tap(p, 8);
  assert.equal(s.state, "end");
  assert.equal(s.score, "9");
  const retry = tap(p, 32);
  assert.equal(retry.day, "1");
  return {
    final: s,
    retry,
    verdict:
      "Six waits finish the season with score 9 and no plants; retry resets day and water.",
  };
});
await review("d45dc10f", "plant-water", gardenFields, (p) => {
  tap(p, 16);
  tap(p, 32);
  let s;
  for (let i = 0; i < 5; i++) s = tap(p, 16);
  assert.equal(s.state, "end");
  assert.equal(s.harvested, "0");
  assert.equal(s.score, "6");
  return {
    final: s,
    verdict:
      "Default weather stays sunny. Watering dose 0 adds one then evaporates one each day, so no plant can reach dose 3 and harvest. Waiting scores higher than sowing and watering.",
  };
});
const extractBFields = {
  state: "state",
  x: "px",
  y: "py",
  fuel: "fuel",
  hp: "hp",
  key: "have_key",
  turn: "turn",
  danger: "danger",
};
await review("497113b1", "key-return", extractBFields, async (p) => {
  const start = tap(p, 32);
  await p.save(join(out, "497113b1-start.png"));
  let s = start;
  for (const b of [2, 2, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4]) s = tap(p, b);
  assert.equal(s.state, "won");
  return {
    start,
    final: s,
    playerTopYAtStart: 16 + (+start.y - 1) * 16 + 4,
    verdict:
      "A key-return route wins using internal coordinates, but the starting player and key are below the 128-pixel viewport.",
  };
});
await review("497113b1", "fuel-retry", extractBFields, (p) => {
  tap(p, 32);
  let s;
  for (let i = 0; i < 26; i++) s = tap(p, 16);
  assert.equal(s.state, "lost");
  const retry = tap(p, 32);
  assert.equal(retry.fuel, "26");
  return { lost: s, retry, verdict: "Waiting exhausts fuel; X retries." };
});
const extractAFields = {
  state: "state",
  x: "px",
  y: "py",
  hp: "hp",
  fuel: "clock",
  relic: "have_relic",
  gate: "gate_open",
  turn: "turn",
  reason: "lose_reason",
};
await review("a4a61997", "route-retry", extractAFields, async (p) => {
  const source = await readFile(join(dir, "a4a61997", "final.lua"), "utf8");
  const rows = [...source.matchAll(/^ "([#.PRKG]+)"/gm)].map((m) => m[1]);
  const path = (x, y, tx, ty) => {
    const q = [[x, y, []]],
      seen = new Set([x + "," + y]);
    for (let n = 0; n < q.length; n++) {
      const [cx, cy, steps] = q[n];
      if (cx === tx && cy === ty) return steps;
      for (const [dx, dy, b] of [
        [-1, 0, 1],
        [1, 0, 2],
        [0, -1, 4],
        [0, 1, 8],
      ]) {
        const nx = cx + dx,
          ny = cy + dy,
          k = nx + "," + ny;
        if (!rows[ny]?.[nx] || rows[ny][nx] === "#" || seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny, [...steps, b]]);
      }
    }
    throw Error("No spatial route");
  };
  let s = tap(p, 32),
    attempts = 0;
  for (const [tx, ty] of [
    [9, 12],
    [13, 12],
    [14, 12],
  ]) {
    while (
      s.state === "play" &&
      (+s.x !== tx || +s.y !== ty) &&
      attempts++ < 90
    ) {
      const before = s,
        route = path(+s.x, +s.y, tx, ty);
      s = tap(p, route[0]);
      if (s.x === before.x && s.y === before.y) s = tap(p, 32);
    }
  }
  const final = s;
  if (s.state === "play")
    for (let i = 0; i < 50 && s.state === "play"; i++) s = tap(p, 32);
  const terminal = s,
    retry = tap(p, 32);
  assert.equal(retry.state, "play");
  assert.equal(retry.fuel, "48");
  return {
    final,
    terminal,
    retry,
    verdict:
      final.state === "win"
        ? "A spatial route with waits for blocking fire retrieves the relic and reaches the gate; retry resets resources."
        : "Shortest spatial route plus waits was exercised, but no victory established by this policy. Failure and retry verified; existence of another winning route remains unknown.",
  };
});
await writeFile(
  join(
    out,
    process.env.REVIEW_ID
      ? "summary-" + process.env.REVIEW_ID + ".json"
      : "summary.json",
  ),
  JSON.stringify(reviews, null, 2),
);
