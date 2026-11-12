import http from "node:http";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = resolve(
  process.argv[2] ?? ".cache/evaluations/deepseek-flash-20261112-round1",
);
const plan = JSON.parse(await readFile(join(dir, "plan.json"), "utf8"));
let mapping;
try {
  mapping = JSON.parse(await readFile(join(dir, "blind-map.json"), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  const pairs = new Map();
  for (const r of plan.runs) {
    const k = r.task + "-" + r.repeat;
    if (!pairs.has(k)) pairs.set(k, []);
    pairs.get(k).push(r);
  }
  mapping = [...pairs.values()].map((runs, index) => ({
    number: index + 1,
    task: runs[0].task,
    prompt: runs[0].prompt,
    repeat: runs[0].repeat,
    cards: randomInt(2)
      ? runs.map((r) => r.id)
      : runs.map((r) => r.id).reverse(),
  }));
  await writeFile(
    join(dir, "blind-map.json"),
    JSON.stringify(mapping, null, 2),
  );
}
const ids = new Set(plan.runs.map((r) => r.id));
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".png": "image/png",
  ".p8": "text/plain; charset=utf-8",
};
async function file(res, path) {
  if (path instanceof URL) path = fileURLToPath(path);
  try {
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not available");
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/")
      return file(res, new URL("review.html", import.meta.url));
    if (req.method === "GET" && u.pathname === "/manifest") {
      const pairs = await Promise.all(
        mapping.map(async (p) => ({
          ...p,
          cards: await Promise.all(
            p.cards.map(async (id) => {
              let ready = false;
              try {
                ready = JSON.parse(
                  await readFile(join(dir, id, "result.json"), "utf8"),
                ).checks.createdGame;
              } catch {}
              return { id, ready };
            }),
          ),
        })),
      );
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify({
          pairs,
          limits: plan.limits,
          model: plan.config.model,
        }),
      );
    }
    const cart = u.pathname.match(/^\/cart\/([a-f0-9]{8})\.p8$/);
    if (req.method === "GET" && cart && ids.has(cart[1]))
      return file(res, join(dir, cart[1], "final.p8"));
    const player = u.pathname.match(/^\/player\/([a-zA-Z0-9_./-]+)$/);
    if (req.method === "GET" && player && !player[1].split("/").includes(".."))
      return file(res, join(root, "app/public/player", player[1]));
    if (req.method === "POST" && u.pathname === "/ratings") {
      if (req.headers.origin !== `http://127.0.0.1:${server.address().port}`) {
        res.writeHead(403);
        return res.end("Origin mismatch");
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16000) {
          res.writeHead(413);
          return res.end();
        }
      }
      const rating = JSON.parse(body),
        pair = mapping.find((p) => p.number === rating.pair);
      if (
        !pair ||
        !["left", "right", "tie", "unable"].includes(rating.preference) ||
        typeof rating.reviewer !== "string" ||
        !rating.reviewer.trim()
      )
        throw Error("Invalid rating");
      const dimensions = [
        "clarity",
        "control",
        "choice",
        "pacing",
        "presentation",
        "replay",
      ];
      if (
        !["left", "right"].every((side) =>
          dimensions.every(
            (d) =>
              rating[side]?.[d] === null ||
              (Number.isInteger(rating[side]?.[d]) &&
                rating[side][d] >= 1 &&
                rating[side][d] <= 5),
          ),
        )
      )
        throw Error("All 12 scores are required");
      await mkdir(join(dir, "reviews"), { recursive: true });
      await appendFile(
        join(dir, "reviews/human.jsonl"),
        JSON.stringify({
          ...rating,
          cards: pair.cards,
          at: new Date().toISOString(),
          kind: "human-submitted",
        }) + "\n",
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"saved":true}');
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    res.writeHead(400);
    res.end("Invalid request");
  }
});
server.listen(Number(process.argv[3] ?? 5193), "127.0.0.1", () =>
  console.log(
    `Blind review: http://127.0.0.1:${server.address().port} (local only; treatment mapping is not served)`,
  ),
);
