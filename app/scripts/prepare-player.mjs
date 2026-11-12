import { cp, access, rm } from "node:fs/promises";
const source = new URL(
  "../../ref/pico8-web-player/apps/web-player/dist/release/",
  import.meta.url,
);
const target = new URL("../public/player/", import.meta.url);
try {
  await access(new URL("main/player.mjs", source));
} catch {
  throw new Error(
    "请先在 ref/pico8-web-player 按 docs/development.md 构建 WASM 和 release，再运行本项目。",
  );
}
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(
  "Prepared pico8-web-player standalone release (including licenses).",
);
