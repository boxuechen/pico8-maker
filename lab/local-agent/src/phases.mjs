// The workflow: plan → build → test → report. Each phase is a fresh conversation;
// state passes between phases as text (task, plan, numbered source, host report).
import { addUsage, emptyUsage, runLoop } from "./loop.mjs";
import { prompts, systemFor } from "./prompts.mjs";
import { soundAssets } from "./sounds.mjs";
import { Bench, check, done, editGame, list, numbered, play, writeGame } from "./tools.mjs";

export const defaults = {
  timeMs: 15 * 60 * 1000,
  toolCalls: 40,
  // Testing is mechanical play; long thinking there cost minutes per reply.
  thinking: { plan: "low", build: "low", test: "off" },
  turns: { build: 12, test: 16 },
  nudges: 2,
};

const user = (text) => ({ role: "user", content: text, timestamp: Date.now() });
const hostReport = (bench) => (bench.smoke ? bench.smoke.lines.map((l) => `- ${l}`).join("\n") : "- not loaded");
const context = (task, plan, bench) =>
  `REQUEST:\n${task.prompt}\n\nPLAN:\n${plan}\n\nCURRENT main.lua (line numbers are not part of the code):\n${numbered(bench.source)}\n\nHOST CHECK OF THE LOADED VERSION:\n${hostReport(bench)}`;

/**
 * @param {{id:string, kind:"create"|"repair", prompt:string, snapshot?:{source:string, assets:string}}} task
 * @param {{complete:Function, onEvent?:Function} & Partial<typeof defaults>} options
 */
