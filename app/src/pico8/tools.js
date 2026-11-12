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
      "Read authored resource drafts. Omit all arguments for used-slot inventory. Use kind/id/count for sprite, sfx or music; kind=map requires x,y,width,height (max 32×32). Does not read live RAM or advance the game.",
    edit_assets:
      "Atomically edit native cartridge resources. Sprites use eight 8-pixel hex rows (0–f), optional flags. Map patches use rectangular tile-id rows, within 128×32. SFX replaces one slot; omitted tail notes are silent, loops default off. Music replaces one pattern; four SFX ids or null, flags default false. A sprite edit requires rows or flags; omitted fields preserve that sprite's other data. Resources are loaded before _init. Edits affect only the draft until load_game; invalid batches apply nothing. Read occupied slots before allocating ids. All 256 sprites are available; map rows 32–63 share sprite memory and are not editable by this tool.",
    read_game: `Read the first page of the current working source, ${mainPath}, plus draft/committed status and approximate code budget. Bounded to 2000 lines or 50 KiB. Follow the returned read({path,offset}) or byteOffset continuation until the needed source is read. Repeating read_game starts at the beginning. Not a live-variable snapshot.`,
    load_game: `Compile ${mainPath} with the current resource draft, run one frame and commit both as a new version. Omit source after targeted edit calls; pass complete Lua source (game logic; static resources are edited separately with edit_assets) to replace the whole file for a new game or a rewrite. Failure retains both drafts and the previous committed playable cart. Passing source never clears resource drafts. Returns PNG and diagnostics; startup success is not gameplay verification.`,
    reset_game:
      "Reload the last committed version into the independent test session and advance one frame. Uncommitted edits are not loaded. This does not promise to erase cartdata.",
    press_buttons: `Hold a button mask for 1–${capabilities.maxInputFrames} logical frames and return the actual PNG. Left=1, right=2, up=4, down=8, O/Z=16, X=32. Add bits for combinations; 0 releases all buttons. These masks differ from Lua button indices.`,
    observe_game:
      "Observe the latest completed test frame without advancing time. Load/reset/input already return PNG. Repeated observation returns the same completed frame until input/reset/load changes it. Default PNG for overall appearance; request ascii with a small region for exact pixels, or both for the same frame/region. ASCII uses screen slots 0-f and the actual frame's English palette legend. Coordinates are screen pixels from the top left. No live-variable or audio observation. A new test session may have no completed frame; reset or advance explicitly.",
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
        description: `Optional complete Lua source that replaces ${mainPath} before loading. Omit to load the current file.`,
      },
    }),
    press_buttons: schema(
      {
        frames: {
          type: "integer",
          minimum: 1,
          maximum: capabilities.maxInputFrames,
        },
        buttons: { type: "integer", minimum: 0, maximum: 63 },
      },
      ["frames", "buttons"],
    ),
  };
  const env = mountKnowledge(game.workspace, knowledge);
  const read = createReadTool();
  const readTool = {
    ...read,
    description: `${read.description} For an oversized line in ${mainPath}, use the returned byteOffset continuation; no shell is available.`,
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
    description: `${edit.description} Only ${mainPath} is writable (relative path main.lua). Changes are not live until load_game.`,
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
