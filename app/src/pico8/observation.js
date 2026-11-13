import palette from "../generated/pico8-palette.js";
import { capabilities } from "./capabilities.js";

export const observationEncoding = "pico8-slots-v1";
const colors = new Map(palette.map((color) => [color.displayCode, color]));
const fullScreen = Object.freeze({ x: 0, y: 0, width: 128, height: 128 });

// Validate before starting a Worker or pausing the live player.
export function observationOptions(args = {}) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !["format", "region"].includes(key))
  )
    throw new Error("observe_game accepts only format and region");
  const format = args.format === undefined ? "png" : args.format;
  if (!capabilities.observationFormats.includes(format))
    throw new Error("format must be png, ascii or both");
  const region = args.region === undefined ? fullScreen : args.region;
  if (
    !region ||
    typeof region !== "object" ||
    Array.isArray(region) ||
    Object.keys(region).some((key) => !Object.hasOwn(fullScreen, key)) ||
    !Object.keys(fullScreen).every((key) =>
      Number.isSafeInteger(region[key]),
    ) ||
    region.width < 1 ||
    region.height < 1
  )
    throw new Error(
      "region requires safe integer x/y and positive integer width/height",
    );
  const x = Math.max(0, region.x),
    y = Math.max(0, region.y);
  const right = Math.min(128, region.x + region.width);
  const bottom = Math.min(128, region.y + region.height);
  if (right <= x || bottom <= y)
    throw new Error("region does not intersect the 128x128 screen");
  return { format, region: { x, y, width: right - x, height: bottom - y } };
}

export function encodeAscii(frame, region) {
  if (
    frame.width !== 128 ||
    frame.height !== 128 ||
    frame.packedScreen?.length !== 8192 ||
    frame.displayPalette?.length !== 16
  )
    throw new Error(
      "ASCII observation requires a complete indexed 128x128 frame",
    );
  const legend = Array.from(frame.displayPalette, (rawCode, slot) => {
    // Match the player's display decoder; upper flag bits are not color IDs.
    const displayCode = (rawCode & 0x80) | (rawCode & 0x0f);
    const color = colors.get(displayCode);
    if (!color) throw new Error(`Unknown display color ${displayCode}`);
    return `${slot.toString(16)} = ${color.name} (${color.rgb}), display code ${displayCode}`;
  });
  const rows = [];
  for (let y = region.y; y < region.y + region.height; y++) {
    let row = "";
    for (let x = region.x; x < region.x + region.width; x++) {
      const packed = frame.packedScreen[y * 64 + (x >> 1)];
      row += (x & 1 ? packed >>> 4 : packed & 15).toString(16);
    }
    rows.push(row);
  }
  return [
    `encoding: ${observationEncoding}`,
    "screen: 128x128",
    `region: x=${region.x} y=${region.y} width=${region.width} height=${region.height}`,
    "coordinates: top-left origin; x right; y down; 1 character = 1 pixel",
    "characters: screen slots 0-f after draw remapping, before display remapping; not object labels",
    "palette: actual display colors for this frame (slot 0 is a visible color, not an empty pixel)",
    ...legend,
    "pixels:",
    ...rows,
    "end pixels",
  ].join("\n");
}

export function cropRgba(frame, region) {
  if (
    frame.width !== 128 ||
    frame.height !== 128 ||
    frame.rgba?.length !== 65536
  )
    throw new Error("PNG observation requires a complete RGBA 128x128 frame");
  const pixels = new Uint8ClampedArray(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) {
    const start = ((region.y + y) * 128 + region.x) * 4;
    pixels.set(
      frame.rgba.subarray(start, start + region.width * 4),
      y * region.width * 4,
    );
  }
  return pixels;
}

