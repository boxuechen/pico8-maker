// Maker's agent: Pi's coding tools (pi-durable's read/write/edit/bash) over the
// shell environment (main.lua and the resource files), the pico8 skill and
// Maker host rules as startup text.
import { defineExtension, GenerationTask, hook, section } from "@earendil-works/pi-durable";
import { createBashTool, createEditTool, createReadTool, createWriteTool } from "@earendil-works/pi-durable/tools";
import { retainRecentImages } from "../image-retention.js";
import { codingPrompt, hostRules, skillBlock } from "./prompt.js";

export function createShellExtension({ game, skillFiles }) {
  if (!skillFiles?.["SKILL.md"]) throw new Error("The shell flow needs the pico8 skill");
  return defineExtension({
    name: "pico8",
    sections: [
      section("shell_prompt", () => codingPrompt, { tag: false }),
      section("shell_skill", () => skillBlock(skillFiles["SKILL.md"]), { tag: false }),
      section("pico8_host", () => hostRules),
    ],
    tools: [createReadTool(), createWriteTool(), createEditTool(), createBashTool()],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: ({ messages }) => ({ messages: retainRecentImages(messages) }),
      }),
    ],
  });
}
