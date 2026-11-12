// Documentation-only validation. Does not modify application code or user saves.
// Run from any directory: node docs/pico8-agent/recipes/verify.mjs
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPico8Session } from "../../../app/public/player/main/player.mjs";
import { createPicoApiHost, FrameSliceRuntime } from "../../../ref/pico8-web-player/packages/runtime-core/dist/public.js";
import { Z8LuaFrameVm, createPicoApiHostRouter } from "../../../ref/pico8-web-player/packages/z8lua-bridge/dist/public.js";
import createModule from "../../../ref/pico8-web-player/wasm/dist/z8lua-runtime-v1.mjs";

const base = new URL("./", import.meta.url);
const names = ["sprite-from-rows", "map-from-rows", "sfx-from-notes", "music-from-patterns", "save-high-score"];
const sources = Object.fromEntries(await Promise.all(names.map(async n => [n, await readFile(new URL(`${n}.lua`, base), "utf8")])));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const checks = [];
const input = buttons => ({ controllers: [buttons,0,0,0,0,0,0,0], devkit: {
  mouseXRaw: 0, mouseYRaw: 0, mouseButtons: 0, wheelRaw: 0,
  movementXRaw: 0, movementYRaw: 0, keypresses: [],
}});
const cart = source => new TextEncoder().encode(`pico-8 cartridge // http://www.pico-8.com\nversion 43\n__lua__\n${source}\n`);
async function load(s, source) {
  const r = await s.loadSource(source, { instructionBudget: 1000000 });
  assert.equal(r.state, "ready", JSON.stringify(r.diagnostics));
}
async function advance(s, frames = 1, buttons = 0) {
  const r = await s.advance({ frames, input: input(buttons) });
  assert.equal(r.outcome, "completed", JSON.stringify(r.observation.diagnostics));
  assert.equal(r.completedFrames, frames);
  assert.equal(r.observation.diagnostics.length, 0);
  return r.observation.frame;
}
function pixel(f,x,y) {
  const b=f.packedScreen[y*64+(x>>1)]; return x%2 ? b>>>4 : b&15;
}
async function check(name, fn) {
  const details = await fn(); checks.push({ name, passed: true, ...details });
  console.log(`PASS ${name}`);
}
async function session(fn) {
  const s=await createPico8Session(); try {return await fn(s);} finally {await s.dispose();}
}

for (const name of names) await check(`${name}: original Lua and exported cart`, () => session(async s => {
  await load(s,sources[name]); await advance(s,120);
  const r=await s.loadCart(cart(sources[name]));
  assert.equal(r.state,"ready",JSON.stringify(r.diagnostics));
  await advance(s,120);
  return { sourceSha256: sha(sources[name]), framesPerLoad:120 };
}));

await check("sprite transparency, animation and movement", () => session(async s => {
  await load(s,sources["sprite-from-rows"]);
  const first=await advance(s);
  assert.equal(pixel(first,60,60),1,"transparent corner must show background");
  assert.equal(pixel(first,61,61),11,"body colour");
  assert.equal(pixel(first,63,61),7,"eyes");
  assert.equal(pixel(first,60,67),11,"first pose foot");
  const second=await advance(s,20);
  assert.equal(pixel(second,60,67),1,"second pose foot moved");
  const moved=await advance(s,4,2);
  assert.equal(pixel(moved,65,61),11);
  assert.equal(pixel(moved,61,61),1);
}));

await check("map collision and coin collection", () => session(async s => {
  // Assertions are verification instrumentation, not a model-visible variable tool.
  const probe=`
local old_update=_update60
local step_no=0
function _update60()
 old_update() step_no+=1
 if step_no==1 or step_no==3 then assert(tx==1 and ty==2) end
 if step_no==11 then assert(tx==5 and coins==1 and mget(5,2)==0) end
end`;
  await load(s,sources["map-from-rows"]+probe);
  let frame;
  for(const b of [1,0,1,0,2,0,2,0,2,0,2]) frame=await advance(s,1,b);
  assert.equal(pixel(frame,1,33),9,"wall still present");
  assert.equal(pixel(frame,41,33),11,"player reached former coin tile");
}));

