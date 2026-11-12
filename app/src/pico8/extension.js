import { defineExtension, section } from "@earendil-works/pi-durable";
import { createPico8Tools } from "./tools.js";
import { capabilities } from "./capabilities.js";
import { mainPath } from "./workspace.js";

// Like Game Studio's entry skill, AGENT.md routes to task-specific documents.
// Pi registers code here; workflows are read lazily through the existing read tool.
export function createPico8Extension({ game, knowledge }) {
  if (!knowledge?.version || !knowledge.sections || !knowledge.read)
    throw new Error("PICO-8 knowledge is required");
  return defineExtension({
    name: "pico8",
    sections: [
      ...Object.entries(knowledge.sections).map(([key, path]) =>
        section(key, (_, ctx) => knowledge.read(path, ctx)),
      ),
      section(
        "pico8_host",
        () => `# Host capabilities

Workspace: one writable Lua file, ${mainPath}, and native resource drafts. read/edit access source; read_assets/edit_assets access authored resources, not live RAM. load_game commits source and resources together; exports use committed data only.
Documentation: /extensions/pico8 is read-only. The task router and reference index are already in your instructions; use read({path}) to load a selected workflow or reference. Reading documents does not operate the game. There is no shell.
Execution: sequential game tools. Test input is player 0, at most ${capabilities.maxInputFrames} logical frames per call. Load/reset/input return PNG. observe_game supports ${capabilities.observationFormats.join(", ")} (default ${capabilities.observation}) and optional pixel-region cropping, without advancing time. No live-variable query or audio return.
Sessions: test and live player are separate. Test persistence: ${capabilities.persistence}; destroying its Worker loses that instance. Historical frames are past evidence, not the current session state. Establish a new baseline before further gameplay tests after restore.`,
      ),
      section(
        "pico8_knowledge",
        () =>
          `Knowledge version: ${knowledge.version}. Reuse a workflow already read in the current context; reread relevant documents after a version change or if their contents are no longer available.`,
      ),
    ],
    tools: createPico8Tools({ game, knowledge }),
  });
}
