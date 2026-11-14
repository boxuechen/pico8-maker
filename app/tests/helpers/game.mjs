import { emptySnapshot } from "../../src/pico8/assets.js";
import { cartBytes } from "../../src/pico8/cart.js";
import { png } from "../../scripts/evaluation/png.mjs";
import { Game } from "../../src/game.js";
import { createPico8Session } from "../../public/player/main/player.mjs";

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
// Reuses Game.perform/execute and the real standalone runtime. Only browser
// rendering/storage/Worker transport are replaced.
export class TestGame extends Game {
  constructor() {
    super(() => {}, { versions: [emptySnapshot(blankSource)] });
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
