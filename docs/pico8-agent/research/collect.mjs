// Local research archive only. Third-party code/assets are never bundled for models.
// node docs/pico8-agent/research/collect.mjs [--fetch]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { decodeCart } from "../../../ref/pico8-web-player/packages/cart-codec/dist/public.js";
import { createPico8Session } from "../../../app/public/player/main/player.mjs";
const root = new URL("../../../.cache/classic-study/", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("sources.json", import.meta.url)),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const reports = [];
await mkdir(root, { recursive: true });
for (const entry of catalog.games) {
  const path = new URL(entry.file, root);
  if (process.argv.includes("--fetch")) {
    const response = await fetch(entry.cartUrl);
    if (!response.ok) throw Error(`${entry.id}: HTTP ${response.status}`);
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }
  const bytes = new Uint8Array(await readFile(path));
  const cart = decodeCart(bytes);
  const dir = new URL(entry.id + "/", root);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("source.p8lua", dir), cart.code);
  const spriteRows = Array.from({ length: 128 }, (_, y) =>
    Array.from({ length: 128 }, (_, x) => {
      const b = cart.rom[y * 64 + (x >> 1)];
      return (x & 1 ? b >>> 4 : b & 15).toString(16);
    }).join(""),
  );
  await writeFile(new URL("sprites.txt", dir), spriteRows.join("\n") + "\n");
  const maps = Array.from({ length: 64 }, (_, y) =>
    Array.from(
      { length: 128 },
      (_, x) =>
        cart.rom[(y < 32 ? 0x2000 + y * 128 : 0x1000 + (y - 32) * 128) + x],
    ),
  );
  await writeFile(
    new URL("map.json", dir),
    JSON.stringify({ sharedLowerHalf: true, rows: maps }),
  );
  const sounds = Array.from({ length: 64 }, (_, id) => {
    const base = 0x3200 + id * 68;
    return {
      id,
      filters: cart.rom[base + 64],
      speed: cart.rom[base + 65],
      loopStart: cart.rom[base + 66],
      loopEnd: cart.rom[base + 67],
      notes: Array.from({ length: 32 }, (_, n) => {
        const lo = cart.rom[base + n * 2],
          hi = cart.rom[base + n * 2 + 1];
        return {
          pitch: lo & 63,
          wave: (lo >> 6) | ((hi & 1) << 2),
          volume: (hi >> 1) & 7,
          effect: (hi >> 4) & 7,
          custom: !!(hi & 128),
        };
      }),
    };
  });
  const patterns = Array.from({ length: 64 }, (_, id) => {
    const b = cart.rom.slice(0x3100 + id * 4, 0x3104 + id * 4);
    return {
      id,
      loopStart: !!(b[0] & 128),
      loopEnd: !!(b[1] & 128),
      stop: !!(b[2] & 128),
      channels: [...b].map((v) => ({ sfx: v & 63, disabled: !!(v & 64) })),
    };
  });
  await writeFile(
    new URL("audio.json", dir),
    JSON.stringify({ sounds, patterns }, null, 2),
  );
  await writeFile(
    new URL("flags.json", dir),
    JSON.stringify([...cart.rom.slice(0x3000, 0x3100)]),
  );
  const session = await createPico8Session();
  let smoke;
  try {
    const loaded = await session.loadCart(bytes, {
      instructionBudget: 2000000,
    });
    if (loaded.state === "faulted")
      smoke = { passed: false, diagnostics: loaded.diagnostics };
    else {
      const r = await session.advance({ frames: 120 });
      smoke = {
        passed: r.outcome === "completed",
        frames: r.completedFrames,
        outcome: r.outcome,
        diagnostics: r.observation.diagnostics,
      };
      if (r.observation.frame) {
        await writeFile(new URL("frame.rgba", dir), r.observation.frame.rgba);
        smoke.frameSha256 = sha(r.observation.frame.rgba);
      }
    }
  } catch (error) {
    smoke = { passed: false, error: error.message };
  } finally {
    await session.dispose();
  }
  reports.push({
    id: entry.id,
    cartUrl: entry.cartUrl,
    cartSha256: sha(bytes),
    codeSha256: sha(cart.code),
    romSha256: sha(cart.rom),
    cartVersion: cart.version,
    codeBytes: cart.code.length,
    spriteColors: [...new Set(spriteRows.join(""))].sort(),
    nonzeroVolumeSfxSlots: sounds
      .filter((s) => s.notes.some((n) => n.volume))
      .map((s) => s.id),
    smoke,
    review:
      "Static source/asset inspection and startup smoke only; no full playthrough or listening review.",
  });
  console.log(
    entry.id,
    cart.code.length,
    smoke.passed ? "startup PASS" : "startup FAIL",
  );
}
await writeFile(
  new URL("inventory.json", import.meta.url),
  JSON.stringify(
    {
      collectedOn: "2026-11-12",
      cacheDirectory: ".cache/classic-study",
      games: reports,
    },
    null,
    2,
  ) + "\n",
);

if (reports.some((r) => !r.smoke.passed)) process.exitCode = 1;