export async function runTask(task, { complete, onEvent = () => {}, ...overrides }) {
  const cfg = { ...defaults, ...overrides, thinking: { ...defaults.thinking, ...overrides.thinking }, turns: { ...defaults.turns, ...overrides.turns } };
  const started = Date.now(),
    deadline = started + cfg.timeMs,
    budget = { toolCalls: cfg.toolCalls },
    usage = emptyUsage(),
    phases = [];
  const start =
    task.kind === "create"
      ? { source: prompts.template, assets: soundAssets() }
      : { source: task.snapshot.source, assets: task.snapshot.assets };
  const bench = new Bench(start);
  try {
    await bench.apply(start.source); // host load, not a model action
    const record = (name, r, extra = {}) => {
      for (const k of Object.keys(usage)) usage[k] += r.usage?.[k] ?? 0;
      phases.push({ name, status: r.status, toolCalls: r.toolCalls ?? 0, toolErrors: r.toolErrors ?? 0, usage: r.usage, error: r.error, ms: Date.now() - extra.t0, messages: r.messages, ...extra.data });
      onEvent({ kind: "phase", name, status: r.status });
    };

    // PLAN (new games): one text reply, no tools.
    let plan = `Apply the requested change to the existing game and keep everything else the same.`;
    if (task.kind === "create") {
      const t0 = Date.now();
      const messages = [user(`REQUEST:\n${task.prompt}`)];
      const r = await runLoop({ complete, system: systemFor.plan(), messages, tools: [], thinking: cfg.thinking.plan, maxTurns: 1, budget, deadline, onEvent, maxTokens: 4096 });
      plan = r.text?.trim() || plan;
      record("plan", r, { t0, data: { plan } });
      if (r.status !== "text") return finish("plan_" + r.status);
    }

    // BUILD: until the host accepts done (clean load + passing host check).
    const build = await phase("build", [writeGame(bench), editGame(bench),
      done(
        { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
        "Finish the build phase when the game implements the plan and the host check passes.",
        () =>
          bench.loaded !== bench.source ? "the latest source did not load; fix the reported problem."
          : !bench.smoke?.ok ? `the host check still reports problems:\n${hostReport(bench)}`
          : null,
      )]);
    if (build.status !== "done") return finish("build_" + build.status);

    // TEST: host-judged cases; done needs a passing normal-play case on the final version.
    // No free play here: 9B kept repeating play calls instead of writing cases.
    const test = await phase("test", [check(bench), editGame(bench),
      done(
        { type: "object", properties: { unverified: { type: "array", items: { type: "string" }, description: "Requested behaviour no passing case covers" } }, required: ["unverified"], additionalProperties: false },
        "Finish testing. The host reports the cases that passed; list requested behaviour you could not confirm.",
        () =>
          bench.loaded !== bench.source ? "the latest source did not load; fix it first."
          : bench.checks?.source !== bench.loaded ? "run check on the current version first (the code changed after the last check)."
          : !bench.checks.results.some((r) => r.pass && r.normal) ? "no case passed without setup; add at least one normal-play case that passes."
          : null,
      )]);
    const results = bench.checks?.source === bench.loaded ? bench.checks.results : [];
    return finish(test.status === "done" ? "done" : "test_" + test.status, {
      passed: results.filter((r) => r.pass).map((r) => ({ name: r.name, normal: r.normal, evidence: r.lines.join(" | ") })),
      failed: results.filter((r) => !r.pass).map((r) => ({ name: r.name, evidence: r.lines.join(" | ") })),
      unverified: list(test.done?.unverified) ?? [],
    });

    async function phase(name, tools) {
      const t0 = Date.now();
      // The test phase verifies; it must not re-implement a change that is done.
      const handoff = name === "test" ? `\n\nBUILD RESULT: ${build.done?.summary ?? "built"}. The code is believed to be complete. Verify it with check; edit only if a case shows a real bug.` : "";
      const messages = [user(`${context(task, plan, bench)}${handoff}\n\nStart the ${name.toUpperCase()} phase.`)];
      let r,
        nudges = cfg.nudges,
        turnsLeft = cfg.turns[name];
      const total = emptyUsage();
      let calls = 0,
        errors = 0;
      for (;;) {
        r = await runLoop({ complete, system: systemFor[name](), messages, tools, thinking: cfg.thinking[name], maxTurns: turnsLeft, budget, deadline, onEvent });
        for (const k of Object.keys(total)) total[k] += r.usage[k];
        calls += r.toolCalls;
        errors += r.toolErrors;
        turnsLeft -= r.usage.requests;
        if (r.status !== "text" || nudges-- <= 0 || turnsLeft <= 0) break;
        messages.push(user("Continue with the tools. Call done when the phase is complete."));
      }
      r = { ...r, usage: total, toolCalls: calls, toolErrors: errors };
      record(name, r, { t0, data: name === "test" ? { verification: r.done } : { summary: r.done?.summary } });
      return r;
    }

    function finish(status, verification) {
      return {
        status,
        source: bench.loaded ?? bench.source,
        draft: bench.source,
        assets: bench.assets,
        plan,
        verification: verification ?? null,
        reply: report(plan, verification, status),
        phases,
        usage,
        toolCalls: phases.reduce((n, p) => n + p.toolCalls, 0),
        toolErrors: phases.reduce((n, p) => n + p.toolErrors, 0),
        elapsedMs: Date.now() - started,
      };
    }
  } finally {
    await bench.dispose();
  }
}

// The four-part delivery, written by the host from the plan and test results.
function report(plan, verification, status) {
  const line = (label) => plan.split("\n").find((l) => l.toUpperCase().startsWith(label))?.slice(label.length + 1).trim();
  const verified = verification?.passed?.map((v) => `- ${v.name}${v.normal ? "" : " (with setup)"}: ${v.evidence}`) ?? [];
  const unverified = [
    ...(verification?.failed ?? []).map((f) => `- FAILED ${f.name}: ${f.evidence}`),
    ...(verification?.unverified ?? []).map((u) => `- ${u}`),
    "- Sound and feel were not listened to or judged by a person.",
  ];
  return [
    `Game: ${line("TITLE") ?? "see plan"}${status === "done" ? "" : ` (stopped: ${status})`}`,
    `Controls: ${line("CONTROLS") ?? "see plan"}`,
    `Verified:\n${verified.join("\n") || "- nothing"}`,
    `Not verified:\n${unverified.join("\n")}`,
  ].join("\n\n");
}
