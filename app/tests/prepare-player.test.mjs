import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePlayer } from "../scripts/prepare-player.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "maker-player-test-"));
  const files = new Map(
    [
      "main/player.mjs",
      "player.css",
      "wasm/z8lua-runtime-v1.wasm",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ].map((path) => [path, Buffer.from(`fixture ${path}`)]),
  );
  const manifest = Buffer.from(
    JSON.stringify({
      artifactId: "pico8-player",
      apiVersion: 2,
      files: [...files].map(([path, bytes]) => ({
        path,
        bytes: bytes.length,
        sha256: hash(bytes),
      })),
    }),
  );
  files.set("manifest.json", manifest);
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    const bytes = files.get(request.url.slice(1));
    response.writeHead(bytes ? 200 : 404);
    response.end(bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const lockFile = join(directory, "player.lock.json");
  const lock = {
    baseUrl: `http://127.0.0.1:${server.address().port}/`,
    manifestSha256: hash(manifest),
  };
  await writeFile(lockFile, JSON.stringify(lock));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    files,
    lock,
    lockFile,
    options: {
      target: join(directory, "player"),
      lockFile,
      localDirectory: null,
    },
    requests: () => requests,
  };
}

test("downloads complete static files, reuses cache without network and repairs corruption", async (t) => {
  const f = await fixture(t);
  await preparePlayer(f.options);
  const requests = f.requests();
  assert.equal(requests, f.files.size);
  await preparePlayer(f.options);
  assert.equal(f.requests(), requests);
  await writeFile(join(f.options.target, "player.css"), "damaged");
  await preparePlayer(f.options);
  assert.deepEqual(
    await readFile(join(f.options.target, "player.css")),
    f.files.get("player.css"),
  );
});

test("a failed update preserves the previous usable player", async (t) => {
  const f = await fixture(t);
  await preparePlayer(f.options);
  const manifest = JSON.parse(f.files.get("manifest.json"));
  manifest.update = true;
  const bytes = Buffer.from(JSON.stringify(manifest));
  f.files.set("manifest.json", bytes);
  f.files.set("main/player.mjs", Buffer.from("truncated download"));
  await writeFile(
    f.lockFile,
    JSON.stringify({ ...f.lock, manifestSha256: hash(bytes) }),
  );
  await assert.rejects(preparePlayer(f.options), /checksum mismatch/);
  assert.equal(
    await readFile(join(f.options.target, "main/player.mjs"), "utf8"),
    "fixture main/player.mjs",
  );
});

test("rejects changed manifests and paths outside the destination", async (t) => {
  const f = await fixture(t);
  const manifest = JSON.parse(f.files.get("manifest.json"));
  manifest.files[0].path = "../escape.mjs";
  const bytes = Buffer.from(JSON.stringify(manifest));
  f.files.set("manifest.json", bytes);
  await assert.rejects(preparePlayer(f.options), /manifest SHA-256 mismatch/);
  await writeFile(
    f.lockFile,
    JSON.stringify({ ...f.lock, manifestSha256: hash(bytes) }),
  );
  await assert.rejects(
    preparePlayer(f.options),
    /Invalid player manifest file/,
  );
});

test("an explicit local build works without reaching the static host", async (t) => {
  const f = await fixture(t);
  await preparePlayer(f.options);
  const requests = f.requests();
  await preparePlayer({
    ...f.options,
    target: join(f.directory, "override"),
    localDirectory: f.options.target,
  });
  assert.equal(f.requests(), requests);
  assert.deepEqual(
    await readFile(join(f.directory, "override", "LICENSE")),
    f.files.get("LICENSE"),
  );
});
