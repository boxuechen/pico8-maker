import test from "node:test";
import assert from "node:assert/strict";
import { TestGame } from "./helpers/game.mjs";
import { Agent } from "./helpers/agent.mjs";
import { defaultConfig } from "../src/model-config.js";
import {
  retainRecentImages,
  omittedImageText,
} from "../src/pico8/image-retention.js";

const img = { type: "image", data: "AA==", mimeType: "image/png" };
const result = (n) => ({
  role: "toolResult",
  content: [{ type: "text", text: "head" }, ...Array(n).fill(img)],
});
const count = (messages) =>
  messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((p) => p.type === "image").length;

test("old-request images are replaced and current-request cuts move in steps", () => {
  const old = [{ role: "user", content: "a" }, result(3)];
  const current = (n) => [
    ...old,
    { role: "user", content: "b" },
    ...Array.from({ length: n }, () => result(1)),
  ];
  // Earlier requests lose their images; up to 31 current images stay.
  for (const n of [0, 5, 31])
    assert.equal(count(retainRecentImages(current(n))), n);
  assert.equal(count(retainRecentImages(current(32))), 16);
  assert.equal(count(retainRecentImages(current(47))), 31);
  assert.equal(count(retainRecentImages(current(48))), 16);
  const kept = retainRecentImages(current(40));
  assert.equal(kept[1].content[1].text, omittedImageText);
  // The newest images remain and the cut is identical across 32..47 images.
  assert.equal(kept.at(-1).content[1].type, "image");
  const at = (n) =>
    retainRecentImages(current(n))
      .slice(0, 3 + 16)
      .map((m) => JSON.stringify(m));
  assert.deepEqual(at(32), at(47), "stable prefix between cut steps");
  // Unchanged input is returned as-is.
  const plain = [{ role: "user", content: "x" }, result(2)];
  assert.equal(retainRecentImages(plain), plain);
});

test("provider requests omit earlier-request frames while the transcript keeps them", async (t) => {
  const g = new TestGame();
  const bodies = [];
  let n = 0;
  // One p8 look writes a PNG; each read returns it as an image block.
  const route = [
    ["bash", { command: "p8 look --png s.png > /dev/null" }],
    ...Array.from({ length: 33 }, () => ["read", { path: "s.png" }]),
  ];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const call = route[n++];
    const delta = call
      ? {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `img-${n}`,
              type: "function",
              function: { name: call[0], arguments: JSON.stringify(call[1]) },
            },
          ],
        }
      : { role: "assistant", content: "done" };
    return new Response(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: call ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const agent = new Agent(g, () => {});
  t.after(async () => {
    await agent.dispose();
    await g.dispose();
  });
  await agent.open();
  await agent.configure({ ...defaultConfig, apiKey: "fixture" });
  await agent.send("Make frames.");
  const images = (body) =>
    (JSON.stringify(body.messages).match(/data:image\/png;base64/g) ?? [])
      .length;
  // bodies[k] follows the bash call and k-1 reads.
  assert.equal(images(bodies[25]), 24, "24 reads, all kept");
  assert.equal(images(bodies[34]), 33 - 16, "cut of 16 once 32 are exceeded");
  assert.match(
    JSON.stringify(bodies[34].messages),
    /Earlier frame image omitted/,
  );
  route.length = 0;
  await agent.send("Explain.");
  assert.equal(images(bodies.at(-1)), 0, "earlier requests send no images");
  const stored = JSON.stringify([...agent.transcriptEntries.values()]);
  assert.equal(stored.includes("Earlier frame image omitted"), false);
  assert.equal(
    [...agent.transcriptEntries.values()]
      .flatMap((e) => e.model ?? [])
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p) => p.type === "image").length,
    33,
    "transcript and UI keep every frame",
  );
});
