import { inputPlan } from "./input-sequence.js";

const maxRuns = 12,
  maxCalls = 128;
const purposes = ["normal", "debug"];
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
      "reset_game accepts purpose normal/debug. No reset was executed.",
    );
  return args.purpose ?? "normal";
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
        r.schemaVersion !== 2 ||
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
          schemaVersion: 2,
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
  }
  save() {
    this.onChange(clone(this.runs));
  }
  stop() {
    this.active = null;
  }
  start({ revision, cartHash, purpose, origin, frame }) {
    const id = `r${Math.max(0, ...this.runs.map((r) => Number(r.id.slice(1)))) + 1}`;
    this.active = {
      schemaVersion: 2,
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
          note: "Recorded execution, not gameplay verdicts. PNGs remain in the transcript. Reuse recorded steps as ordinary input on the current cart.",
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
    return { plan: inputPlan(args), input: clone(args) };
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
    this.save();
    return this.summary();
  }
}
