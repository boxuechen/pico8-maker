// Pi's stock read/edit/write/bash tools, unchanged in name, schema and wording,
// with their operations backed by the agent environment (env.mjs) instead of the
// host disk and shell. Paths outside the virtual filesystem simply do not exist.
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

function notFound(path) {
  const e = new Error(`ENOENT: no such file or directory, access '${path}'`);
  e.code = "ENOENT";
  return e;
}

export function piTools({ fs, exec, cwd }) {
  const readFile = async (p) => Buffer.from(await fs.readFileBuffer(p));
  const access = async (p) => {
    if (!(await fs.exists(p))) throw notFound(p);
  };
  const files = {
    readFile,
    access,
    writeFile: (p, content) => fs.writeFile(p, content),
    detectImageMimeType: async (p) => IMAGE_TYPES[p.split(".").pop()?.toLowerCase()] ?? null,
  };
  const operations = {
    exec: async (command, dir, { onData, signal, timeout }) => {
      const controller = new AbortController();
      const stop = () => controller.abort();
      signal?.addEventListener("abort", stop, { once: true });
      const timer = timeout ? setTimeout(stop, timeout * 1000) : undefined;
      try {
        const r = await exec(command, { cwd: dir, signal: controller.signal });
        const text = (r.stdout ?? "") + (r.stderr ?? "");
        if (text) onData(Buffer.from(text));
        return { exitCode: controller.signal.aborted ? 124 : r.exitCode };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
    },
  };
  return [
    createReadToolDefinition(cwd, { operations: files }),
    createEditToolDefinition(cwd, { operations: files }),
    createWriteToolDefinition(cwd, { operations: { writeFile: files.writeFile, mkdir: (d) => fs.mkdir(d, { recursive: true }) } }),
    createBashToolDefinition(cwd, { operations }),
  ];
}
