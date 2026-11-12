import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import {
  createEditTool,
  createReadTool,
} from "@earendil-works/pi-durable/tools";
import { capabilities } from "./capabilities.js";
import { mountKnowledge } from "./knowledge-env.js";
import { mainPath } from "./workspace.js";
const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export function createPico8Extension({ game, knowledge }) {
  if (!knowledge?.version || !knowledge.sections || !knowledge.read)
    throw new Error("PICO-8 knowledge is required");
  const descriptions = {
    read_game: `Read the complete working source, the workspace file ${mainPath} (path main.lua for edit). Read it before editing. This is not a live-variable snapshot.`,
    load_game: `Compile ${mainPath}, run one frame and commit it as a new version. Omit source after targeted edit calls; pass complete Lua source (including procedural sprite/map/audio initialization) to replace the whole file for a new game or a rewrite. A failed compile keeps the file unchanged and uncommitted so it can be fixed with edit. Returns PNG and diagnostics; startup success is not gameplay verification.`,
    reset_game:
      "Reload the last committed version into the independent test session and advance one frame. Uncommitted edits are not loaded. This does not promise to erase cartdata.",
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
    load_game: schema({
      source: {
        type: "string",
        maxLength: capabilities.maxSourceLength,
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
    replay: "safe",
    execute: (args, api, ctx) => read.execute(args, withEnv(api, env), ctx),
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
  return defineExtension({
    name: "pico8",
    sections: [
      ...Object.entries(knowledge.sections).map(([key, path]) =>
        section(key, (_, ctx) => knowledge.read(path, ctx)),
      ),
      section(
        "pico8_host",
        () =>
          `The cart is one workspace file, ${mainPath} (maximum ${capabilities.maxSourceLength} characters); initialize art, map and sound data in Lua. For repairs and focused changes, read_game, then edit main.lua with exact unique oldText blocks, then load_game without source; this preserves unrelated code and avoids resending the whole cart. For a new game or a rewrite of most of the file, pass the complete source to load_game. Edits take effect only after load_game succeeds. Read-only documentation is mounted at /extensions/pico8. Use read({path}) to consult Markdown or Lua examples; start with /extensions/pico8/REFERENCE_INDEX.md. There is no shell. Game tools run sequentially. Test input: player 0, at most ${capabilities.maxInputFrames} frames. Default observation: ${capabilities.observation}. observe_game supports ${capabilities.observationFormats.join(", ")} and optional pixel-region cropping. Use PNG for overall appearance and cropped ASCII with the actual palette for precise pixels. Other game tools return PNG. No live-variable query or audio return. Test persistence: ${capabilities.persistence}; destroying its Worker loses that instance. Test and live player are separate. Historical frames are past evidence, not the current session state; establish a new baseline after restore. Reading documentation does not operate the game. Source exports retain procedural initialization.`,
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
      editTool,
      readTool,
    ],
  });
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
