// The shell flow: Pi's coding tools (pi-durable's read/write/edit/bash) over the
// shell environment, the pico8 skill and Maker host rules as startup text, and
// Maker's two resource tools. Selected per conversation; the frozen pico8
// extension is untouched.
import { defineExtension, GenerationTask, hook, section } from "@earendil-works/pi-durable";
import { createBashTool, createEditTool, createReadTool, createWriteTool } from "@earendil-works/pi-durable/tools";
import { retainRecentImages } from "../image-retention.js";
import { createPico8Tools } from "../tools.js";
import { codingPrompt, hostRules, skillBlock } from "./prompt.js";

const RESOURCE_TOOLS = ["read_assets", "edit_assets"];
// Their frozen wording names load_game, which this flow does not have.
const reword = (text) => text.replace(/Call load_game to commit/g, "Run p8 check to commit").replace(/\bload_game\b/g, "p8 check");

function resourceTool(tool) {
  return {
    ...tool,
    description: reword(tool.description),
    execute: async (...args) => {
      const result = await tool.execute(...args);
      return { ...result, output: result.output?.map((o) => (o.type === "text" ? { ...o, text: reword(o.text) } : o)) };
    },
  };
}

export function createShellExtension({ game, knowledge, skillFiles }) {
  if (!skillFiles?.["SKILL.md"]) throw new Error("The shell flow needs the pico8 skill");
  const resources = createPico8Tools({ game, knowledge }).filter((t) => RESOURCE_TOOLS.includes(t.name));
  return defineExtension({
    name: "pico8-shell",
    sections: [
      section("shell_prompt", () => codingPrompt, { tag: false }),
      section("shell_skill", () => skillBlock(skillFiles["SKILL.md"]), { tag: false }),
      section("pico8_host", () => hostRules),
    ],
    tools: [createReadTool(), createWriteTool(), createEditTool(), createBashTool(), ...resources.map(resourceTool)],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: ({ messages }) => ({ messages: retainRecentImages(messages) }),
      }),
    ],
  });
}
