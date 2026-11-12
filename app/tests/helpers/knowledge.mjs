import { readFile } from "node:fs/promises";
import index from "../../src/generated/pico8-files.js";
import { createKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { Agent as BrowserAgent } from "../../src/agent.js";
export { index };
export const load = (file) =>
  readFile(
    new URL(
      `../../public/extensions/pico8/${index.version}/${file}`,
      import.meta.url,
    ),
    "utf8",
  );
export const knowledge = createKnowledgeFiles({ load });
export class Agent extends BrowserAgent {
  constructor(game, onUpdate, options = {}) {
    super(game, onUpdate, { knowledge, ...options });
  }
}
