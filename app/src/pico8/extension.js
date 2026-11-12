import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import { capabilities } from "./capabilities.js";
const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export function createPico8Extension({ game, knowledge }) {
  if (!knowledge?.version || !knowledge.sections || !knowledge.references)
    throw new Error("PICO-8 knowledge is required");
  const descriptions = {
    read_game:
      "Read the complete current Lua source before modifying it. This is not a live-variable snapshot.",
    load_game:
      "Replace the game with complete Lua source, including procedural sprite/map/audio initialization. Compile and run one frame before committing. Returns PNG and diagnostics; startup success is not gameplay verification.",
    reset_game:
      "Reload the current source into the independent test session and advance one frame. This does not promise to erase cartdata.",
    press_buttons:
      "Hold a button mask for 1–120 logical frames and return the actual PNG. Left=1, right=2, up=4, down=8, O/Z=16, X=32. Add bits for combinations; 0 releases all buttons. These masks differ from Lua button indices.",
    observe_game:
      "Observe the latest completed test frame without advancing time. Default PNG for overall appearance; request ascii with a small region for exact pixels, or both for the same frame/region. ASCII uses screen slots 0-f and the actual frame's English palette legend. Coordinates are screen pixels from the top left. No live-variable or audio observation. A new test session may have no completed frame; reset or advance explicitly.",
  };
  const parameters = {
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
    load_game: schema(
      { source: { type: "string", maxLength: capabilities.maxSourceLength } },
      ["source"],
    ),
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
  const references = knowledge.references;
  return defineExtension({
    name: "pico8",
    sections: [
      ...Object.entries(knowledge.sections).map(([key, text]) =>
        section(key, () => text),
      ),
      section(
        "pico8_host",
        () =>
          `Submit complete Lua source (maximum ${capabilities.maxSourceLength} characters); initialize art, map and sound data in Lua. Game tools run sequentially. Test input: player 0, at most ${capabilities.maxInputFrames} frames. Default observation: ${capabilities.observation}. observe_game supports ${capabilities.observationFormats.join(", ")} and optional pixel-region cropping. Use PNG for overall appearance and cropped ASCII with the actual palette for precise pixels. Other game tools return PNG. No live-variable query or audio return. Test persistence: ${capabilities.persistence}; destroying its Worker loses that instance. Test and live player are separate. Historical frames are past evidence, not the current session state; establish a new baseline after restore. read_reference reads bundled documentation without operating the game. Source exports retain procedural initialization.`,
      ),
      section(
        "pico8_knowledge",
        () =>
          `Knowledge version: ${knowledge.version}. Reread relevant references if historical results have a different version.`,
      ),
    ],
    tools: [
      ...Object.entries(descriptions).map(([name, description]) =>
        defineTool({
          name,
          description,
          parameters: parameters[name] ?? schema(),
          replay: "unsafe",
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
      defineTool({
        name: "read_reference",
        description:
          "Read bundled English PICO-8 API guidance or a complete verified Lua recipe by exact ID. No network or game-state side effects.",
        parameters: schema(
          { id: { type: "string", enum: Object.keys(references) } },
          ["id"],
        ),
        replay: "safe",
        outputLimits: { maxBytes: 16384, maxLines: 256, retain: "head" },
        execute: async ({ id }, api, ctx) => {
          ctx.abortSignal?.throwIfAborted();
          if (!Object.hasOwn(references, id))
            return {
              isError: true,
              output: [
                {
                  type: "text",
                  text: `Unknown reference. Available IDs: ${Object.keys(references).join(", ")}`,
                },
              ],
            };
          const r = references[id];
          return {
            output: [{ type: "text", text: r.outputText }],
            details: {
              id,
              title: r.title,
              version: knowledge.version,
              sha256: r.sha256,
            },
          };
        },
      }),
    ],
  });
}
