// Tests the authored games, not the originals' subjective quality.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createPico8Session } from "../../../app/public/player/main/player.mjs";
import {
  createPicoApiHost,
  FrameSliceRuntime,
} from "../../../ref/pico8-web-player/packages/runtime-core/dist/public.js";
import {
  Z8LuaFrameVm,
  createPicoApiHostRouter,
} from "../../../ref/pico8-web-player/packages/z8lua-bridge/dist/public.js";
import createModule from "../../../ref/pico8-web-player/wasm/dist/z8lua-runtime-v1.mjs";
const base = new URL("./", import.meta.url),
  cache = new URL("../../../.cache/microgames/", base);
await mkdir(cache, { recursive: true });
const names = ["spring-courier", "signal-arena", "lantern-vault"];
const sources = Object.fromEntries(
  await Promise.all(
    names.map(async (n) => [
      n,
      await readFile(new URL(n + ".lua", base), "utf8"),
    ]),
  ),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const input = (b) => ({
  controllers: [b, 0, 0, 0, 0, 0, 0, 0],
  devkit: {
    mouseXRaw: 0,
    mouseYRaw: 0,
    mouseButtons: 0,
    wheelRaw: 0,
    movementXRaw: 0,
    movementYRaw: 0,
    keypresses: [],
  },
});
const cart = (s) =>
  new TextEncoder().encode(
    "pico-8 cartridge // http://www.pico-8.com\nversion 43\n__lua__\n" +
      s +
      "\n",
  );
const checks = [];
async function check(name, fn) {
  const result = await fn();
  checks.push({ name, passed: true, ...result });
  console.log("PASS", name);
}
function crc(bytes) {
  let n = -1;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ -1) >>> 0;
}
function png(rgba) {
  const chunk = (type, bytes) => {
    const t = Buffer.from(type),
      sz = Buffer.alloc(4),
      c = Buffer.alloc(4);
    sz.writeUInt32BE(bytes.length);
    c.writeUInt32BE(crc(Buffer.concat([t, bytes])));
    return Buffer.concat([sz, t, bytes, c]);
  };
  const h = Buffer.alloc(13);
  h.writeUInt32BE(128, 0);
  h.writeUInt32BE(128, 4);
  h[8] = 8;
  h[9] = 6;
  const rows = Buffer.alloc(128 * 513);
  for (let y = 0; y < 128; y++)
    rows.set(rgba.slice(y * 512, y * 512 + 512), y * 513 + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const name of names)
  await check(`${name}: original Lua and exported cart`, async () => {
    const s = await createPico8Session();
    try {
      for (const load of [
        () => s.loadSource(sources[name]),
        () => s.loadCart(cart(sources[name])),
      ]) {
        const r = await load();
        assert.equal(r.state, "ready", JSON.stringify(r.diagnostics));
        let a = await s.advance({ frames: 1, input: input(32) });
        assert.equal(a.outcome, "completed");
        a = await s.advance({ frames: 120 });
        assert.equal(
          a.outcome,
          "completed",
          JSON.stringify(a.observation.diagnostics),
        );
        assert.equal(a.observation.diagnostics.length, 0);
        await writeFile(
          new URL(name + ".png", cache),
          png(a.observation.frame.rgba),
        );
      }
    } finally {
      await s.dispose();
    }
    return { sourceSha256: sha(sources[name]), framesPerLoad: 121 };
  });
const module = await createModule();
function harness(name) {
  const vm = new Z8LuaFrameVm(module, createPicoApiHostRouter(module));
  const host = createPicoApiHost(vm.memory, vm.logicalMemory);
  const rt = new FrameSliceRuntime(vm, {
    picoApiHost: host,
    instructionBudget: 1000000,
  });
  const fields = {
    "spring-courier":
      "flr(g.px),flr(g.py),g.parcel and 1 or 0,g.bonus and 1 or 0,g.grace,g.buffer,flr(g.vy*10)+128",
    "signal-arena":
      "g.gx,g.gy,g.hp,g.hits,({warn=0,attack=1,recover=2})[g.phase],g.timer,g.axis,g.target,g.cooldown",
    "lantern-vault":
      "g.tx,g.ty,g.hp,g.fuel,g.turn,g.danger,g.relic and 1 or 0,g.gems",
  }[name];
  // Read-only probe writes a copy to unused scratch RAM. No game variables are changed.
  const probe = `\nlocal real_update=_update60\nfunction _update60() real_update() poke(0x4300,({title=0,play=1,win=2,lose=3})[g.mode],${fields}) end`;
  const boot = rt.boot({
    rom: new Uint8Array(0x8000),
    code: new TextEncoder().encode(sources[name] + probe),
  });
  assert.equal(boot.ok, true, JSON.stringify(boot));
  const audio = [Buffer.from(boot.value.audio.pcm16le)];
  let frames = 0;
  const step = (buttons = 0, count = 1) => {
    for (let i = 0; i < count; i++) {
      const r = rt.step(input(buttons));
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.value.kind, "frame");
      audio.push(Buffer.from(r.value.frame.audio.pcm16le));
      frames++;
    }
    return [...rt.copyRam(0x4300, 16)];
  };
  return {
    rt,
    host,
    step,
    read: () => [...rt.copyRam(0x4300, 16)],
    finish: () => {
      const pcm = Buffer.concat(audio);
      assert.ok(pcm.some((b) => b !== 0));
      rt.dispose();
      return {
        frames,
        pcmBytes: pcm.length,
        pcmSha256: sha(pcm),
        listeningReview: false,
      };
    },
  };
}
await check(
  "spring-courier: keyboard delivery, fall failure and clean retry",
  () => {
    const h = harness("spring-courier");
    try {
      h.step(32);
      h.step(0);
      h.step(2, 18);
      h.step(18, 30);
      let a = h.read();
      assert.equal(a[3], 1, `parcel must be collected: ${a}`);
      h.step(0, 2);
      h.step(18, 43);
      a = h.read();
      assert.equal(a[0], 2, `exit must win: ${a}`);
      h.step(32);
      assert.equal(h.read()[0], 2, "result lock ignores an immediate X");
      h.step(0, 16);
      h.step(32);
      a = h.read();
      assert.equal(a[0], 1);
      assert.equal(a[3], 0);
      assert.equal(a[1], 8);
      h.step(2, 60);
      assert.equal(h.read()[0], 3, "walking into a gap loses");
      h.step(0, 16);
      h.step(32);
      assert.equal(h.read()[0], 1);
      return h.finish();
    } catch (e) {
      h.rt.dispose();
      throw e;
    }
  },
);
await check("spring-courier: coyote window and optional high gem", () => {
  const h = harness("spring-courier");
  try {
    h.step(32);
    h.step(2, 28);
    const edge = h.read();
    assert.ok(edge[1] >= 40);
    assert.ok(edge[5] > 0);
    h.step(16);
    assert.ok(h.read()[7] < 128, "late jump after edge has upward velocity");
    // Fresh game for an input-only optional collectible path.
    h.rt.dispose();
    const g = harness("spring-courier");
    try {
      g.step(32);
      g.step(2, 21);
      g.step(16, 18);
      assert.equal(g.read()[4], 1, "high gem collected");
      return g.finish();
    } catch (e) {
      g.rt.dispose();
      throw e;
    }
  } catch (e) {
    h.rt.dispose();
    throw e;
  }
});
await check(
  "signal-arena: dodge and strike policy wins; idle policy loses; restart clears damage",
  () => {
    const h = harness("signal-arena");
    try {
      h.step(32);
      let a = h.read();
      let previous = 32;
      for (let i = 0; i < 1600 && a[0] === 1; i++) {
        const [, x, y, , hits, phase, , axis, target] = a;
        let b = 0;
        if (phase !== 2) {
          if (axis === 0 && y === target) b = y > 0 ? 4 : 8;
          else if (axis === 1 && x === target) b = x > 0 ? 1 : 2;
        } else if (x !== 2) b = x < 2 ? 2 : 1;
        else if (y !== 2) b = y < 2 ? 8 : 4;
        else b = previous === 32 ? 0 : 32;
        previous = b;
        a = h.step(b);
      }
      assert.equal(a[0], 2, `policy must win: ${a}`);
      assert.equal(a[4], 3);
      assert.equal(a[3], 3, "safe policy takes no damage");
      // A repeated strike press right after winning must not skip the result.
      h.step(0);
      assert.equal(h.step(32)[0], 2, "result lock ignores an immediate X");
      h.step(0, 16);
      h.step(32);
      a = h.step(0, 600);
      assert.equal(a[0], 3, "no-input policy loses");
      h.step(32);
      a = h.read();
      assert.equal(a[3], 3);
      assert.equal(a[4], 0);
      assert.equal(a[0], 1);
      return h.finish();
    } catch (e) {
      h.rt.dispose();
      throw e;
    }
  },
);
function vaultRoute(wantGems, exactFuel = false) {
  const q = [{ x: 1, y: 5, t: 0, relic: false, g: 0, path: [] }],
    seen = new Set();
  for (let i = 0; i < q.length; i++) {
    const s = q[i];
    if (s.relic && s.x === 1 && s.y === 5) {
      if (
        (!wantGems || s.g === 3) &&
        (!exactFuel || s.t + 2 * ((s.g & 1) + (s.g >> 1)) === 24)
      )
        return s.path;
      continue;
    }
    if (s.t + 2 * ((s.g & 1) + (s.g >> 1)) >= 24) continue;
    for (const [b, dx, dy] of [
      [1, -1, 0],
      [2, 1, 0],
      [4, 0, -1],
      [8, 0, 1],
      [16, 0, 0],
    ]) {
      const x = s.x + dx,
        y = s.y + dy;
      if (
        x < 1 ||
        x > 5 ||
        y < 1 ||
        y > 5 ||
        (x === 3 && y >= 2 && y <= 4) ||
        (y === (s.t % 5) + 1 && !(exactFuel && s.relic && x === 1 && y === 5))
      )
        continue;
      const relic = s.relic || (x === 5 && y === 1),
        g = s.g | (x === 2 && y === 3 ? 1 : x === 4 && y === 3 ? 2 : 0),
        t = s.t + 1;
      if ((!wantGems && g) || t + 2 * ((g & 1) + (g >> 1)) > 24) continue;
      const key = [x, y, exactFuel ? t : t % 5, relic, g].join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ x, y, t, relic, g, path: [...s.path, b] });
    }
  }
  throw Error("No affordable safe route");
}
for (const greed of [false, true])
  await check(
    `lantern-vault: ${greed ? "optional two-gem" : "direct"} route wins without damage`,
    () => {
      const h = harness("lantern-vault");
      try {
        h.step(32);
        const start = h.read();
        assert.deepEqual(h.step(0, 120), start, "idle consumes no turns");
        h.step(1);
        assert.deepEqual(h.read(), start, "wall bump consumes no turn");
        h.step(0);
        const route = vaultRoute(greed);
        for (const b of route) {
          h.step(b);
          h.step(0);
        }
        const a = h.read();
        assert.equal(a[0], 2, `must escape: ${a}`);
        assert.equal(a[3], 3);
        assert.equal(a[8], greed ? 2 : 0);
        assert.equal(a[4], 24 - route.length - (greed ? 4 : 0));
        if (greed)
          assert.ok(
            a[4] < 24 - vaultRoute(false).length,
            "bonus route spends more fuel",
          );
        return { ...h.finish(), route, turns: route.length, fuelLeft: a[4] };
      } catch (e) {
        h.rt.dispose();
        throw e;
      }
    },
  );
