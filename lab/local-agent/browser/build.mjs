// Bundle browser/worker.mjs (agent loop, Pi tools, just-bash, p8, OPFS /cart) for
// a module Worker. Node built-ins become small shims (shims.mjs), Buffer is
// injected, Pi tools come straight from their files (not the Node-only package
// index), just-bash from its browser entry, and the player runtime stays
// external: it is served as-is at /player/ and loads its own wasm.
import { SHIMS, GENERIC } from "./shims.mjs";
import { build } from "../../../app/node_modules/vite/node_modules/esbuild/lib/main.js";
const LAB = new URL("../", import.meta.url).pathname;
const TOOLS = `${LAB}node_modules/@earendil-works/pi-coding-agent/dist/core/tools`;
const builtins = /^(node:)?(fs|fs\/promises|path|os|url|util|util\/types|child_process|module|crypto|events|stream|buffer|worker_threads|perf_hooks|tty|readline|net|http|https|zlib|assert|process|v8|string_decoder|async_hooks|diagnostics_channel|sqlite)$/;
const touched = new Set();
const lab = { name: "lab-browser", setup(b) {
  b.onResolve({ filter: builtins }, (a) => (touched.add(a.path.replace(/^node:/, "")), { path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: SHIMS[a.path.replace(/^node:/, "")] ?? GENERIC, loader: "js" }));
  b.onResolve({ filter: /^just-bash$/ }, () => ({ path: `${LAB}node_modules/just-bash/dist/bundle/browser.js` }));
  b.onResolve({ filter: /^@earendil-works\/pi-coding-agent$/ }, () => ({ path: "pi-tools", namespace: "pi-tools" }));
  b.onLoad({ filter: /.*/, namespace: "pi-tools" }, () => ({ resolveDir: LAB, loader: "js", contents: ["bash", "read", "edit", "write"].map((t) => `export { create${t[0].toUpperCase()}${t.slice(1)}ToolDefinition } from "${TOOLS}/${t}.js";`).join("\n") }));
  b.onResolve({ filter: /public\/player\/main\/player\.mjs$/ }, () => ({ path: "/player/main/player.mjs", external: true }));
}};
const r = await build({
  entryPoints: [new URL("./worker.mjs", import.meta.url).pathname],
  inject: [new URL("./inject-buffer.mjs", import.meta.url).pathname], bundle: true, platform: "browser", format: "esm", outfile: new URL("./dist/worker.js", import.meta.url).pathname,
  banner: { js: "globalThis.global??=globalThis;globalThis.process??={env:{},platform:'browser',argv:[],versions:{},cwd:()=>'/',nextTick:(f,...a)=>queueMicrotask(()=>f(...a)),on(){},emitWarning(){}};" }, plugins: [lab], logLevel: "silent", metafile: true, define: { "process.env.NODE_ENV": '"production"' },
}).catch((e) => ({ errors: e.errors }));
if (r.errors?.length) { console.log("errors", r.errors.length, r.errors.slice(0, 8).map((e) => `${e.location?.file}:${e.location?.line} ${e.text}`)); process.exit(1); }
const out = Object.values(r.metafile.outputs)[0];
console.log("ok, bytes", out.bytes, "stubbed:", [...touched].sort().join(" "));
const top = Object.entries(r.metafile.inputs).map(([k, v]) => [k.replace(/.*node_modules\//, ""), v.bytes]).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(top.map(([k, v]) => `${(v / 1024).toFixed(0)}KB ${k}`).join("\n"));
