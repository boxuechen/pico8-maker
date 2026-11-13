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
    load_game:
      "Compile the source and resource drafts, run one frame and commit them on success. Returns PNG and diagnostics. Failure retains the draft and last playable cart.",
    reset_game:
      "Reload the committed cart and advance one frame. Starts a recorded route with fresh test memory saves. Purpose normal/debug defaults to normal and describes the setup.",
    press_buttons: `Advance player 0 input in the test Worker: at most ${capabilities.maxInputSteps} steps and ${capabilities.maxInputFrames} total frames. Button masks are left=1, right=2, up=4, down=8, O/Z=16, X=32. Add masks for combinations. Zero releases all buttons. Returns actual progress and PNG checkpoints, stopping early on runtime faults or stops.`,
    observe_game:
      "Read the last completed test frame without advancing time. Model PNGs are enlarged by imageScale (4); region coordinates always use native 128x128 pixels, so divide image positions by 4. Use a small ASCII crop to inspect exact pixels with the frame's palette. Reset or advance if no frame exists.",
    inspect_game:
      "Read raw globals/table paths in the test Worker without advancing frames or calling Lua. Example: {mode:'read',paths:[['g','board']]}. Sequences return arrays, string-keyed tables return objects; sparse or mixed tables keep {type:'table',entries}. Debug runs bounded Lua to set up a case without editing source; it marks the route debug unless it fails to compile. Example: {mode:'debug',code:'g.moves=1; return g.moves'}. staleFrame means the image predates a debug write; advance to render.",
  };
  const parameters = {
    reset_game: schema({
      purpose: { type: "string", enum: ["normal", "debug"] },
    }),
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
            x: { type: "integer" },
            y: { type: "integer" },
            width: { type: "integer", minimum: 1 },
            height: { type: "integer", minimum: 1 },
          },
          ["x", "y", "width", "height"],
        ),
        description:
          "Optional crop in native 128x128 pixel coordinates (not enlarged image pixels). Clipped to the screen; omitted means full screen. Applies to every requested format.",
      },
    }),
    load_game: schema({
      source: {
        type: "string",
        description: `Complete replacement Lua for ${mainPath}. Omit to load the current draft. Resources are preserved.`,
      },
    }),
    press_buttons: inputSchema,
    inspect_game: schema(
      {
        mode: { type: "string", enum: ["read", "debug"] },
        paths: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: { anyOf: [{ type: "string" }, { type: "integer" }] },
          },
        },
        code: { type: "string", minLength: 1, maxLength: 4096 },
      },
      ["mode"],
    ),
  };
  const env = mountKnowledge(game.workspace, knowledge);
  const read = createReadTool();
  const readTool = {
    ...read,
    description: `Read ${mainPath}, /cart/playtests.json (recorded routes), or /extensions/pico8/ documents. Use line offset/limit or the returned continuation. Only source supports byteOffset.`,
    parameters: {
      ...read.parameters,
      properties: { ...read.parameters.properties, ...sourceRangeProperties },
    },
    replay: "safe",
    execute: async (args, api, ctx) => {
      if (game.workspace?.resolve(args.path) === mainPath) {
        const { structuredOutput: _source, ...result } = await readSource(
          args,
          game.workspace,
          ctx,
        );
        return {
          ...result,
          diagnostics: [
            ...(result.diagnostics ?? []),
            {
              severity: "info",
              code: "cart_status",
              message: JSON.stringify(game.cartStatus()),
            },
          ],
        };
      }
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
    description: `${edit.description} Target ${mainPath} (main.lua); changes stay in the draft until load_game. Reread the current block after a matching failure.`,
    execute: async (args, api, ctx) => {
      if (!game.workspace) throw new Error("No cart workspace is available");
      try {
        return await edit.execute(args, withEnv(api, game.workspace), ctx);
      } catch (error) {
        if (
          error instanceof Error &&
          /^(Could not find (the exact text|edits\[)|Found \d+ occurrences)/.test(
            error.message,
          )
        )
          throw new Error(
            `${error.message}\nNo edits in this batch were applied. Use read on ${mainPath} for the current block, then retry with unique oldText copied from that read. All replacements in a batch must match the same original source.`,
            { cause: error },
          );
        throw error;
      }
    },
  };
  return [
    ...Object.entries(descriptions).map(([name, description]) =>
      defineTool({
        name,
        description,
        parameters: parameters[name] ?? schema(),
        replay: name === "read_assets" ? "safe" : "unsafe",
        ...(name === "read_assets"
          ? {
              outputLimits: {
                maxBytes: 32768,
                maxLines: 256,
                retain: "head",
              },
            }
          : {}),
        ...(["observe_game", "inspect_game"].includes(name)
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
