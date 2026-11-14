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
        r.schemaVersion !== 3 ||
        !/^r[1-9]\d{0,8}$/.test(r.id) ||
        ids.has(r.id) ||
        !Number.isInteger(r.revision) ||
        r.revision < 1 ||
        !/^[a-f0-9]{64}$/.test(r.cartHash) ||
        !purposes.includes(r.purpose) ||
        !["load", "reset"].includes(r.origin) ||
        !Array.isArray(r.calls) ||
        r.calls.length > maxCalls ||
        !Array.isArray(r.debugEvents) ||
        r.debugEvents.length > 32 ||
        (r.debugEvents.length > 0 && r.purpose !== "debug")
      )
        return [];
      const debugEvents = r.debugEvents.map((e) => {
        if (
          !e ||
          typeof e.code !== "string" ||
          e.code.length > 4096 ||
          !Number.isInteger(e.stateSeq) ||
          e.stateSeq < 1 ||
          !["pending", "completed", "failed", "unknown"].includes(e.status) ||
          (e.executed !== undefined && typeof e.executed !== "boolean") ||
          (e.reason !== undefined &&
            (typeof e.reason !== "string" || e.reason.length > 256)) ||
          (e.afterCalls !== undefined &&
            (!Number.isInteger(e.afterCalls) || e.afterCalls < 0)) ||
          (e.routePurpose !== undefined && !purposes.includes(e.routePurpose))
        )
          throw new Error("Invalid debug event");
        return {
          code: e.code,
          stateSeq: e.stateSeq,
          status: e.status,
          ...(e.executed === undefined ? {} : { executed: e.executed }),
          ...(e.reason === undefined ? {} : { reason: e.reason }),
          ...(e.afterCalls === undefined ? {} : { afterCalls: e.afterCalls }),
          ...(e.routePurpose === undefined
            ? {}
            : { routePurpose: e.routePurpose }),
        };
      });
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
          schemaVersion: 3,
          id: r.id,
          revision: r.revision,
          cartHash: r.cartHash,
          purpose: r.purpose,
          origin: r.origin,
          startFrame: Number.isInteger(r.startFrame) ? r.startFrame : null,
          truncated: r.truncated === true,
          calls,
          debugEvents,
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
      schemaVersion: 3,
      id,
      revision,
      cartHash,
      purpose,
      origin,
      startFrame: frame?.frameId ?? null,
      truncated: false,
      calls: [],
      debugEvents: [],
    };
    this.runs = [...this.runs.slice(-(maxRuns - 1)), this.active];
    this.save();
  }
  /** Forget every route on a revision whose cart was replaced in place. */
  dropRevision(revision) {
    if (this.active?.revision === revision) this.active = null;
    this.runs = this.runs.filter((r) => r.revision !== revision);
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
  beginDebug(code, stateSeq) {
    if (!this.active)
      throw new Error("Reset to start a recorded test before debug execution");
    // Input calls before the first debug event still ran from a normal start.
    const event = {
      code,
      stateSeq,
      status: "pending",
      afterCalls: this.active.calls.length,
      routePurpose: this.active.purpose,
    };
    this.active.purpose = "debug";
    if (this.active.debugEvents.length < 32)
      this.active.debugEvents.push(event);
    else this.active.truncated = true;
    this.save(); // Before dispatch: runtime errors, STOP and timeouts cannot undo this label.
    return event;
  }
  // A chunk rejected by the compiler never ran, so it cannot alter state.
  // Restore the route's previous label; any later uncertainty keeps debug.
  discardUnexecutedDebug(event, previousPurpose) {
    if (!this.active) return;
    const index = this.active.debugEvents.indexOf(event);
    if (index >= 0) this.active.debugEvents.splice(index, 1);
    if (!this.active.debugEvents.length && !this.active.truncated)
      this.active.purpose = previousPurpose;
    this.save();
  }
  finishDebug(event, status, executed, reason) {
    event.status = status;
    if (executed !== undefined) event.executed = executed;
    if (typeof reason === "string") event.reason = reason.slice(0, 256);
    this.save();
  }
  file(path) {
    if (path === "/cart/playtests.json")
      return JSON.stringify(
        {
          note: "Recorded execution, not gameplay verdicts. PNGs remain in the transcript. Reuse recorded steps as ordinary input on the current cart.",
          active: this.active?.id ?? null,
          runs: this.runs.map(({ calls, debugEvents, ...r }) => ({
            ...r,
            calls: calls.length,
            debugEvents: debugEvents.length,
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

// Host-side facts about recorded routes for one committed revision. Normal
// input counts from a normal load/reset until the first debug event, so a
// normal win followed by injected edge cases keeps its normal prefix.
// These are coverage facts, not gameplay verdicts.
export function normalCalls(run) {
  const first = run.debugEvents[0];
  if (!first) return run.purpose === "normal" ? run.calls : [];
  if (first.routePurpose !== "normal" || first.afterCalls === undefined)
    return [];
  return run.calls.slice(0, first.afterCalls);
}
export function revisionCoverage(runs, revision) {
  const mine = (runs ?? []).filter((r) => r.revision === revision);
  const played = (calls) => calls.some((c) => c.completedFrames > 0);
  const normal = mine.map(normalCalls).filter(played);
  return {
    revision,
    normalRoutes: normal.length,
    longestNormalCalls: Math.max(0, ...normal.map((calls) => calls.length)),
    debugRoutes: mine.filter(
      (r) =>
        r.purpose === "debug" && played(r.calls.slice(normalCalls(r).length)),
    ).length,
  };
}
export function coverageNote({ revision, normalRoutes, longestNormalCalls }) {
  return normalRoutes
    ? `Revision ${revision}: ${normalRoutes} normal-input route(s) recorded, longest ${longestNormalCalls} input call(s).`
    : `Revision ${revision}: no normal-input route recorded yet.`;
}
