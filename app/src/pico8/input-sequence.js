import { capabilities } from "./capabilities.js";

const maxFrames = capabilities.maxInputFrames;
const stepProperties = {
  frames: { type: "integer", minimum: 1, maximum: maxFrames },
  buttons: { type: "integer", minimum: 0, maximum: 63 },
  tap: {
    type: "boolean",
    description:
      "Release for one frame before and after this held input. Both release frames count toward the total.",
  },
  capture: {
    type: "boolean",
    description:
      "Capture at this step's end, after any tap release. Avoids calculating a cumulative offset.",
  },
};
export const inputSchema = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      minItems: 1,
      maxItems: capabilities.maxInputSteps,
      description: `1–${capabilities.maxInputSteps} ordered inputs, at most ${maxFrames} frames including tap releases. No implicit release unless tap is true.`,
      items: {
        type: "object",
        properties: stepProperties,
        required: ["frames", "buttons"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

// Validate the entire request before any input, player pause or Worker creation.
export function inputPlan(args) {
  const invalid = (message) => new Error(`${message}. No input was executed.`);
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => key !== "steps")
  ) throw invalid("press_buttons accepts only steps");
  const steps = args.steps;
  if (
    !Array.isArray(steps) ||
    !steps.length ||
    steps.length > capabilities.maxInputSteps
  )
    throw invalid(
      `steps must contain 1–${capabilities.maxInputSteps} entries${Array.isArray(steps) ? `; received ${steps.length}` : ""}. Split longer routes across calls`,
    );
  let total = 0;
  const expanded = [],
    stepCaptures = [];
  for (const [index, step] of steps.entries()) {
    const field = `steps[${index}]`;
    if (
      !step ||
      typeof step !== "object" ||
      Array.isArray(step) ||
      Object.keys(step).some(
        (k) => !["frames", "buttons", "tap", "capture"].includes(k),
      ) ||
      !Number.isInteger(step.frames) ||
      step.frames < 1 ||
      step.frames > maxFrames
    )
      throw invalid(`${field}.frames must be an integer 1–${maxFrames}`);
    if (
      !Number.isInteger(step.buttons) ||
      step.buttons < 0 ||
      step.buttons > 63
    )
      throw invalid(`${field}.buttons must be an integer 0–63`);
    for (const key of ["tap", "capture"])
      if (step[key] !== undefined && typeof step[key] !== "boolean")
        throw invalid(`${field}.${key} must be boolean`);
    if (step.tap && step.buttons === 0)
      throw invalid(`${field}.tap needs a nonzero button mask`);
    if (step.tap) expanded.push({ frames: 1, buttons: 0 });
    expanded.push({ frames: step.frames, buttons: step.buttons });
    if (step.tap) expanded.push({ frames: 1, buttons: 0 });
    total += step.frames + (step.tap ? 2 : 0);
    if (step.capture) stepCaptures.push(total);
  }
  if (total > maxFrames)
    throw invalid(
      `Total frames must be 1–${maxFrames}; received ${total}. Split this route across calls`,
    );
  const captures = [...new Set([...stepCaptures, total])].sort((a, b) => a - b);
  if (captures.length > capabilities.maxInputCaptures)
    throw invalid(
      `At most ${capabilities.maxInputCaptures} distinct captures including the final frame`,
    );
  return {
    steps: expanded,
    total,
    captures,
  };
}

// Capture only requested checkpoints. Splitting a held input does not insert a
// release frame. Stop on every non-completed outcome, including guest stop().
export async function runInputs(plan, advance, signal) {
  const execution = {
    requestedFrames: plan.total,
    completedFrames: 0,
    outcome: "completed",
    steps: [],
  };
  const captures = [];
  const audio = { events: [], dropped: 0 };
  let observation;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const progress = {
      step: i + 1,
      buttons: step.buttons,
      requestedFrames: step.frames,
      completedFrames: 0,
      outcome: "completed",
    };
    execution.steps.push(progress);
    while (progress.completedFrames < step.frames) {
      signal?.throwIfAborted();
      const next =
        plan.captures.find((n) => n > execution.completedFrames) ?? plan.total;
      const frames = Math.min(
        step.frames - progress.completedFrames,
        next - execution.completedFrames,
      );
      const result = await advance({ frames, buttons: step.buttons });
      signal?.throwIfAborted();
      if (
        !Number.isInteger(result.completedFrames) ||
        result.completedFrames < 0 ||
        result.completedFrames > frames ||
        ![
          "completed",
          "stopped",
          "faulted",
          "session-replaced",
          "interrupted",
        ].includes(result.outcome) ||
        (result.outcome === "completed" && result.completedFrames !== frames)
      )
        throw new Error("Runtime returned invalid input progress");
      observation = result.observation;
      mergeAudio(audio, result.audio);
      progress.completedFrames += result.completedFrames;
      execution.completedFrames += result.completedFrames;
      execution.outcome = progress.outcome = result.outcome;
      if (
        plan.captures.includes(execution.completedFrames) ||
        result.outcome !== "completed"
      )
        captures.push({
          observation,
          checkpoint: { step: i + 1, afterFrames: execution.completedFrames },
        });
      if (result.outcome !== "completed")
        return { execution, captures, observation, audio };
    }
  }
  return { execution, captures, observation, audio };
}

// Guest sfx()/music() starts across every advance of one call, bounded as one list.
export const maxAudioEvents = 32;
export function mergeAudio(into, audio) {
  if (!audio) return into;
  into.dropped += audio.dropped ?? 0;
  for (const event of audio.events ?? [])
    if (into.events.length < maxAudioEvents) into.events.push(event);
    else into.dropped++;
  return into;
}
