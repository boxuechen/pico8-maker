import { emptySnapshot } from "../../src/pico8/assets.js";
import { cartBytes } from "../../src/pico8/cart.js";
import { deflateSync } from "node:zlib";
import { Game } from "../../src/game.js";
import {
  createPico8Session,
  prepareInspection,
} from "../../public/player/main/player.mjs";

const blankSource = "function _draw() cls(0) end";
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
function png(rgba, width = 128, height = 128) {
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
export class TestGame extends Game {
  constructor() {
    super(() => {}, { versions: [emptySnapshot(blankSource)] });
    this.prepareInspection = prepareInspection;
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
      this.session = await createPico8Session({ inspection: true });
      await this.rpc("load", { cart: cartBytes(this.snapshot) });
    }
  }
  async rpc(action, args = {}) {
    if (action === "load") {
      await this.session?.dispose();
      this.session = await createPico8Session({ inspection: true });
      const result = await this.session.loadCart(args.cart);
      return { ...result, logs: this.session.readLogs() };
    }
    if (action === "advance") {
      const result = await this.session.advance({
        frames: args.frames,
        input: input(args.buttons),
      });
      return {
        ...result,
        observation: { ...result.observation, logs: this.session.readLogs() },
      };
    }
    if (action === "observe")
      return { ...this.session.observe(), logs: this.session.readLogs() };
    if (action === "inspect")
      return {
        inspection: await this.session.inspect(args.request),
        observation: {
          ...this.session.observe(),
          logs: this.session.readLogs(),
        },
      };
    throw Error("Unsupported test transport action " + action);
  }
  cancelTests() {
    /* guest execution is instruction-bounded; disposal follows abort */
  }
  image({ rgba, width, height }) {
    return {
      type: "image",
      mimeType: "image/png",
      data: png(rgba, width, height).toString("base64"),
    };
  }
  async dispose() {
    await this.session?.dispose();
    await this.live?.dispose();
  }
}
