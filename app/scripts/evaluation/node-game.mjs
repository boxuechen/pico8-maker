import { Worker } from "node:worker_threads";
import { Game } from "../../src/game.js";
import { cartBytes } from "../../src/pico8/cart.js";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { png } from "./png.mjs";

// Use the production Worker protocol and Game's timeout/cancellation, replacing
// only browser transport and PNG encoding. Never mount or persist a user cart.
export class EvaluationGame extends Game {
  constructor(options) {
    super(() => {}, options);
    this.url = new URL(
      "../../public/player/main/player.mjs",
      import.meta.url,
    ).href;
    this.player = {
      pause: async () => {},
      loadCart: async (bytes) => {
        this.live ??= await createPico8Session();
        const r = await this.live.loadCart(bytes);
        if (r.state === "faulted") throw Error("Live cart load failed");
      },
    };
  }
  async ensureWorker() {
    if (this.worker) return;
    const entry = new URL("../../src/test-worker.js", import.meta.url).href;
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');
   globalThis.self={postMessage:data=>parentPort.postMessage(data)};
   import(${JSON.stringify(entry)}).then(()=>{
    parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true});
   });`,
      { eval: true, execArgv: [] },
    );
    this.worker = worker;
    worker.on("error", () => {
      if (this.worker === worker) this.cancelTests("Evaluation Worker failed");
    });
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        worker.off("message", ready);
        worker.off("error", failed);
        worker.off("exit", exited);
        error ? reject(error) : resolve();
      };
      const ready = (data) => {
        if (data.ready) finish();
      };
      const failed = (error) => finish(error);
      const exited = () =>
        finish(Error("Evaluation Worker stopped during startup"));
      const timer = setTimeout(() => {
        this.cancelTests("Evaluation Worker startup timed out");
        finish(Error("Evaluation Worker startup timed out"));
      }, 12000);
      worker.on("message", ready);
      worker.once("error", failed);
      worker.once("exit", exited);
    });
    if (this.worker !== worker)
      throw Error("Evaluation Worker startup cancelled");
    worker.on("exit", () => {
      if (this.worker === worker) this.cancelTests("Evaluation Worker exited");
    });
    worker.on("message", (data) => {
      const item = this.pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(data.id);
      data.error ? item.reject(Error(data.error)) : item.resolve(data.result);
    });
    await this.rpc("init", { url: this.url });
    if (this.hasGame)
      await this.rpc("load", { cart: cartBytes(this.snapshot) });
  }
  image({ rgba, width, height }) {
    return {
      type: "image",
      mimeType: "image/png",
      data: png(rgba, width, height).toString("base64"),
    };
  }
  async dispose() {
    this.cancelTests();
    await this.live?.dispose();
  }
}
