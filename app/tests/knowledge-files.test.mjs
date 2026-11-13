import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createKnowledgeFiles } from "../src/pico8/knowledge-files.js";
import { mountKnowledge } from "../src/pico8/knowledge-env.js";
import { CartWorkspace } from "../src/pico8/workspace.js";
import { createPico8Extension } from "../src/pico8/extension.js";
import { knowledge, index, load } from "./helpers/knowledge.mjs";

const path = "/extensions/pico8/references/audio.md";
test("startup loads the full Workflow once; references stay lazy and cached", async () => {
  const loaded = [];
  const docs = createKnowledgeFiles({
    load: async (file) => {
      loaded.push(file);
      return load(file);
    },
  });
  await docs.prepare();
  assert.deepEqual(loaded.sort(), Object.values(index.sections).sort());
  assert.ok(!loaded.includes("references/audio.md"));
  assert.ok(!loaded.includes("REFERENCE_INDEX.md"));
  assert.ok(loaded.includes("WORKFLOW.md"));
  assert.ok(!Object.hasOwn(index.files, "SKILLS.md"));
  assert.ok(!loaded.some((file) => file.startsWith("skills/")));
  const a = mountKnowledge(null, docs),
    b = mountKnowledge(null, docs);
  const [x, y] = await Promise.all([
    a.readTextFile(path),
    b.readTextFile(path),
  ]);
  assert.equal(x.value, y.value);
  assert.equal(loaded.filter((f) => f === "references/audio.md").length, 1);
  await Promise.all([
    a.readTextFile("/extensions/pico8/WORKFLOW.md"),
    b.readTextFile("/extensions/pico8/WORKFLOW.md"),
  ]);
  assert.equal(loaded.filter((file) => file === "WORKFLOW.md").length, 1);
  await assert.rejects(
    () => docs.read("/extensions/pico8/skills/pico8-create/SKILL.md"),
    /Unknown/,
  );
});
test("HTTP loader uses versioned paths, rejects errors/hash mismatches and retries", async (t) => {
  const urls = [];
  let mode = "missing";
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return new Response(
      mode === "valid" ? await load("references/audio.md") : "wrong body",
      { status: mode === "missing" ? 404 : 200 },
    );
  });
  const docs = createKnowledgeFiles();
  await assert.rejects(() => docs.read(path), /404/);
  mode = "invalid";
  await assert.rejects(() => docs.read(path), /version mismatch/);
  mode = "valid";
  assert.equal(await docs.read(path), await load("references/audio.md"));
  assert.ok(
    urls.every(
      (u) => u === `/extensions/pico8/${index.version}/references/audio.md`,
    ),
  );
  await assert.rejects(() => docs.read("../../secrets"), /Unknown/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => docs.read(path, { abortSignal: abort.signal }));
  assert.equal(urls.length, 3);
});
test("required entry failures prevent preparation", async () => {
  const docs = createKnowledgeFiles({
    load: async (file) => {
      if (file === "WORKFLOW.md") throw Error("offline");
      return load(file);
    },
  });
  await assert.rejects(() => docs.prepare(), /offline/);
});
test("read supports UTF-8 line ranges and documents stay read-only across carts", async () => {
  let sourceA = "print('a')",
    sourceB = "print('b')";
  const a = new CartWorkspace({
    read: () => sourceA,
    write: (text) => {
      sourceA = text;
    },
  });
  const b = new CartWorkspace({
    read: () => sourceB,
    write: (text) => {
      sourceB = text;
    },
  });
  const env = mountKnowledge(a, knowledge);
  assert.equal(
    (await env.writeFile(path, "changed")).error.code,
    "permission_denied",
  );
  assert.equal((await env.appendFile(path, "changed")).ok, false);
  assert.equal(
    (await env.readTextFile("/extensions/pico8/../../etc/passwd")).ok,
    false,
  );
  const tool = createPico8Extension({
    game: { workspace: a, cartStatus: () => ({ draftDirty: false }) },
    knowledge,
  }).tools.find((t) => t.name === "read");
  assert.equal(
    (await tool.execute({ path: "main.lua" }, {}, {})).output[0].text,
    sourceA,
  );
  const document = await load("references/audio.md");
  const result = await tool.execute(
    {
      path,
      offset: 22,
      limit: 10,
    },
    {},
    {},
  );
  assert.ok(
    result.output[0].text.includes(
      document.split("\n").slice(21, 31).join("\n"),
    ),
  );
  await a.writeFile("main.lua", "print('updated')");
  assert.equal(
    (await mountKnowledge(b, knowledge).readTextFile("main.lua")).value,
    sourceB,
  );
  const text = "first\n中文🙂\nthird\n";
  const bytes = Buffer.from(text);
  const docs = createKnowledgeFiles({
    index: {
      version: "test",
      sections: {},
      files: {
        "test.md": {
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      },
    },
    load: async () => text,
  });
  const read = createPico8Extension({ game: {}, knowledge: docs }).tools.find(
    (t) => t.name === "read",
  );
  assert.equal(
    (
      await read.execute(
        { path: "/extensions/pico8/test.md", offset: 2, limit: 1 },
        {},
        {},
      )
    ).output[0].text,
    "中文🙂",
  );
});
test("published Markdown and Lua are original files; metadata contains no bodies", async () => {
  assert.ok(!Object.hasOwn(index.files, "runtime-api-inventory.md"));
  const manifest = JSON.parse(
    await readFile(
      new URL("../../docs/pico8-agent/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  for (const file of new Set([
    ...Object.values(manifest.sections),
    ...manifest.references.map((r) => r.file),
  ])) {
    assert.equal(
      await load(file),
      await readFile(
        new URL(`../../docs/pico8-agent/${file}`, import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(Object.keys(index.files[file]).sort(), ["sha256", "size"]);
  }
});