export function observationText(observation, options) {
  const { frame, cart, playtest, execution } = observation;
  // An allowlist keeps internal runtime protocol fields out of model context.
  const meta = {
    ...(options.checkpointOnly
      ? {}
      : {
          committedRevision: cart?.committedRevision ?? null,
          draftDirty: cart?.draftDirty ?? false,
          run: playtest?.run ?? null,
          purpose: playtest?.purpose ?? null,
          ...(playtest?.recording ? { recording: playtest.recording } : {}),
          ...(playtest?.truncated ? { recordingTruncated: true } : {}),
          ...(cart?.observed?.kind && cart.observed.kind !== "committed"
            ? { observedKind: cart.observed.kind }
            : {}),
          // Full-screen PNG is the default for load/reset/input; only an
          // explicit observation reports its format and actual clipped region.
          ...(options.view
            ? { format: options.format, region: options.region }
            : {}),
          ...(frame && options.format !== "ascii"
            ? { imageScale: modelImageScale }
            : {}),
        }),
    state: observation.state,
    frameId: frame?.frameId ?? null,
    // Internal sequences stay host-side; the model only needs to know when
    // the latest image predates a debug write.
    ...(observation.frameStateSeq !== undefined &&
    observation.frameStateSeq !== observation.stateSeq
      ? { staleFrame: true }
      : {}),
    ...(frame?.slowFrame
      ? { slowFrame: true, cpuInstructions: frame.cpuInstructions }
      : {}),
    ...(observation.checkpoint ? { checkpoint: observation.checkpoint } : {}),
    ...(execution
      ? {
          execution: {
            requestedFrames: execution.requestedFrames,
            completedFrames: execution.completedFrames,
            outcome: execution.outcome,
            ...(execution.outcome !== "completed" && execution.steps
              ? { steps: execution.steps }
              : {}),
          },
        }
      : {}),
    ...(options.includeBudget
      ? { draftSourceBudget: cart?.draftSourceBudget }
      : {}),
  };
  if (observation.diagnostics?.length) {
    meta.diagnostics = observation.diagnostics;
    // Bound guest output independently of the complete ASCII grid.
    if (
      new TextEncoder().encode(JSON.stringify(meta.diagnostics)).length > 4096
    ) {
      meta.diagnostics = [
        {
          message: String(
            meta.diagnostics[0]?.message ?? "Runtime diagnostics",
          ).slice(0, 512),
        },
      ];
      meta.diagnosticsTruncated = true;
    }
  }
  const header = JSON.stringify(meta);
  const text = !frame
    ? `${header}\nNo completed test frame is available. Use reset_game or press_buttons to establish a frame; observe_game does not advance time.`
    : options.format === "png"
      ? header
      : `${header}\n${encodeAscii(frame, options.region)}`;
  if (
    new TextEncoder().encode(text).length > capabilities.observationMaxBytes ||
    text.split("\n").length > capabilities.observationMaxLines
  )
    throw new Error(
      "Observation exceeds its text budget; no partial pixel grid was returned",
    );
  return text;
}

// Applied before the PNG encoder, shared by production and headless test encoders.
// Frames, ASCII, labels and UI previews keep their original pixels.
// Model PNGs are enlarged; coordinates, crops and ASCII stay native 128x128.
export const modelImageScale = 4;
export function modelImage({ rgba, width, height }) {
  const scale = modelImageScale;
  const pixels = new Uint8ClampedArray(width * height * scale * scale * 4);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const source =
        (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      pixels.set(
        rgba.subarray(source, source + 4),
        (y * width * scale + x) * 4,
      );
    }
  }
  return { rgba: pixels, width: width * scale, height: height * scale };
}

// Compact runtime inspection values for the model without losing information:
// a complete 1..n sequence becomes an array and a complete string-keyed table
// becomes an object (unless a key named "type" could be mistaken for a tag).
// Sparse, mixed or truncated tables keep the runtime's {type:"table",entries}.
export function compactInspected(value) {
  if (!value || typeof value !== "object" || value.type !== "table")
    return value;
  const entries = value.entries.map(({ key, value: v }) => ({
    key,
    value: compactInspected(v),
  }));
  if (!value.truncated) {
    if (entries.every(({ key }, i) => key === i + 1))
      return entries.map((e) => e.value);
    if (entries.every(({ key }) => typeof key === "string" && key !== "type"))
      return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  }
  return {
    type: "table",
    entries,
    ...(value.truncated ? { truncated: value.truncated } : {}),
  };
}
export function modelInspection(inspection) {
  return { ...inspection, values: inspection.values.map(compactInspected) };
}
