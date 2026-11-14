// A fixed sound bank preloaded into every cart, so a game gets sound effects by
// calling sfx(n) without authoring audio data. Documented in prompts/api.md.
import { assetSummary, editAssets, emptySnapshot } from "../assets.js";

const note = (pitch, waveform, volume = 5, effect = 0) => ({ pitch, waveform, volume, effect });
const seq = (pitches, waveform, volume, effect) => pitches.map((p) => note(p, waveform, volume, effect));
export const SOUNDS = [
  { id: 0, name: "pickup", speed: 6, notes: seq([36, 40, 43, 48], 3, 5) },
  { id: 1, name: "shoot", speed: 3, notes: seq([45, 38, 32], 6, 4) },
  { id: 2, name: "hit", speed: 5, notes: seq([30, 26, 22, 18], 2, 6, 0) },
  { id: 3, name: "win", speed: 10, notes: seq([36, 40, 43, 48, 43, 48], 3, 5) },
  { id: 4, name: "lose", speed: 12, notes: seq([36, 33, 30, 24], 1, 5, 0) },
  { id: 5, name: "jump", speed: 4, notes: seq([24, 28, 32, 36], 0, 5) },
  { id: 6, name: "blip", speed: 4, notes: seq([48], 4, 4) },
  { id: 7, name: "explode", speed: 6, notes: seq([20, 16, 12, 8, 4], 6, 7, 0) },
];

export const soundAssets = () =>
  editAssets(
    emptySnapshot().assets,
    SOUNDS.map(({ id, speed, notes }) => ({ kind: "sfx", id, speed, notes })),
  );

/** The cart's resources with the bank in sfx 0-7 when those slots are all empty; otherwise unchanged. */
export function withSoundBank(assets) {
  const used = new Set(assetSummary(assets).sfx);
  if (SOUNDS.some(({ id }) => used.has(id))) return assets;
  return editAssets(
    assets,
    SOUNDS.map(({ id, speed, notes }) => ({ kind: "sfx", id, speed, notes })),
  );
}
