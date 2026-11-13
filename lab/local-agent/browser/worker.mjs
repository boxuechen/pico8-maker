// Dedicated Worker: the whole agent side in the browser. /cart lives in OPFS,
// /skill/pico8 in memory, p8 runs the real player runtime (wasm) in this worker,
// and the agent loop calls the model API directly.
//   { mode: "probe", cart, skillFiles }      p8 + shell + OPFS round trip, no model
//   { mode: "task", cart, skillFiles, prompt, systemPrompt, model, thinking, timeMs }
import { runBrowserAgent } from "../src/browser-agent.mjs";
import { CART, createEnvironment } from "../src/env.mjs";
import { openOpfsFs } from "../src/opfs-fs.mjs";

const post = (type, data) => self.postMessage({ type, ...data });

async function freshDir(name) {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(name, { recursive: true }).catch(() => {});
  return root.getDirectoryHandle(name, { create: true });
}

/** Everything under an OPFS directory, read straight from OPFS (not the in-memory view). */
async function listOpfs(dir, prefix = "") {
  const out = {};
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "directory") Object.assign(out, await listOpfs(h, `${prefix}${name}/`));
    else out[`${prefix}${name}`] = await (await h.getFile()).text();
  }
  return out;
}

async function probe({ cart, skillFiles }) {
  const dir = await freshDir("lab-probe");
  const cartFs = await openOpfsFs(dir, cart);
  const env = createEnvironment({ cartFs, skillFiles });
  const steps = [];
  const sh = async (command) => {
    const t0 = performance.now();
    const r = await env.exec(command, { cwd: CART });
    steps.push({ command, exitCode: r.exitCode, ms: Math.round(performance.now() - t0), out: (r.stdout + r.stderr).slice(0, 1500) });
  };
  await sh("p8 check");
  await sh("p8 run --press 'right*20' --read g.caught,g.player.x");
  await sh("p8 look --png screen.png | head -5");
  await sh("sed -i 's/goal=10/goal=15/' main.lua; grep -c goal main.lua");
  await sh("mkdir -p notes && echo hi > notes/a.txt && cp notes/a.txt notes/b.txt && mv notes/b.txt c.txt && rm notes/a.txt");
  await sh("echo x > /skill/pico8/SKILL.md");
  await cartFs.flushed();
  const onDisk = await listOpfs(dir);
  const reopened = await openOpfsFs(dir);
  return {
    steps,
    opfsFiles: Object.fromEntries(Object.entries(onDisk).map(([k, v]) => [k, k.endsWith(".png") ? `${v.length} bytes` : v.length > 80 ? `${v.slice(0, 80)}…` : v])),
    reopenedPaths: reopened.getAllPaths().filter((p) => p !== "/").sort(),
    memoryMatchesOpfs: (await cartFs.readFile("/main.lua")) === onDisk["main.lua"],
  };
}

async function task(job) {
  const dir = await freshDir(`lab-run-${Date.now()}`);
  const cartFs = await openOpfsFs(dir, job.cart);
  const env = createEnvironment({ cartFs, skillFiles: job.skillFiles });
  const run = await runBrowserAgent({
    env,
    prompt: job.prompt,
    systemPrompt: job.systemPrompt,
    model: job.model,
    thinking: job.thinking,
    timeMs: job.timeMs,
    onEvent: (e) => {
      if (e.type !== "message_end") return;
      const m = e.message;
      const calls = (m.content ?? []).filter((p) => p.type === "toolCall").map((p) => (p.name === "bash" ? `bash: ${p.arguments?.command?.slice(0, 80)}` : p.name));
      post("progress", { line: `${m.role}${calls.length ? ` → ${calls.join(" | ")}` : ""}${m.isError ? " (error)" : ""}` });
    },
  });
  await cartFs.flushed();
  const onDisk = await listOpfs(dir);
  return { ...run, source: onDisk["main.lua"] ?? "", files: Object.keys(onDisk).sort() };
}

self.onmessage = async ({ data }) => {
  try {
    post("result", { result: data.mode === "probe" ? await probe(data) : await task(data) });
  } catch (e) {
    post("result", { result: { status: "error", error: String(e?.stack ?? e).slice(0, 1500) } });
  }
};
