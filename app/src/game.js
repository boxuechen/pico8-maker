import {
  observationOptions,
  observationText,
  cropRgba,
  modelImage,
  modelImageScale,
} from "./pico8/observation.js";
import { cartridgeBytes } from "./cartridges.js";
import {
  emptySnapshot,
  sameSnapshot,
  readAssets,
  editAssets,
  decodeAssets,
} from "./pico8/assets.js";
import { downloadCart, cartBytes } from "./pico8/cart.js";
import { sourceBudget } from "./pico8/source-budget.js";
import { runInputs } from "./pico8/input-sequence.js";
import { assetPreview, assetChanges } from "./pico8/asset-preview.js";
import {
  Playtests,
  coverageNote,
  fingerprint,
  resetPurpose,
  revisionCoverage,
} from "./pico8/playtests.js";

export class Game {
  constructor(
    onChange,
    {
      versions,
      revision,
      draft,
      onSave,
      onDraft,
      playtests,
      onPlaytests,
      comparison,
      onComparison,
    } = {},
  ) {
    this.onSave = onSave;
    this.onDraft = onDraft;
    this.onChange = onChange;
    this.comparison = comparison ?? null;
    this.onComparison = onComparison;
    this.previewVersion = "current";
    this.onPlaytests = onPlaytests;
    this.playtests = new Playtests(playtests, onPlaytests);
    this.versions = versions?.slice(-12) ?? [];
    // A user-facing version number survives the 12-entry undo window.
    this.revision = Math.max(
      revision ?? this.versions.length,
      this.versions.length,
    );
    // Immutable source/resource snapshots. Only main.lua is exposed as a file.
    this.draft = { ...(draft ?? this.snapshot) };
    this.pending = new Map();
    this.nextId = 0;
    this.queue = Promise.resolve();
    this.state = "loading";
    this.testFrame = null;
    this.testStateSeq = 0;
    this.testFrames = [];
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
  cartStatus(observed) {
    if (this.budgetSource !== this.draft.source) {
      this.budgetSource = this.draft.source;
      this.budget = sourceBudget(this.draft.source);
    }
    return {
      committedRevision: this.hasGame ? this.revision : null,
      draftDirty: !sameSnapshot(this.draft, this.snapshot),
      draftSourceBudget: this.budget,
      ...(observed
        ? {
            observed: {
              kind: observed,
              cartRevision: observed === "committed" ? this.revision : null,
            },
          }
        : {}),
    };
  }
  cartSummary() {
    return {
      committedRevision: this.hasGame ? this.revision : null,
      draftDirty: !sameSnapshot(this.draft, this.snapshot),
    };
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
      testFrames: this.testFrame ? this.testFrames : null,
      muted: this.muted,
      activeCart: this.activeCart ?? null,
      booting: this.booting ?? false,
      comparisonRevision:
        this.comparison &&
        !sameSnapshot(this.comparison.snapshot, this.snapshot)
          ? this.comparison.revision
          : null,
      previewVersion: this.previewVersion,
      previewLoading: this.previewLoading ?? false,
      previewSource:
        this.previewVersion === "before"
          ? this.comparison.snapshot.source
          : this.source,
      ...extra,
    });
  }
  async mount(root) {
    this.url = new URL(
      `${import.meta.env.BASE_URL}player/main/player.mjs`,
      location.href,
    ).href;
    const lib = await import(/* @vite-ignore */ this.url);
    this.player = await lib.createPico8Player({
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
    this.playtests.stop();
    this.worker?.terminate();
    this.worker = null;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
    this.testFrame = null;
    this.testStateSeq = 0;
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
        this.player.loadCart(cart.bytes ?? cartridgeBytes(cart.id), {
          displayName: cart.fileName ?? `${cart.id}.p8.png`,
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
    if (!this.activeCart && this.previewVersion === "current") return;
    if (this.hasGame)
      await this.player.loadCart(cartBytes(this.snapshot), {
        displayName: "my-game.p8",
      });
    else await this.player.pause();
    this.activeCart = null;
    this.previewVersion = "current";
    this.testFrame = null;
    this.changed();
  }
  beginRequest() {
    this.requestBaseline = this.hasGame
      ? { snapshot: { ...this.snapshot }, revision: this.revision }
      : null;
    // One user request makes at most one version: later commits replace it.
    this.requestVersion = null;
  }
  endRequest() {
    this.requestBaseline = null;
    this.requestVersion = null;
  }
  async previewComparison(version) {
    if (
      !["current", "before"].includes(version) ||
      (version === "before" && !this.comparison)
    )
      throw new Error("No comparison version is available.");
    if (this.previewLoading) return;
    this.previewLoading = true;
    this.testFrame = null;
    this.changed();
    try {
      const snapshot =
        version === "before" ? this.comparison.snapshot : this.snapshot;
      await this.player.loadCart(cartBytes(snapshot));
      this.previewVersion = version;
      this.activeCart = null;
      await this.player.start();
      this.player.canvas?.focus();
    } catch (error) {
      this.previewVersion = "current";
      await this.player.loadCart(cartBytes(this.snapshot));
      throw error;
    } finally {
      this.previewLoading = false;
      this.changed();
    }
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
    this.previewVersion = "current";
    this.comparison = null;
    this.onComparison?.(null);
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
  async switchProject(versions, revision, draft, playtests, comparison) {
    this.cancelTests("Switched to another cart.");
    this.playtests = new Playtests(playtests, this.onPlaytests);
    this.comparison = comparison ?? null;
    this.previewVersion = "current";
    this.requestBaseline = null;
    this.versions = versions?.slice(-12) ?? [];
    this.revision = Math.max(
      revision ?? this.versions.length,
      this.versions.length,
    );
    this.draft = { ...(draft ?? this.snapshot) };
    this.activeCart = null;
    this.testFrame = null;
    this.testStateSeq = 0;
    if (this.player) {
      if (this.hasGame)
        await this.player.loadCart(cartBytes(this.snapshot), {
          displayName: "my-game.p8",
        });
      else await this.player.pause();
    }
    this.changed();
  }
  /** Compile the draft, run one frame and commit it as a version on success. */
  commit(signal) {
    return this.execute("load_game", {}, signal);
  }
  /** Replay one tested route on the committed cart and record it (normal input). */
  async replayRoute(calls, signal) {
    await this.execute("reset_game", {}, signal);
    for (const call of calls) {
      const r = await this.execute("press_buttons", call, signal);
      if (r.isError) return r;
    }
  }
  execute(action, args, signal) {
    const job = this.queue.then(async () => {
      signal?.throwIfAborted();
      const abort = () => this.cancelTests();
      signal?.addEventListener("abort", abort, { once: true });
      const delivered = { cursor: this.logCursor, identity: this.logIdentity };
      try {
        const result = await this.perform(action, args, signal);
        signal?.throwIfAborted();
        return result;
      } catch (error) {
        this.logCursor = delivered.cursor;
        this.logIdentity = delivered.identity;
        throw error;
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
        "load_game",
        "reset_game",
        "press_buttons",
      ].includes(action)
    )
      throw new Error(`未知游戏工具：${action}`);
    if (action === "read_assets") {
      const { version = "draft", format = "data", ...query } = args;
      if (
        !["draft", "committed"].includes(version) ||
        !["data", "png", "both"].includes(format)
      )
        throw new Error(
          "read_assets requires version draft/committed and format data/png/both",
        );
      if (version === "committed" && !this.hasGame)
        throw new Error("No committed resource version exists");
      if (format !== "data" && !["sprite", "map"].includes(query.kind))
        throw new Error(
          "Resource PNG requires kind sprite or map with its slot/region arguments",
        );
      const assets =
        version === "draft" ? this.draft.assets : this.snapshot.assets;
      const data = readAssets(assets, query);
      const output =
        format === "png" ? [] : [{ type: "text", text: JSON.stringify(data) }];
      const preview =
        format === "data"
          ? null
          : assetPreview(decodeAssets(assets), query, data);
      output.push({
        type: "text",
        text: JSON.stringify({
          resourceView: {
            version,
            cartRevision: version === "committed" ? this.revision : null,
            ...(preview
              ? {
                  preview: {
                    ...preview.description,
                    width: preview.image.width,
                    height: preview.image.height,
                    imageScale: modelImageScale,
                  },
                }
              : {}),
          },
          cart: this.cartSummary(),
        }),
      });
      if (preview) output.push(this.image(modelImage(preview.image)));
      return { output };
    }
    if (action === "edit_assets") {
      const before = this.draft.assets;
      const assets = editAssets(before, args.edits);
      const changed = assets !== this.draft.assets;
      this.setWorking({ ...this.draft, assets });
      return {
        output: [
          {
            type: "text",
            text:
              JSON.stringify({
                changed,
                changes: assetChanges(
                  decodeAssets(before),
                  decodeAssets(assets),
                  args.edits,
                ),
                cart: this.cartSummary(),
              }) +
              "\n" +
              (changed
                ? "Resource draft updated. p8 check commits source and resources together."
                : "Resources unchanged."),
          },
        ],
      };
    }
    if (action !== "load_game" && !this.hasGame)
      throw new Error(
        "No game has been committed yet. Write main.lua and run p8 check first.",
      );
    const options = {
      ...observationOptions({}),
      includeBudget: action === "load_game",
      view: false,
    };
    const resolved =
      action === "press_buttons" ? this.playtests.resolve(args) : null;
    const purpose = action === "reset_game" ? resetPurpose(args) : "normal";
    await this.ensureWorker();
    await this.player.pause();
    let observation;
    let execution;
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
      this.playtests.stop();
      this.testStateSeq = 0;
      observation = await this.rpc("load", { cart: cartBytes(snapshot) });
      if (observation.state !== "faulted") {
        ({ observation, ...execution } = await this.rpc("advance", {
          frames: 1,
          buttons: 0,
        }));
      }
      this.testStateSeq = execution?.completedFrames ?? 0;
      this.frameStateSeq = this.testStateSeq;
      if (observation.state === "faulted") {
        const result = this.output(
          {
            ...observation,
            execution,
            audio: execution?.audio,
            cart: this.cartStatus("failed-draft"),
          },
          options,
        );
        if (this.hasGame)
          await this.rpc("load", { cart: cartBytes(this.snapshot) });
        else this.cancelTests();
        result.output[0].text +=
          "\nNot committed: source and resource drafts are retained. Fix the draft, then run p8 check again." +
          (this.hasGame
            ? " The test session still runs the last loaded version."
            : " No playable version exists yet.");
        return { ...result, isError: true };
      }
      signal?.throwIfAborted();
      if (sameSnapshot(snapshot, this.snapshot))
        note = `\nSource and resources are unchanged since the last load; no new version. ${coverageNote(revisionCoverage(this.playtests.runs, this.revision))}`;
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
        const amend =
          this.requestVersion != null &&
          this.requestVersion === this.revision &&
          this.versions.length > 0;
        if (amend) {
          // Same request: replace its version; routes on the replaced code no longer apply.
          this.versions[this.versions.length - 1] = snapshot;
          this.playtests.dropRevision(this.revision);
          this.previewVersion = "current";
          this.save();
          note = `\nCommitted as version ${this.revision}. It replaces this request's earlier version ${this.revision}; routes on that code were cleared. ${coverageNote(revisionCoverage(this.playtests.runs, this.revision))}`;
        } else {
          this.versions.push(snapshot);
          if (this.requestBaseline) {
            this.comparison = this.requestBaseline;
            this.onComparison?.(this.comparison);
            this.requestBaseline = null;
          }
          this.previewVersion = "current";
          this.versions = this.versions.slice(-12);
          this.revision++;
          if (this.requestVersion !== undefined)
            this.requestVersion = this.revision;
          this.save();
          // Earlier evidence belongs to the previous revision; say so where the
          // model commits, so final checks are rerun on the delivered version.
          const previous = revisionCoverage(
            this.playtests.runs,
            this.revision - 1,
          );
          note =
            `\nCommitted as version ${this.revision}. ${coverageNote(revisionCoverage(this.playtests.runs, this.revision))}` +
            (previous.normalRoutes
              ? ` Revision ${previous.revision} had ${previous.normalRoutes} normal-input route(s) (longest ${previous.longestNormalCalls} input calls); rerun the affected routes on this revision before reporting them as verified.`
              : "");
        }
      }
      const cartHash = await fingerprint(cartBytes(snapshot));
      signal?.throwIfAborted();
      this.playtests.start({
        revision: this.revision,
        cartHash,
        purpose,
        origin: "load",
        frame: observation.frame,
      });
    } else if (action === "press_buttons") {
      const initialStateSeq = this.testStateSeq ?? 0;
      const initialFrameStateSeq = this.frameStateSeq;
      const run = await runInputs(
        resolved.plan,
        (args) => this.rpc("advance", args),
        signal,
      );
      this.testStateSeq = initialStateSeq + run.execution.completedFrames;
      if (run.execution.completedFrames) this.frameStateSeq = this.testStateSeq;
      const playtest = await this.playtests.record(resolved, run);
      signal?.throwIfAborted();
      this.testFrames = run.captures.flatMap((c) =>
        c.observation.frame ? [c.observation.frame] : [],
      );
      this.testFrame = run.observation.frame;
      this.changed();
      const cart = this.cartStatus(
        run.execution.outcome === "session-replaced"
          ? "runtime-replaced"
          : "committed",
      );
      const output = run.captures.flatMap(
        (c, i) =>
          this.output(
            {
              ...c.observation,
              cart,
              checkpoint: c.checkpoint,
              stateSeq: initialStateSeq + c.checkpoint.afterFrames,
              frameStateSeq:
                c.checkpoint.afterFrames > 0
                  ? initialStateSeq + c.checkpoint.afterFrames
                  : initialFrameStateSeq,
              ...(i === 0
                ? { execution: run.execution, playtest, audio: run.audio }
                : {}),
            },
            { ...options, checkpointOnly: i > 0 },
          ).output,
      );
      return {
        output,
        isError: ["faulted", "interrupted", "session-replaced"].includes(
          run.execution.outcome,
        ),
      };
    } else if (action === "reset_game") {
      this.playtests.stop();
      this.testStateSeq = 0;
      await this.rpc("load", { cart: cartBytes(this.snapshot) });
      ({ observation, ...execution } = await this.rpc("advance", {
        frames: 1,
        buttons: 0,
      }));
      this.testStateSeq = execution.completedFrames;
      this.frameStateSeq = this.testStateSeq;
      if (observation.state !== "faulted") {
        const cartHash = await fingerprint(cartBytes(this.snapshot));
        signal?.throwIfAborted();
        this.playtests.start({
          revision: this.revision,
          cartHash,
          purpose,
          origin: "reset",
          frame: observation.frame,
        });
      }
    } else throw new Error(`Unknown test action: ${action}`);
    this.testFrame = observation.frame;
    this.testFrames = observation.frame ? [observation.frame] : [];
    this.changed();
    const result = this.output(
      {
        ...observation,
        ...(execution ? { execution, audio: execution.audio } : {}),
        cart: this.cartStatus("committed"),
        ...(this.playtests.active
          ? { playtest: this.playtests.summary() }
          : {}),
      },
      options,
    );
    if (note) result.output[0].text += note;
    return result;
  }
  output(observation, options = observationOptions()) {
    const { frame } = observation;
    const output = [
      {
        type: "text",
        text: observationText(
          {
            stateSeq: this.testStateSeq ?? 0,
            frameStateSeq: this.frameStateSeq,
            ...observation,
          },
          options,
        ),
      },
    ];
    if (frame && options.format !== "ascii") {
      const { width, height } = options.region;
      output.push(
        this.image(
          modelImage({ rgba: cropRgba(frame, options.region), width, height }),
        ),
      );
    }
    this.appendLogs(output, observation);
    appendAudio(output, observation.audio);
    return { output, isError: observation.state === "faulted" };
  }
  appendLogs(output, observation) {
    if (observation.logs) {
      const identity = `${observation.sessionId}:${observation.generation}`;
      const cursor = identity === this.logIdentity ? this.logCursor : 0;
      const snapshot = observation.logs;
      const first = snapshot.entries[0]?.sequence ?? snapshot.cursor + 1;
      const logs = {
        dropped: Math.max(0, first - cursor - 1),
        entries: snapshot.entries.filter((entry) => entry.sequence > cursor),
      };
      if (logs.entries.length || logs.dropped)
        output.push({ type: "text", text: JSON.stringify({ logs }) });
      // Advance only after all result encoding succeeded; observe never consumes VM logs.
      this.logIdentity = identity;
      this.logCursor = snapshot.cursor;
    }
  }
  image({ rgba, width, height }) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas
      .getContext("2d")
      .putImageData(new ImageData(rgba, width, height), 0, 0);
    return {
      type: "image",
      data: canvas.toDataURL("image/png").split(",")[1],
      mimeType: "image/png",
    };
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

// Audio calls are evidence of triggers and voice use, not of listening quality.
function appendAudio(output, audio) {
  if (!audio || (!audio.events?.length && !audio.dropped)) return;
  const events = audio.events.map(({ overMusic, ...event }) =>
    overMusic ? { ...event, overMusic: true } : event,
  );
  output.push({
    type: "text",
    text: JSON.stringify({
      audio: { events, ...(audio.dropped ? { dropped: audio.dropped } : {}) },
    }),
  });
}
