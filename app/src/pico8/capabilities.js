export const capabilities = Object.freeze({
  maxInputFrames: 120,
  maxSourceLength: 100000,
  observation: "png",
  observationFormats: Object.freeze(["png", "ascii", "both"]),
  observationCropping: true,
  observationMaxBytes: 32768,
  observationMaxLines: 256,
  persistence: "memory",
  audioObservation: false,
});
