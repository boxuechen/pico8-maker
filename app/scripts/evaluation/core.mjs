import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Game } from "../../src/game.js";
import { createPico8Session } from "../../public/player/main/player.mjs";
import {
  observationOptions,
  observationText,
  cropRgba,
} from "../../src/pico8/observation.js";

export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const blankSource =
  'function _draw()\n cls(0)\n print("new game",48,60,7)\nend';
export const input = (buttons = 0) => ({
  controllers: [buttons, 0, 0, 0, 0, 0, 0, 0],
  devkit: {
    mouseXRaw: 0,
    mouseYRaw: 0,
    mouseButtons: 0,
    wheelRaw: 0,
    movementXRaw: 0,
    movementYRaw: 0,
    keypresses: [],
  },
});
function crc(bytes) {
  let n = -1;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ -1) >>> 0;
}
export function png(rgba, width = 128, height = 128) {
  const chunk = (type, bytes) => {
    const t = Buffer.from(type),
      sz = Buffer.alloc(4),
      c = Buffer.alloc(4);
    sz.writeUInt32BE(bytes.length);
    c.writeUInt32BE(crc(Buffer.concat([t, bytes])));
    return Buffer.concat([sz, t, bytes, c]);
  };
  const h = Buffer.alloc(13);
  h.writeUInt32BE(width, 0);
  h.writeUInt32BE(height, 4);
  h[8] = 8;
  h[9] = 6;
  const stride = width * 4,
    rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    rows.set(rgba.slice(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// Reuses Game.perform/execute and the real standalone runtime. Only browser
// rendering/storage/Worker transport are replaced; tools and observations remain.
export class EvaluationGame extends Game {
  constructor(onVersion = () => {}) {
    super(() => {}, { versions: [blankSource] });
    this.onVersion = onVersion;
    this.player = {
      pause: async () => {},
      loadCart: async (bytes) => {
        this.live ??= await createPico8Session();
        const r = await this.live.loadCart(bytes);
        if (r.state === "faulted") throw Error(JSON.stringify(r.diagnostics));
      },
    };
  }
  async ensureWorker() {
    if (!this.session) {
      this.session = await createPico8Session();
      await this.rpc("load", { source: this.source });
    }
  }
  async rpc(action, args = {}) {
    if (action === "load")
      return this.session.loadSource(args.source, {
        instructionBudget: 1000000,
      });
    if (action === "advance")
      return this.session.advance({
        frames: args.frames,
        input: input(args.buttons),
      });
    if (action === "observe") return this.session.observe();
    throw Error("Unsupported evaluation transport action " + action);
  }
  save() {
    this.onVersion(this.source, this.revision);
  }
  cancelTests() {
    /* guest execution is instruction-bounded; disposal follows abort */
  }
  output(observation, options = observationOptions()) {
    const output = [
      { type: "text", text: observationText(observation, options) },
    ];
    if (observation.frame && options.format !== "ascii")
      output.push({
        type: "image",
        mimeType: "image/png",
        data: png(
          cropRgba(observation.frame, options.region),
          options.region.width,
          options.region.height,
        ).toString("base64"),
      });
    return { output, isError: observation.state === "faulted" };
  }
  async dispose() {
    await this.session?.dispose();
    await this.live?.dispose();
  }
}
export class RunBudget {
  constructor({ tokens = 200000, tools = 80, milliseconds = 720000 } = {}) {
    this.limits = { tokens, tools, milliseconds };
    this.started = Date.now();
    this.tokens = 0;
    this.toolCalls = 0;
    this.reason = null;
  }
  check() {
    if (!this.reason && Date.now() - this.started >= this.limits.milliseconds)
      this.reason = "time_budget";
    if (!this.reason && this.tokens >= this.limits.tokens)
      this.reason = "token_budget";
    if (this.reason) throw Error(this.reason);
  }
  tool() {
    this.check();
    if (this.toolCalls >= this.limits.tools) {
      this.reason = "tool_budget";
      throw Error(this.reason);
    }
    this.toolCalls++;
  }
  usage(u) {
    this.tokens +=
      u?.totalTokens ??
      (u?.input ?? 0) +
        (u?.output ?? 0) +
        (u?.cacheRead ?? 0) +
        (u?.cacheWrite ?? 0);
  }
  snapshot() {
    return {
      limits: this.limits,
      elapsedMs: Date.now() - this.started,
      reportedTokens: this.tokens,
      toolCalls: this.toolCalls,
      stopReason: this.reason,
      tokenOvershoot: Math.max(0, this.tokens - this.limits.tokens),
    };
  }
}