const module = await createModule();
for (const name of ["sfx-from-notes","music-from-patterns"]) {
  await check(`${name}: RAM, PCM and channel behaviour`, async () => {
    const vm=new Z8LuaFrameVm(module,createPicoApiHostRouter(module));
    const host=createPicoApiHost(vm.memory,vm.logicalMemory);
    const runtime=new FrameSliceRuntime(vm,{picoApiHost:host,instructionBudget:1000000});
    try {
      const r=runtime.boot({rom:new Uint8Array(0x8000),code:new TextEncoder().encode(sources[name])});
      assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.value.kind,"ready");
      const chunks=[Buffer.from(r.value.audio.pcm16le)];
      const sfx=runtime.copyRam(0x3200,68);
      assert.equal(sfx[0],24); assert.equal(sfx[65],name.startsWith("sfx")?8:4);
      assert.equal(sfx[1],name.startsWith("sfx")?10:8);
      const patterns=[];
      if (name.startsWith("music")) {
        assert.deepEqual([...runtime.copyRam(0x3100,8)],[128,1,64,64,2,131,64,64]);
      }
      const total=name.startsWith("music")?200:120;
      for(let i=0;i<total;i++) {
        const step=runtime.step(input(i===4?32:0));
        assert.equal(step.ok,true,JSON.stringify(step)); assert.equal(step.value.kind,"frame");
        chunks.push(Buffer.from(step.value.frame.audio.pcm16le));
        if(name.startsWith("music")) {
          const p=host.stat(54*65536)/65536;
          if(patterns.at(-1)!==p) patterns.push(p);
          if(i===4) {
            assert.equal(host.stat(49*65536)/65536,4,"X uses channel 3");
            assert.equal(host.stat(46*65536)/65536,0,"melody retained");
            assert.equal(host.stat(47*65536)/65536,1,"bass retained");
          }
        } else if(i===4) assert.equal(host.stat(49*65536)/65536,0);
      }
      const pcm=Buffer.concat(chunks);
      assert.ok(pcm.some(b=>b!==0),"actual PCM must not be silent");
      if(patterns.length) assert.deepEqual(patterns.slice(0,3),[0,1,0]);
      return {frames:total,pcmBytes:pcm.length,pcmSha256:sha(pcm),patterns, listeningReview:false};
    } finally {runtime.dispose();}
  });
}

await check("high score survives round reset, session reset and source reload", () => session(async s => {
  const source=sources["save-high-score"];
  await load(s,source);
  for(let i=0;i<3;i++) {await advance(s,1,32); await advance(s);}
  let frame=await advance(s,1,16);
  assert.equal(pixel(frame,16,66),10,"best=3 visible after O");
  const reset=await s.reset(); assert.equal(reset.state,"ready");
  frame=await advance(s);
  assert.equal(pixel(frame,16,66),10,"best=3 visible after native reset");
  await load(s,source+`\nlocal old_init=_init\nfunction _init() old_init() assert(score==0 and best==3 and dget(0)==1 and dget(1)==3) end`);
  await advance(s);
}));
await check("fresh memory session has isolated save", () => session(async s => {
  await load(s,sources["save-high-score"]+`\nlocal old_init=_init\nfunction _init() old_init() assert(best==0 and dget(0)==1) end`);
  const frame=await advance(s); assert.equal(pixel(frame,16,66),1);
}));
for(const version of [0,9]) await check(`save schema ${version}: migration or future-version preservation`, () => session(async s => {
  const best=version===0?7:23;
  await load(s,`function _init() cartdata("pico_maker_recipe_high_score_v1") dset(0,${version}) dset(1,${best}) end function _update60() end function _draw() cls() end`);
  await advance(s);
  const probe=version===0
    ? `local old_init=_init function _init() old_init() assert(best==7 and dget(1)==7 and dget(0)==1) end`
    : `local old_init=_init local old_update=_update60 function _init() old_init() score=24 assert(not save_writable) end function _update60() old_update() assert(dget(0)==9 and dget(1)==23) end`;
  await load(s,sources["save-high-score"]+"\n"+probe); await advance(s,1,32);
}));

