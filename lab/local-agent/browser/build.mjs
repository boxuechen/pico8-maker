import { SHIMS, GENERIC } from "./shims.mjs";
// Bundle Pi's stock read/edit/write/bash tools and just-bash for the browser.
// Node built-ins are replaced by minimal shims (shims.mjs); Buffer is injected.
import { build } from "../../../app/node_modules/vite/node_modules/esbuild/lib/main.js";
const LAB = new URL("../", import.meta.url).pathname;
const D = `${LAB}node_modules/@earendil-works/pi-coding-agent/dist/core/tools`;
const builtins = /^(node:)?(fs|fs\/promises|path|os|url|util|util\/types|child_process|module|crypto|events|stream|buffer|worker_threads|perf_hooks|tty|readline|net|http|zlib|assert|process|v8|string_decoder|async_hooks|diagnostics_channel|sqlite)$/;
const touched = new Set();
const stub = { name: "stub-node", setup(b) {
  b.onResolve({ filter: builtins }, (a) => (touched.add(a.path.replace(/^node:/, "")), { path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: SHIMS[a.path.replace(/^node:/, "")] ?? GENERIC, loader: "js" }));
}};
const r = await build({
  stdin: { contents: `export { createBashToolDefinition } from "${D}/bash.js"; export { createReadToolDefinition } from "${D}/read.js"; export { createEditToolDefinition } from "${D}/edit.js"; export { createWriteToolDefinition } from "${D}/write.js"; export { Bash, InMemoryFs, MountableFs, defineCommand } from "${LAB}node_modules/just-bash/dist/bundle/browser.js";`, resolveDir: LAB, loader: "js" },
  inject: [new URL("./inject-buffer.mjs", import.meta.url).pathname], bundle: true, platform: "browser", format: "esm", outfile: new URL("./dist/tools.js", import.meta.url).pathname,
  banner: { js: "globalThis.global??=globalThis;globalThis.process??={env:{},platform:'browser',argv:[],versions:{},cwd:()=>'/',nextTick:(f,...a)=>queueMicrotask(()=>f(...a)),on(){},emitWarning(){}};" }, plugins: [stub], logLevel: "silent", metafile: true, define: { "process.env.NODE_ENV": '"production"' },
}).catch((e) => ({ errors: e.errors }));
if (r.errors?.length) { console.log("errors", r.errors.length, r.errors.slice(0, 5).map((e) => e.text)); process.exit(1); }
const out = Object.values(r.metafile.outputs)[0];
console.log("ok, bytes", out.bytes, "stubbed:", [...touched].sort().join(" "));
const top = Object.entries(r.metafile.inputs).map(([k, v]) => [k.replace(/.*node_modules\//, ""), v.bytes]).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(top.map(([k, v]) => `${(v / 1024).toFixed(0)}KB ${k}`).join("\n"));
