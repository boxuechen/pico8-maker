import { defineTool } from "@earendil-works/pi-durable";
import {
  createEditTool,
  createReadTool,
} from "@earendil-works/pi-durable/tools";
import { readAssetsSchema, editAssetsSchema } from "./asset-tools.js";
import { capabilities } from "./capabilities.js";
import { mountKnowledge } from "./knowledge-env.js";
import { mainPath } from "./workspace.js";
import { readSource, sourceRangeProperties } from "./source-read.js";
import { inputSchema } from "./input-sequence.js";
const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

// Executable capability contracts only. Task workflows live in the knowledge mount.
export function createPico8Tools({ game, knowledge }) {
  const descriptions = {
    read_assets:
      "Read authored resources without running the game. For map reads, supply x, y, width and height. PNG uses the base palette and includes sprite IDs/flags or a map grid.",
    edit_assets:
      "Apply atomic draft edits. Sprite rows use lowercase hex (0 for transparent pixels) and require rows or flags. Map patches must be rectangular. SFX and music edits replace slots. Use load_game to commit.",
    read_game: `Read the first source page of ${mainPath}, draft status and approximate budget. Use the returned read continuation for more source.`,
    load_game:
      "Compile the source and resource drafts, run one frame and commit them on success. Returns PNG and diagnostics. Failure retains the draft and last playable cart.",
    reset_game:
      "Reload the committed cart in the test Worker and advance one frame. Treat cartdata as potentially retained.",
    press_buttons:
      "Advance player 0 input in the test Worker. Button masks are left=1, right=2, up=4, down=8, O/Z=16, X=32. Add masks for combinations. Zero releases all buttons. Returns actual progress and PNG checkpoints, stopping early on runtime faults or stops.",
    observe_game:
      "Read the last completed test frame without advancing time. Use a small ASCII crop to inspect exact pixels with the frame's palette. Reset or advance if no frame exists.",
  };
  const parameters = {
    read_assets: readAssetsSchema,
    edit_assets: editAssetsSchema,
    observe_game: schema({
      format: {
        type: "string",
        enum: [...capabilities.observationFormats],
        description:
          "Defaults to png. Use ascii for pixel inspection or both for matched text and image.",
      },
      region: {
        ...schema(
          {
            x: { type: "integer", minimum: 0, maximum: 127 },
            y: { type: "integer", minimum: 0, maximum: 127 },
            width: { type: "integer", minimum: 1, maximum: 128 },
            height: { type: "integer", minimum: 1, maximum: 128 },
          },
          ["x", "y", "width", "height"],
        ),
        description:
          "Optional crop at original pixel resolution. Must fit within 128x128; omitted means full screen. Applies to every requested format.",
      },
    }),
    load_game: schema({
      source: {
        type: "string",
        description: `Complete replacement Lua for ${mainPath}. Omit to load the current draft. Resources are preserved.`,
      },
    }),
    press_buttons: inputSchema,
  };
  const env = mountKnowledge(game.workspace, knowledge);
  const read = createReadTool();
  const readTool = {
    ...read,
    description: `Read ${mainPath} or /extensions/pico8/ documents. Use line offset/limit or follow the returned continuation. Oversized source lines support byteOffset.`,
    parameters: {
      ...read.parameters,
      properties: { ...read.parameters.properties, ...sourceRangeProperties },
    },
    replay: "safe",
    execute: async (args, api, ctx) => {
      if (game.workspace?.resolve(args.path) === mainPath)
        return readSource(args, game.workspace, ctx);
      if (args.byteOffset !== undefined || args.byteLimit !== undefined)
        throw new Error(`Byte ranges are only available for ${mainPath}`);
      return read.execute(args, withEnv(api, env), ctx);
    },
  };
  // pi-durable's edit tool, always pointed at this cart's workspace rather than
  // whatever environment the harness has (it has none).
  const edit = createEditTool();
  const editTool = {
    ...edit,
    description: `Apply exact text replacements to ${mainPath} (main.lua). Changes stay in the draft until load_game.`,
    execute: (args, api, ctx) => {
      if (!game.workspace) throw new Error("No cart workspace is available");
      return edit.execute(args, withEnv(api, game.workspace), ctx);
    },
  };
  return [
    ...Object.entries(descriptions).map(([name, description]) =>
      defineTool({
        name,
        description,
        parameters: parameters[name] ?? schema(),
        replay:
          name === "read_assets" || name === "read_game" ? "safe" : "unsafe",
        ...(name === "read_assets"
          ? {
              outputLimits: {
                maxBytes: 32768,
                maxLines: 256,
                retain: "head",
              },
            }
          : {}),
        ...(name === "observe_game"
          ? {
              outputLimits: {
                maxBytes: capabilities.observationMaxBytes,
                maxLines: capabilities.observationMaxLines,
                retain: "head",
              },
            }
          : {}),
        execute: async (args, api, ctx) =>
          game.execute(name, args, ctx.abortSignal),
      }),
    ),
    editTool,
    readTool,
  ];
}

function withEnv(api, env) {
  return new Proxy(api ?? {}, {
    get(target, key) {
      if (key === "env") return env;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
