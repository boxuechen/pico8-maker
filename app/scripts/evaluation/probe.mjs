// Independent review only. Never supplied to generation agents.
// Copies selected state into unused scratch RAM after draw, without changing
// game variables. Original Lua remains immutable; generated inputs are archived.
import {
  createPicoApiHost,
  FrameSliceRuntime,
} from "../../../ref/pico8-web-player/packages/runtime-core/dist/public.js";
import {
  Z8LuaFrameVm,
  createPicoApiHostRouter,
} from "../../../ref/pico8-web-player/packages/z8lua-bridge/dist/public.js";
import createModule from "../../../ref/pico8-web-player/wasm/dist/z8lua-runtime-v1.mjs";
import { input, sha, png } from "./core.mjs";
import { writeFile } from "node:fs/promises";
import palette from "../../src/generated/pico8-palette.js";
export function frameRgba(frame) {
  const out = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < 16384; i++) {
    const index = (frame.screen[i >> 1] >> ((i % 2) * 4)) & 15;
    const raw = frame.displayPalette[index],
      code = (raw & 128) | (raw & 15);
    const rgb = palette.find((p) => p.displayCode === code).rgb;
    out.set(
      [
        parseInt(rgb.slice(1, 3), 16),
        parseInt(rgb.slice(3, 5), 16),
        parseInt(rgb.slice(5, 7), 16),
        255,
      ],
      i * 4,
    );
  }
  return out;
}
const module = await createModule();
export function probe(source, fields) {
  const vm = new Z8LuaFrameVm(module, createPicoApiHostRouter(module));
  const host = createPicoApiHost(vm.memory, vm.logicalMemory);
  const runtime = new FrameSliceRuntime(vm, {
    picoApiHost: host,
    instructionBudget: 1000000,
  });
  const expressions = Object.values(fields);
  const append = `\nlocal audit_draw=_draw\nfunction _draw()\n if audit_draw then audit_draw() end\n local values={${expressions.map((e) => `tostr(${e})`).join(",")}}\n local data=""\n for i,v in ipairs(values) do data=data..v.."|" end\n poke2(0x4300,min(#data,1022))\n for i=1,min(#data,1022) do poke(0x4301+i,ord(data,i)) end\nend\n`;
  const boot = runtime.boot({
    rom: new Uint8Array(0x8000),
    code: new TextEncoder().encode(source + append),
  });
  if (!boot.ok) {
    runtime.dispose();
    throw Error(JSON.stringify(boot));
  }
  let frame = boot.value,
    frames = 0;
  const audio = [],
    trace = [];
  const read = () => {
    const bytes = runtime.copyRam(0x4300, 1024),
      size = bytes[0] + bytes[1] * 256;
    const values = new TextDecoder()
      .decode(bytes.slice(2, 2 + size))
      .split("|");
    return Object.fromEntries(
      Object.keys(fields).map((key, i) => [key, values[i]]),
    );
  };
  function step(buttons = 0, count = 1) {
    for (let i = 0; i < count; i++) {
      const r = runtime.step(input(buttons));
      if (!r.ok) {
        trace.push({ buttons, frames: i + 1, at: frames + 1, error: r.error });
        throw Error(JSON.stringify(r));
      }
      if (r.value.kind !== "frame") throw Error("Not a frame");
      frame = r.value.frame;
      frames++;
      audio.push(Buffer.from(frame.audio.pcm16le));
    }
    const state = read();
    trace.push({ buttons, frames: count, at: frames, state });
    return state;
  }
  return {
    read,
    step,
    runtime,
    host,
    frame: () => frame,
    trace,
    save: async (path) => writeFile(path, png(frameRgba(frame))),
    finish: () => {
      const pcm = Buffer.concat(audio);
      runtime.dispose();
      return {
        frames,
        sourceSha256: sha(source),
        fields,
        trace,
        pcmBytes: pcm.length,
        nonSilentPcm: pcm.some((b) => b !== 0),
        pcmSha256: sha(pcm),
        instrumentation:
          "Read-only copies of state into scratch RAM after _draw; no changes to game variables",
        humanReview: false,
      };
    },
  };
}
