import { inputPlan } from "./input-sequence.js";

const maxRuns = 12,
  maxCalls = 128;
const purposes = ["unspecified", "normal", "debug"];
const clone = (value) => JSON.parse(JSON.stringify(value));
export async function fingerprint(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function resetPurpose(args = {}) {
  if (
    !args ||
    Array.isArray(args) ||
    typeof args !== "object" ||
    Object.keys(args).some((k) => k !== "purpose") ||
    (args.purpose !== undefined && !purposes.includes(args.purpose))
  )
    throw new Error(
      "reset_game accepts purpose normal/debug/unspecified. No reset was executed.",
    );
  return args.purpose ?? "unspecified";
}

// Persist only bounded input records and frame identities. PNG evidence already
// lives in the transcript. A declared purpose never constitutes a gameplay pass.
export function normalizePlaytests(data) {
  if (!Array.isArray(data)) return [];
  const ids = new Set();
  return data.slice(-maxRuns).flatMap((r) => {
    try {
      if (
        !r ||
        !/^r[1-9]\d{0,8}$/.test(r.id) ||
        ids.has(r.id) ||
        !Number.isInteger(r.revision) ||
        r.revision < 1 ||
        !/^[a-f0-9]{64}$/.test(r.cartHash) ||
        !purposes.includes(r.purpose) ||
        !["load", "reset"].includes(r.origin) ||
        !Array.isArray(r.calls) ||
        r.calls.length > maxCalls
      )
        return [];
      const calls = r.calls.map((c) => {
        inputPlan(c.input);
        if (
          !Number.isInteger(c.completedFrames) ||
          c.completedFrames < 0 ||
          ![
            "completed",
            "stopped",
            "faulted",
            "interrupted",
            "session-replaced",
          ].includes(c.outcome) ||
          !Array.isArray(c.frames) ||
          c.frames.length > 8 ||
          c.frames.some(
            (f) =>
              !Number.isInteger(f.frameId) ||
              !Number.isInteger(f.afterFrames) ||
              !/^[a-f0-9]{64}$/.test(f.hash),
          )
        )
          throw new Error("Invalid recording");
        return {
          input: clone(c.input),
          completedFrames: c.completedFrames,
          outcome: c.outcome,
          frames: c.frames.map((f) => ({
            frameId: f.frameId,
            afterFrames: f.afterFrames,
            hash: f.hash,
          })),
        };
      });
      ids.add(r.id);
      return [
        {
          id: r.id,
          revision: r.revision,
          cartHash: r.cartHash,
          purpose: r.purpose,
          origin: r.origin,
          startFrame: Number.isInteger(r.startFrame) ? r.startFrame : null,
          truncated: r.truncated === true,
          calls,
        },
      ];
    } catch {
      return [];
    }
  });
}

export class Playtests {
  constructor(saved, onChange = () => {}) {
    this.runs = normalizePlaytests(saved);
    this.onChange = onChange;
    this.active = null;
    this.replaying = null;
  }
  save() {
    this.onChange(clone(this.runs));
  }
  stop() {
    this.active = null;
    this.replaying = null;
  }
  start({ revision, cartHash, purpose, origin, frame }) {
    const id = `r${Math.max(0, ...this.runs.map((r) => Number(r.id.slice(1)))) + 1}`;
    this.active = {
      id,
      revision,
      cartHash,
      purpose,
      origin,
      startFrame: frame?.frameId ?? null,
      truncated: false,
      calls: [],
    };
    this.runs = [...this.runs.slice(-(maxRuns - 1)), this.active];
    this.replaying = null;
    this.save();
  }
  summary() {
    return this.active
      ? {
          run: this.active.id,
          purpose: this.active.purpose,
          calls: this.active.calls.length,
          ...(this.active.truncated ? { truncated: true } : {}),
        }
      : null;
  }
  file(path) {
    if (path === "/cart/playtests.json")
      return JSON.stringify(
        {
          note: "Recorded execution, not gameplay verdicts. Purpose is author-declared. PNGs remain in the transcript; reset may retain cartdata. Replay each call and inspect its frame on the current cart.",
          active: this.active?.id ?? null,
          runs: this.runs.map(({ calls, ...r }) => ({
            ...r,
            calls: calls.length,
            path: `/cart/playtests/${r.id}.json`,
          })),
        },
        null,
        2,
      );
    const r = this.runs.find((r) => path === `/cart/playtests/${r.id}.json`);
    return r ? JSON.stringify(r, null, 2) : undefined;
  }
  paths() {
    return [
      "/cart/playtests.json",
      ...this.runs.map((r) => `/cart/playtests/${r.id}.json`),
    ];
  }
  resolve(args) {
    if (!args || !Object.hasOwn(args, "replay"))
      return { plan: inputPlan(args), input: clone(args) };
    const ref = args.replay;
    if (
      Object.keys(args).length !== 1 ||
      !ref ||
      Array.isArray(ref) ||
      typeof ref !== "object" ||
      Object.keys(ref).some((k) => !["run", "call"].includes(k)) ||
      typeof ref.run !== "string" ||
      !Number.isInteger(ref.call) ||
      ref.call < 0
    )
      throw new Error(
        "Use replay:{run,call} alone, with a zero-based call. No input was executed.",
      );
    const source = this.runs.find((r) => r.id === ref.run),
      call = source?.calls[ref.call];
    if (!call || call.outcome !== "completed")
      throw new Error(
        "No completed recorded call at that location. No input was executed.",
      );
    const first =
      ref.call === 0 &&
      this.active?.calls.length === 0 &&
      this.active.origin === "reset";
    const next =
      this.replaying?.run === ref.run && this.replaying.next === ref.call;
    if (!this.active || this.active.id === ref.run || (!first && !next))
      throw new Error(
        "Use reset_game, then replay calls in order from 0; ordinary input breaks the replay chain. No input was executed.",
      );
    return {
      plan: inputPlan(call.input),
      input: clone(call.input),
      replay: { ...ref },
      sameCart: source.cartHash === this.active.cartHash,
      expectedHash: call.frames.at(-1)?.hash,
    };
  }
  async record(resolved, run) {
    const active = this.active;
    if (!active)
      return {
        recording: "unavailable; reset_game to record from a known start",
      };
    const frames = await Promise.all(
      run.captures
        .filter((c) => c.observation.frame)
        .map(async (c) => ({
          afterFrames: c.checkpoint.afterFrames,
          frameId: c.observation.frame.frameId,
          hash: await fingerprint(c.observation.frame.rgba),
        })),
    );
    if (this.active !== active) return { recording: "interrupted" };
    if (active.calls.length < maxCalls)
      active.calls.push({
        input: resolved.input,
        completedFrames: run.execution.completedFrames,
        outcome: run.execution.outcome,
        frames,
      });
    else active.truncated = true;
    this.replaying =
      resolved.replay && run.execution.outcome === "completed"
        ? { run: resolved.replay.run, next: resolved.replay.call + 1 }
        : null;
    this.save();
    return {
      ...this.summary(),
      ...(resolved.replay
        ? {
            replay: resolved.replay,
            sameCart: resolved.sameCart,
            matchesRecordedFrame: frames.at(-1)?.hash === resolved.expectedHash,
          }
        : {}),
    };
  }
}
