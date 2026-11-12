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
    !Object.keys(fullScreen).every((key) => Number.isInteger(region[key])) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width < 1 ||
    region.height < 1 ||
    region.x + region.width > 128 ||
    region.y + region.height > 128
  )
    throw new Error(
      "region must contain integer x, y, width, height within the 128x128 screen",
    );
  return { format, region: { ...region } };
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
  const { frame, ...meta } = observation;
  // Large guest diagnostics must never consume the pixel grid's output budget.
  if (
    new TextEncoder().encode(JSON.stringify(meta.diagnostics ?? [])).length >
    4096
  ) {
    meta.diagnostics = [
      {
        message: String(
          meta.diagnostics?.[0]?.message ?? "Runtime diagnostics",
        ).slice(0, 512),
      },
    ];
    meta.diagnosticsTruncated = true;
  }
  const header = JSON.stringify({
    ...meta,
    format: options.format,
    region: options.region,
    frame: frame
      ? {
          frameId: frame.frameId,
          targetFps: frame.targetFps,
          width: frame.width,
          height: frame.height,
        }
      : null,
  });
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
