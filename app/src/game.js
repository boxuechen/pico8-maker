import { capabilities } from "./pico8/capabilities.js";
import {
  observationOptions,
  observationText,
  cropRgba,
} from "./pico8/observation.js";
import { cartridgeBytes } from "./cartridges.js";
import {
  emptySnapshot,
  sameSnapshot,
  readAssets,
  editAssets,
} from "./pico8/assets.js";
import { downloadCart, cartBytes } from "./pico8/cart.js";
import { CartWorkspace } from "./pico8/workspace.js";

export class Game {
  constructor(onChange, { versions, revision, draft, onSave, onDraft } = {}) {
    this.onSave = onSave;
    this.onDraft = onDraft;
    this.onChange = onChange;
    this.versions = versions?.slice(-12) ?? [];
    // A user-facing version number survives the 12-entry undo window.
    this.revision = Math.max(
      revision ?? this.versions.length,
      this.versions.length,
    );
    // Immutable source/resource snapshots. Only main.lua is exposed as a file.
    this.draft = { ...(draft ?? this.snapshot) };
    this.workspace = new CartWorkspace({
      read: () => this.draft.source,
      write: (text) => this.setDraft(text),
    });
    this.pending = new Map();
    this.nextId = 0;
    this.queue = Promise.resolve();
    this.state = "loading";
    this.testFrame = null;
    this.muted = false;
  }
  get source() {
    return this.snapshot.source;
  }
  get snapshot() {
    return this.versions.at(-1) ?? emptySnapshot();
  }
  get hasGame() {
    return this.versions.length > 0;
  }
  setDraft(text) {
    this.setWorking({ ...this.draft, source: text });
  }
  setWorking(snapshot) {
    if (sameSnapshot(snapshot, this.draft)) return;
    this.draft = { ...snapshot };
    this.onDraft?.(this.draft);
    this.changed();
  }
  changed(extra = {}) {
    this.onChange({
      state: this.state,
      source: this.source,
      snapshot: this.snapshot,
      draft: this.draft,
      hasGame: this.hasGame,
      canUndo: this.versions.length > 1,
      revision: this.revision,
      testFrame: this.testFrame,
      muted: this.muted,
      activeCart: this.activeCart ?? null,
      booting: this.booting ?? false,
      ...extra,
    });
  }
  async mount(root) {
    this.url = new URL(
      `${import.meta.env.BASE_URL}player/main/player.mjs`,
      location.href,
    ).href;
    const lib = await import(/* @vite-ignore */ this.url);
    this.player = await lib.createPico8WebPlayer({
      root,
      shell: "hosted",
      execution: "worker",
      commandTimeoutMs: 12000,
    });
    this.offState = this.player.on("state", (e) => {
      this.state = e.state;
      this.changed();
    });
    this.offFault = this.player.on("fault", (e) =>
      this.changed({ error: e.error.message }),
    );
    const muteButton = this.player.root.querySelector('[data-action="mute"]');
    const syncMute = () => {
      this.muted = muteButton.getAttribute("aria-pressed") === "true";
      this.changed();
    };
    this.muteObserver = new MutationObserver(syncMute);
    this.muteObserver.observe(muteButton, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
    syncMute();
    if (this.hasGame)
      await this.player.loadCart(cartBytes(this.snapshot), {
        displayName: "my-game.p8",
      });
    if (!this.muted) this.mute();
    this.changed();
  }
  async ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./test-worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }) => {
      const item = this.pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(data.id);
      data.error
        ? item.reject(new Error(data.error))
        : item.resolve(data.result);
    };
    this.worker.onerror = () => this.cancelTests("测试进程异常，已停止。");
    await this.rpc("init", { url: this.url });
    if (this.hasGame)
      await this.rpc("load", { cart: cartBytes(this.snapshot) });
  }
  rpc(action, args = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.cancelTests("运行超时，测试已终止。"),
        12000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, action, ...args });
    });
  }
  cancelTests(message = "测试已停止") {
    this.worker?.terminate();
    this.worker = null;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
    this.testFrame = null;
    this.changed();
  }
  async boot() {
    this.booting = true;
    this.changed();
    await new Promise((resolve) => {
      this.finishBoot = resolve;
      this.bootTimer = setTimeout(resolve, 1400);
    });
    this.finishBoot = null;
    this.booting = false;
    this.changed();
  }
  async previewCart(cart) {
    this.testFrame = null;
    this.activeCart = cart;
    this.changed();
    try {
      const [loaded] = await Promise.allSettled([
        this.player.loadCart(cartridgeBytes(cart.id), {
          displayName: `${cart.id}.p8.png`,
        }),
        this.hasPoweredOn ? Promise.resolve() : this.boot(),
      ]);
      if (loaded.status === "rejected") throw loaded.reason;
      if (this.disposed) return;
      await this.player.start();
      this.hasPoweredOn = true;
      this.player.canvas.focus();
    } catch (error) {
      await this.restoreProject();
      throw error;
    }
    this.changed();
  }
  async restoreProject() {
    if (!this.activeCart) return;
    if (this.hasGame)
      await this.player.loadCart(cartBytes(this.snapshot), {
        displayName: "my-game.p8",
      });
    else await this.player.pause();
    this.activeCart = null;
    this.testFrame = null;
    this.changed();
  }
  async play() {
    if (!this.hasGame && !this.activeCart) return;
    this.testFrame = null;
    this.changed();
    if (this.player.state === "running") await this.player.pause();
    else if (this.player.state === "paused") await this.player.resume();
    else {
      if (this.player.state !== "ready") await this.player.reset();
      await this.player.start();
    }
    this.player.canvas.focus();
  }
  async restart() {
    if (!this.hasGame && !this.activeCart) return;
    this.testFrame = null;
    await this.player.reset();
    await this.player.start();
    this.player.canvas.focus();
    this.changed();
  }
  mute() {
    this.player.root.querySelector('[data-action="mute"]').click();
  }
  save() {
    this.onSave?.([...this.versions], this.revision);
  }
  async undo() {
    if (this.versions.length < 2) return;
    const previous = this.versions.at(-2);
    await this.player.loadCart(cartBytes(previous));
    this.cancelTests();
    this.activeCart = null;
    this.versions.pop();
    this.revision = Math.max(1, this.revision - 1);
    this.setWorking(this.snapshot);
    this.save();
    this.changed();
  }
  /** Save the current source as a .p8 cart, labelled with an RGBA frame. */
  export({ title, label } = {}) {
    if (!this.hasGame) return;
    downloadCart(this.snapshot, { title, label });
  }
  /** Swap in another cart's versions without rebooting the player. */
  async switchProject(versions, revision, draft) {
    this.cancelTests("Switched to another cart.");
    this.versions = versions?.slice(-12) ?? [];
    this.revision = Math.max(
      revision ?? this.versions.length,
      this.versions.length,
    );
    this.draft = { ...(draft ?? this.snapshot) };
    this.activeCart = null;
    this.testFrame = null;
    if (this.player) {
      if (this.hasGame)
        await this.player.loadCart(cartBytes(this.snapshot), {
          displayName: "my-game.p8",
        });
      else await this.player.pause();
    }
    this.changed();
  }
  execute(action, args, signal) {
    const job = this.queue.then(async () => {
      signal?.throwIfAborted();
      const abort = () => this.cancelTests();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        return await this.perform(action, args, signal);
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async perform(action, args, signal) {
    if (
      ![
        "read_assets",
        "edit_assets",
        "read_game",
        "load_game",
        "reset_game",
        "press_buttons",
        "observe_game",
      ].includes(action)
    )
      throw new Error(`未知游戏工具：${action}`);
    if (action === "read_game")
      return { output: [{ type: "text", text: this.draft.source }] };
    if (action === "read_assets")
      return {
        output: [
          {
            type: "text",
            text: JSON.stringify(readAssets(this.draft.assets, args)),
          },
        ],
      };
    if (action === "edit_assets") {
      const assets = editAssets(this.draft.assets, args.edits);
      const changed = assets !== this.draft.assets;
      this.setWorking({ ...this.draft, assets });
      return {
        output: [
          {
            type: "text",
            text: changed
              ? "Resource draft updated. Call load_game to commit source and resources together."
              : "Resources unchanged.",
          },
        ],
      };
    }
    if (action !== "load_game" && !this.hasGame)
      throw new Error(
        "No game has been loaded yet. Write main.lua and call load_game first.",
      );
    const options = observationOptions(action === "observe_game" ? args : {});
    await this.ensureWorker();
    await this.player.pause();
    let observation;
    let note = "";
    if (action === "load_game") {
      if (args.source !== undefined && typeof args.source !== "string")
        throw new Error("源码应为 Lua 文本");
      // A full source replaces the working file first; otherwise load the edits.
      if (args.source !== undefined) this.setDraft(args.source);
      const snapshot = { ...this.draft };
      const source = snapshot.source;
      if (!source.trim())
        throw new Error(
          "main.lua is empty. Write game source before loading it.",
        );
      observation = await this.rpc("load", { cart: cartBytes(snapshot) });
      if (observation.state !== "faulted")
        observation = (await this.rpc("advance", { frames: 1, buttons: 0 }))
          .observation;
      if (observation.state === "faulted") {
        const result = this.output(observation);
        if (this.hasGame)
          await this.rpc("load", { cart: cartBytes(this.snapshot) });
        else this.cancelTests();
        result.output[0].text +=
          "\nNot committed: source and resource drafts are retained. Fix the draft, then call load_game again." +
          (this.hasGame
            ? " The test session still runs the last loaded version."
            : " No playable version exists yet.");
        return { ...result, isError: true };
      }
      signal?.throwIfAborted();
      if (sameSnapshot(snapshot, this.snapshot))
        note =
          "\nSource and resources are unchanged since the last load; no new version.";
      else {
        try {
          await this.player.loadCart(cartBytes(snapshot));
          signal?.throwIfAborted();
        } catch (error) {
          // A rejected/cancelled live load may already have replaced its runtime.
          // Never leave a playable uncommitted combination in either player.
          this.cancelTests();
          if (this.hasGame)
            await this.player.loadCart(cartBytes(this.snapshot));
          else await this.player.pause();
          throw error;
        }
        this.versions.push(snapshot);
        this.versions = this.versions.slice(-12);
        this.revision++;
        this.save();
        note = `\nCommitted as version ${this.revision}.`;
      }
    } else if (action === "press_buttons") {
      if (
        !Number.isInteger(args.frames) ||
        args.frames < 1 ||
        args.frames > capabilities.maxInputFrames
      )
        throw new Error(`frames 必须为 1–${capabilities.maxInputFrames}`);
      if (
        !Number.isInteger(args.buttons) ||
        args.buttons < 0 ||
        args.buttons > 63
      )
        throw new Error("buttons 必须为 0–63");
      observation = (await this.rpc("advance", args)).observation;
    } else if (action === "reset_game") {
      await this.rpc("load", { cart: cartBytes(this.snapshot) });
      observation = (await this.rpc("advance", { frames: 1, buttons: 0 }))
        .observation;
    } else observation = await this.rpc("observe");
    if (observation.frame) this.testFrame = observation.frame;
    this.changed();
    const result = this.output(observation, options);
    if (note) result.output[0].text += note;
    return result;
  }
  output(observation, options = observationOptions()) {
    const { frame } = observation;
    const output = [
      {
        type: "text",
        text: observationText(observation, options),
      },
    ];
    if (frame && options.format !== "ascii") {
      const { width, height } = options.region;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas
        .getContext("2d")
        .putImageData(
          new ImageData(cropRgba(frame, options.region), width, height),
          0,
          0,
        );
      output.push({
        type: "image",
        data: canvas.toDataURL("image/png").split(",")[1],
        mimeType: "image/png",
      });
    }
    return { output, isError: observation.state === "faulted" };
  }
  async dispose() {
    this.disposed = true;
    clearTimeout(this.bootTimer);
    this.finishBoot?.();
    this.cancelTests();
    this.muteObserver?.disconnect();
    this.offState?.();
    this.offFault?.();
    await this.player?.dispose();
  }
}
