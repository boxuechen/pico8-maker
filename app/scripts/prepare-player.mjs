import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const defaultTarget = fileURLToPath(
  new URL("../public/player/", import.meta.url),
);
const defaultLock = new URL("../player.lock.json", import.meta.url);

function parseManifest(bytes, expectedHash) {
  if (expectedHash && sha256(bytes) !== expectedHash)
    throw new Error("Player manifest SHA-256 mismatch");
  const manifest = JSON.parse(bytes);
  if (
    manifest.artifactId !== "pico8-player" ||
    manifest.apiVersion !== 2 ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error("Unsupported player manifest");
  }
  const paths = new Set();
  for (const file of manifest.files) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(file.path) ||
      file.path.startsWith("/") ||
      file.path
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      file.path === "manifest.json" ||
      paths.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0
    ) {
      throw new Error("Invalid player manifest file");
    }
    paths.add(file.path);
  }
  for (const required of [
    "main/player.mjs",
    "player.css",
    "wasm/z8lua-runtime-v1.wasm",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    if (!paths.has(required))
      throw new Error(`Player manifest missing ${required}`);
  }
  return manifest;
}

async function verify(directory, expectedHash) {
  const manifest = parseManifest(
    await readFile(join(directory, "manifest.json")),
    expectedHash,
  );
  for (const file of manifest.files) {
    const bytes = await readFile(join(directory, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
      throw new Error(`Player file checksum mismatch: ${file.path}`);
    }
  }
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok)
    throw new Error(`Player download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function preparePlayer({
  target = defaultTarget,
  lockFile = defaultLock,
  localDirectory = process.env.PICO8_PLAYER_DIR,
} = {}) {
  const lock = JSON.parse(await readFile(lockFile, "utf8"));
  if (!/^[a-f0-9]{64}$/.test(lock.manifestSha256))
    throw new Error("Invalid player lock checksum");
  if (localDirectory && resolve(localDirectory) === resolve(target))
    throw new Error("Player source and target must differ");
  if (!localDirectory) {
    try {
      await verify(target, lock.manifestSha256);
      console.log("Player ready (verified local cache).");
      return;
    } catch {
      /* Missing, changed or incomplete cache: fetch the pinned build. */
    }
  }
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), ".player-"));
  try {
    if (localDirectory) {
      await verify(resolve(localDirectory));
      await cp(resolve(localDirectory), staging, { recursive: true });
    } else {
      const base = new URL(lock.baseUrl);
      if (!base.pathname.endsWith("/"))
        throw new Error("Player baseUrl must end with /");
      const bytes = await download(new URL("manifest.json", base));
      const manifest = parseManifest(bytes, lock.manifestSha256);
      await writeFile(join(staging, "manifest.json"), bytes);
      // Settle every writer before cleaning staging after a failed download.
      const results = await Promise.allSettled(
        manifest.files.map(async (file) => {
          const content = await download(new URL(file.path, base));
          if (
            content.length !== file.bytes ||
            sha256(content) !== file.sha256
          ) {
            throw new Error(`Player file checksum mismatch: ${file.path}`);
          }
          await mkdir(dirname(join(staging, file.path)), { recursive: true });
          await writeFile(join(staging, file.path), content);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    }
    await verify(staging, localDirectory ? undefined : lock.manifestSha256);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    console.log(
      localDirectory
        ? "Player ready (explicit local build override)."
        : `Player downloaded from ${lock.baseUrl}`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await preparePlayer();
}
