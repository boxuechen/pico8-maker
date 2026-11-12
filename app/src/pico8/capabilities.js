export const capabilities = Object.freeze({
  maxInputFrames: 600,
  maxInputSteps: 8,
  maxInputCaptures: 8,
  observation: "png",
  observationFormats: Object.freeze(["png", "ascii", "both"]),
  observationCropping: true,
  observationMaxBytes: 32768,
  observationMaxLines: 256,
  persistence: "memory",
  audioObservation: false,
});