await check(
  "lantern-vault: waiting can lose, restart clears relic/resources",
  () => {
    const h = harness("lantern-vault");
    try {
      h.step(32);
      for (let i = 0; i < 24; i++) {
        h.step(16);
        h.step(0);
      }
      assert.equal(h.read()[0], 3);
      h.step(0, 16);
      h.step(32);
      const a = h.read();
      assert.equal(a[0], 1);
      assert.equal(a[3], 3);
      assert.equal(a[4], 24);
      assert.equal(a[7], 0);
      assert.equal(a[8], 0);
      return h.finish();
    } catch (e) {
      h.rt.dispose();
      throw e;
    }
  },
);
await check(
  "spring-courier: buffered landing jump and expired edge grace",
  () => {
    const h = harness("spring-courier");
    try {
      h.step(32);
      h.step(16, 8);
      let a = h.step(0);
      for (let i = 0; i < 60 && !(a[2] >= 94 && a[2] < 100 && a[7] > 128); i++)
        a = h.step(0);
      assert.ok(
        a[2] >= 94 && a[2] < 100 && a[7] > 128,
        "approach ground while descending",
      );
      h.step(16);
      a = h.step(16, 3);
      assert.ok(a[7] < 128, "early press survives until landing and jumps");
      // Release, restart via falling, then test a press outside the edge window.
      h.step(2, 100);
      assert.equal(h.read()[0], 3);
      h.step(0, 16);
      h.step(32);
      h.step(2, 36);
      a = h.read();
      assert.equal(a[5], 0);
      a = h.step(16);
      assert.ok(a[7] >= 128, "expired grace cannot grant an air jump");
      return h.finish();
    } catch (e) {
      h.rt.dispose();
      throw e;
    }
  },
);
await check("lantern-vault: fuel exhaustion loses even without damage", () => {
  const h = harness("lantern-vault");
  try {
    h.step(32);
    let a = h.read();
    for (let i = 0; i < 24; i++) {
      const b = a[2] === a[6] ? (a[2] > 1 ? 4 : 8) : 16;
      a = h.step(b);
      h.step(0);
    }
    assert.equal(a[0], 3);
    assert.equal(a[3], 3);
    assert.equal(a[4], 0);
    return h.finish();
  } catch (e) {
    h.rt.dispose();
    throw e;
  }
});
await check("lantern-vault: living arrival on the final fuel unit wins", () => {
  const h = harness("lantern-vault");
  try {
    h.step(32);
    const route = vaultRoute(true, true);
    for (const b of route) {
      h.step(b);
      h.step(0);
    }
    const a = h.read();
    assert.equal(a[0], 2);
    assert.equal(a[4], 0);
    assert.equal(
      a[3],
      2,
      "final warned-row damage resolves before escape, but player survives",
    );
    return { ...h.finish(), route, turns: route.length, fuelLeft: a[4] };
  } catch (e) {
    h.rt.dispose();
    throw e;
  }
});
for (const name of names)
  await check(`${name}: feedback channel preserves music`, () => {
    const h = harness(name);
    try {
      h.step(32);
      assert.equal(h.host.stat(46 * 65536) / 65536, 0, "music on channel 0");
      // Trigger a genuine event using controls: jump, hurt or blocked action.
      if (name === "spring-courier") h.step(16);
      if (name === "signal-arena") h.step(0, 48);
      if (name === "lantern-vault") h.step(1);
      assert.ok(
        h.host.stat(49 * 65536) / 65536 >= 1,
        "feedback uses channel 3",
      );
      assert.equal(
        h.host.stat(46 * 65536) / 65536,
        0,
        "music survives feedback",
      );
      return h.finish();
    } catch (e) {
      h.rt.dispose();
      throw e;
    }
  });
await writeFile(
  new URL("validation-results.json", base),
  JSON.stringify(
    {
      verifiedOn: "2026-11-13",
      checks,
      artifacts: {
        playerSha256: sha(
          await readFile(
            new URL("../../../app/public/player/main/player.mjs", base),
          ),
        ),
      },
      limits: [
        "Original games: startup only",
        "No human enjoyment ratings",
        "No subjective listening review",
        "Probes copy state for tests only; no new model tool",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(checks.length + " microgame checks passed");