await check("default/display palette and packed pixel mapping", () => session(async s => {
  await load(s,`function _draw() cls(0) pset(0,0,8) pset(1,0,10) pal(8,136,1) end`);
  const f=await advance(s);
  assert.equal(f.packedScreen[0],0xa8);
  assert.equal(f.displayPalette[8],136);
  const palette=JSON.parse(await readFile(new URL("../palette.json",base),"utf8"));
  const color=palette.colors.find(c=>c.displayCode===136);
  assert.equal("#"+[...f.rgba.slice(0,3)].map(n=>n.toString(16).padStart(2,"0")).join(""),color.rgb);
}));

await check("documentation palette, API coverage and local links", async () => {
  const root=new URL("../",base);
  const palette=JSON.parse(await readFile(new URL("palette.json",root),"utf8"));
  const source=await readFile(new URL("../../ref/pico8-web-player/apps/web-player/src/runtime/pico-frame.ts",root),"utf8");
  const blocks=source.split("new Uint8ClampedArray([").slice(1,3);
  const rgb=blocks.flatMap(b=>{
    const numbers=[...b.split("]);")[0].matchAll(/0x([0-9a-f]+)/g)].map(m=>parseInt(m[1],16));
    return Array.from({length:numbers.length/4},(_,i)=>"#"+numbers.slice(i*4,i*4+3).map(n=>n.toString(16).padStart(2,"0")).join(""));
  });
  assert.deepEqual(palette.colors.map(c=>c.rgb),rgb);
  const readable=await readFile(new URL("PALETTE.md",root),"utf8");
  assert.deepEqual([...readable.matchAll(/\| (#[0-9a-f]{6}) \|/g)].map(m=>m[1]),rgb);
  const inventory=JSON.parse(await readFile(new URL("../../ref/pico8-web-player/spec/pico-api-inventory.yaml",root),"utf8"));
  const catalog=await readFile(new URL("runtime-api-inventory.md",root),"utf8");
  for(const item of inventory.apis) assert.ok(catalog.includes("`"+[item.name,...(item.aliases??[])].join(", ")+"`"),item.name);
  async function walk(url) {
    for(const e of await readdir(url,{withFileTypes:true})) {
      const path=new URL(e.name+(e.isDirectory()?"/":""),url);
      if(e.isDirectory()) await walk(path);
      else if(e.name.endsWith(".md")) {
        const text=await readFile(path,"utf8");
        for(const m of text.matchAll(/\]\(([^)]+)\)/g)) {
          const target=m[1].replace(/^<|>$/g,"");
          if(/^(https?:|#)/.test(target)) continue;
          const resolved = new URL(target.split("#")[0],path);
          if (resolved.href === new URL("validation-results.json",root).href) continue; // Written after all checks pass.
          await readFile(resolved);
        }
      }
    }
  }
  await walk(root);
  return {paletteColors:32,apiEntries:inventory.apis.length};
});

const artifacts={};
for(const p of ["app/public/player/main/player.mjs","ref/pico8-web-player/wasm/dist/z8lua-runtime-v1.wasm","ref/pico8-web-player/packages/runtime-core/dist/audio/sfx-synth.js"]) {
  artifacts[p]=sha(await readFile(new URL("../../../"+p,base)));
}
const report={verifiedOn:"2026-11-12",node:process.version,checks,artifacts,
  limits:["No application integration or model calls","No browser persistence test","No subjective audio listening review","Probe assertions are verification-only, not new Agent tools"]};
await writeFile(new URL("../validation-results.json",base),JSON.stringify(report,null,2)+"\n");
console.log(`${checks.length} checks passed; report: ${fileURLToPath(new URL("../validation-results.json",base))}`);
