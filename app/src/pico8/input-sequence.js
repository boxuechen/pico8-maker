import { capabilities } from "./capabilities.js";

const maxFrames = capabilities.maxInputFrames;
const stepProperties = {
  frames: { type: "integer", minimum: 1, maximum: maxFrames },
  buttons: { type: "integer", minimum: 0, maximum: 63 },
};
export const inputSchema = {
  type: "object",
  properties: {
    ...stepProperties,
    steps: {
      type: "array",
      minItems: 1,
      maxItems: capabilities.maxInputSteps,
      description: `Ordered held-button steps, at most ${maxFrames} frames in total. Use instead of top-level frames/buttons. No implicit release between steps.`,
      items: {
        type: "object",
        properties: stepProperties,
        required: ["frames", "buttons"],
        additionalProperties: false,
      },
    },
    captureFrames: {
      type: "array",
      maxItems: capabilities.maxInputCaptures - 1,
      items: { type: "integer", minimum: 1, maximum: maxFrames },
      description:
        "Optional strictly increasing frame offsets from this call's start, within its total frames. Final frame is always included. Omit or use [] for only the final frame; request intermediate frames to verify transitions or separate outcomes.",
    },
  },
  additionalProperties: false,
  oneOf: [
    { required: ["frames", "buttons"], not: { required: ["steps"] } },
    {
      required: ["steps"],
      not: { anyOf: [{ required: ["frames"] }, { required: ["buttons"] }] },
    },
  ],
};

// Validate the entire request before any input, player pause or Worker creation.
export function inputPlan(args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some(
      (k) => !["frames", "buttons", "steps", "captureFrames"].includes(k),
    )
  )
    throw new Error(
      "press_buttons accepts frames/buttons or steps, plus captureFrames",
    );
  if (
    args.steps !== undefined &&
    (args.frames !== undefined || args.buttons !== undefined)
  )
    throw new Error("Use steps or frames/buttons, not both");
  const steps = args.steps ?? [{ frames: args.frames, buttons: args.buttons }];
  if (
    !Array.isArray(steps) ||
    !steps.length ||
    steps.length > capabilities.maxInputSteps
  )
    throw new Error(
      `steps must contain 1–${capabilities.maxInputSteps} entries`,
    );
  let total = 0;
  for (const step of steps) {
    if (
      !step ||
      typeof step !== "object" ||
      Object.keys(step).some((k) => !["frames", "buttons"].includes(k)) ||
      !Number.isInteger(step.frames) ||
      step.frames < 1 ||
      step.frames > maxFrames
    )
      throw new Error(`frames must be an integer 1–${maxFrames}`);
    if (
      !Number.isInteger(step.buttons) ||
      step.buttons < 0 ||
      step.buttons > 63
    )
      throw new Error("buttons must be an integer 0–63");
    total += step.frames;
  }
  if (total > maxFrames) throw new Error(`Total frames must be 1–${maxFrames}`);
  const requested = args.captureFrames;
  if (
    requested !== undefined &&
    (!Array.isArray(requested) ||
      requested.length >= capabilities.maxInputCaptures ||
      requested.some(
        (n, i) =>
          !Number.isInteger(n) ||
          n < 1 ||
          n > total ||
          (i && n <= requested[i - 1]),
      ))
  )
    throw new Error(
      `captureFrames must contain at most ${capabilities.maxInputCaptures - 1} increasing offsets within the requested frames`,
    );
  return {
    steps: steps.map((s) => ({ ...s })),
    total,
    captures: [...new Set([...(requested ?? []), total])],
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
        return { execution, captures, observation };
    }
  }
  return { execution, captures, observation };
}
