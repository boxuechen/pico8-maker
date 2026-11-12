import { mkdir, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../../", import.meta.url));
const root = resolve(app, "..");

// Dev-only, loopback-only result archive. No model credentials reach this route.
export function skillsRecorder() {
  const initialized = new Set();
  return {
    name: "local-skills-evaluation",
    configureServer(server) {
      server.middlewares.use("/__skills-evaluation", async (req, res) => {
        try {
          const origin = new URL(req.headers.origin ?? "http://invalid");
          if (
            req.method !== "POST" ||
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress,
            ) ||
            !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
            origin.host !== req.headers.host
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            const buffer = Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > 30 * 1024 * 1024) throw new Error("Report too large");
            chunks.push(buffer);
          }
          // A network chunk may split a Chinese character or emoji in a prompt.
          const text = Buffer.concat(chunks).toString("utf8");
          const report = JSON.parse(text);
          if (
            !/^[0-9a-f-]{36}$/.test(report.id) ||
            report.schemaVersion !== 1 ||
            !Array.isArray(report.runs)
          )
            throw new Error("Invalid evaluation report");
          const path = `.cache/evaluations/skills-${report.id}`;
          const dir = resolve(root, path);
          if (!initialized.has(report.id)) {
            await mkdir(dir, { recursive: true });
            await cp(resolve(app, "src"), resolve(dir, "execution/src"), {
              recursive: true,
            });
            await cp(
              resolve(app, "scripts/evaluation"),
              resolve(dir, "execution/evaluation"),
              { recursive: true },
            );
            await cp(
              resolve(app, "public/extensions/pico8"),
              resolve(dir, "execution/knowledge"),
              { recursive: true },
            );
            await cp(
              resolve(app, "package-lock.json"),
              resolve(dir, "execution/package-lock.json"),
            );
            initialized.add(report.id);
          }
          await writeFile(resolve(dir, "report.json"), text);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ path: `${path}/report.json` }));
        } catch {
          res.statusCode = 400;
          res.end("Could not store evaluation");
        }
      });
    },
  };
}
