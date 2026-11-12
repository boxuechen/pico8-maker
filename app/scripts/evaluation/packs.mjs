import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { createKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { sha } from "./core.mjs";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const revisions = { A: "4460b30", B: "b1156e2" };
export async function freezePacks(directory) {
  const packs = {};
  for (const [condition, ref] of Object.entries(revisions)) {
    const revision = execFileSync("git", ["rev-parse", ref], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const dest = join(directory, "frozen", condition);
    await mkdir(dest, { recursive: true });
    const files = execFileSync(
      "git",
      [
        "ls-tree",
        "-r",
        "--name-only",
        revision,
        "docs/pico8-agent",
        "app/scripts/prepare-knowledge.mjs",
      ],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n");
    for (const file of files) {
      await mkdir(join(dest, file, ".."), { recursive: true });
      await writeFile(
        join(dest, file),
        execFileSync("git", ["show", revision + ":" + file], {
          cwd: root,
          maxBuffer: 10 * 1024 * 1024,
        }),
      );
    }
    // Evaluate frozen document sources through the current file-based runtime.
    await writeFile(
      join(dest, "app/scripts/prepare-knowledge.mjs"),
      await readFile(join(root, "app/scripts/prepare-knowledge.mjs")),
    );
    execFileSync(
      process.execPath,
      [join(dest, "app/scripts/prepare-knowledge.mjs")],
      { cwd: root },
    );
    const module = join(dest, "app/src/generated/pico8-files.js");
    const content = await readFile(module, "utf8");
    // Generated file is trusted output of the committed compiler, not model code.
    const { default: pack } = await import(pathToFileURL(module).href);
    await writeFile(
      join(directory, `pack-${condition}.json`),
      JSON.stringify(pack, null, 2),
    );
    const knowledge = createKnowledgeFiles({
      index: pack,
      load: (file) =>
        readFile(
          join(dest, "app/public/extensions/pico8", pack.version, file),
          "utf8",
        ),
    });
    packs[condition] = {
      pack,
      knowledge,
      revision,
      bundleSha256: sha(content),
    };
  }
  return packs;
}
