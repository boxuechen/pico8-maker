import {
  defineExtension,
  GenerationTask,
  hook,
  section,
} from "@earendil-works/pi-durable";
import { retainRecentImages } from "./image-retention.js";
import { createPico8Tools } from "./tools.js";
import { mainPath } from "./workspace.js";

// Stable startup order: author, machine, workflow, palette, host.
// Agent appends dynamic project state after these sections; references stay lazy.
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
        () => `# Host
The writable source is ${mainPath}. Source and native resource drafts commit together with load_game. Read-only docs live at /extensions/pico8/. Tools run sequentially. The test Worker is separate from live play and keeps saves in memory. It exposes pixels, raw global/table state and bounded logs. Knowledge version: ${knowledge.version}.`,
      ),
    ],
    tools: createPico8Tools({ game, knowledge }),
    hooks: [
      hook(GenerationTask, {
        beforeRequest: ({ messages }) => ({
          messages: retainRecentImages(messages),
        }),
      }),
    ],
  });
}
