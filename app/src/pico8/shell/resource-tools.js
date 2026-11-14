// Cart resources (sprites, flags, map, sfx, music) are not files: two
// structured tools read and edit the draft; p8 commits them with main.lua.
import { defineTool } from "@earendil-works/pi-durable";
import { editAssetsSchema, readAssetsSchema } from "../asset-tools.js";

export function createResourceTools(game) {
  return [
    defineTool({
      name: "read_assets",
      description:
        "Read authored resources without running the game. For map reads, supply x, y, width and height. PNG uses the base palette and includes sprite IDs/flags or a map grid.",
      parameters: readAssetsSchema,
      replay: "safe",
      outputLimits: { maxBytes: 32768, maxLines: 256, retain: "head" },
      execute: async (args, _api, ctx) => game.readAssets(args, ctx.abortSignal),
    }),
    defineTool({
      name: "edit_assets",
      description:
        "Apply atomic draft edits. Sprite rows use lowercase hex (0 for transparent pixels) and require rows or flags. Map patches must be rectangular. SFX and music edits replace slots. p8 check commits them with main.lua.",
      parameters: editAssetsSchema,
      replay: "unsafe",
      execute: async (args, _api, ctx) => game.editAssets(args, ctx.abortSignal),
    }),
  ];
}
