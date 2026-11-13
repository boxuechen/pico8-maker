// Prompt assembly. Every phase gets its full instructions resident; there is no
// document lookup tool.
import { readFileSync } from "node:fs";

const file = (name) => readFileSync(new URL(`../prompts/${name}`, import.meta.url), "utf8").trim();
export const prompts = {
  core: file("core.md"),
  api: file("api.md"),
  plan: file("plan.md"),
  build: file("build.md"),
  test: file("test.md"),
  template: `${file("template.lua")}\n`,
  example: file("example.lua"),
};

export const systemFor = {
  plan: () => `${prompts.core}\n\n${prompts.plan}`,
  build: () => `${prompts.core}\n\n${prompts.api}\n\nA complete example game:\n\`\`\`lua\n${prompts.example}\n\`\`\`\n\n${prompts.build}`,
  test: () => `${prompts.core}\n\n${prompts.api}\n\n${prompts.test}`,
};
