import { createModels } from "@earendil-works/pi-ai/models";
import { createConnection } from "../../src/model-config.js";
import { modelImage } from "../../src/pico8/observation.js";
import { png } from "./png.mjs";
import { usageMetrics } from "./s4-metrics.mjs";
import { fingerprint } from "../../src/pico8/playtests.js";
export const boardRows = [
  "012301",
  "230120",
  "103232",
  "321010",
  "002133",
  "132201",
];
export const boardPrompt =
  "Read the 6 by 6 colored tile board in the image. From top to bottom, left to right, encode red=0, yellow=1, green=2, blue=3. Return only a JSON array of six strings of six digits, with no Markdown or explanation.";
export function boardImage(size) {
  const rgba = new Uint8ClampedArray(128 * 128 * 4),
    colors = [
      [255, 0, 77],
      [255, 236, 39],
      [0, 228, 54],
      [41, 173, 255],
    ];
  for (let i = 0; i < rgba.length; i += 4) rgba.set([29, 43, 83, 255], i);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++)
      for (let dy = 0; dy < 8; dy++)
        for (let dx = 0; dx < 8; dx++)
          rgba.set(
            [...colors[Number(boardRows[y][x])], 255],
            ((28 + y * 12 + dy) * 128 + 28 + x * 12 + dx) * 4,
          );
  if (size === 128) return { rgba, width: 128, height: 128 };
  if (size === 512) return modelImage({ rgba, width: 128, height: 128 });
  throw Error("Image comparison accepts 128 or 512");
}
export function scoreBoard(text) {
  try {
    const rows = JSON.parse(text);
    if (
      !Array.isArray(rows) ||
      rows.length !== 6 ||
      rows.some((r) => typeof r !== "string" || !/^[0-3]{6}$/.test(r))
    )
      throw Error("shape");
    const correct = rows.reduce(
      (n, r, y) => n + [...r].filter((v, x) => v === boardRows[y][x]).length,
      0,
    );
    return { valid: true, correct, total: 36, exact: correct === 36 };
  } catch {
    return { valid: false, correct: 0, total: 36, exact: false };
  }
}
export async function compareImages(config) {
  const { model, provider, thinkingLevel } = createConnection(config),
    models = createModels();
  models.setProvider(provider);
  const results = [];
  for (const size of [128, 512]) {
    const board = boardImage(size),
      data = png(board.rgba, board.width, board.height),
      started = performance.now();
    try {
      const response = await models
        .streamSimple(
          model,
          {
            systemPrompt:
              "Read only the supplied image. Follow the requested output format.",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: boardPrompt },
                  {
                    type: "image",
                    mimeType: "image/png",
                    data: data.toString("base64"),
                  },
                ],
                timestamp: Date.now(),
              },
            ],
          },
          {
            reasoning: thinkingLevel,
            maxTokens: 2048,
            signal: AbortSignal.timeout(60000),
            timeoutMs: 60000,
            maxRetries: 0,
          },
        )
        .result();
      const text = response.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
      results.push({
        size,
        status: response.stopReason === "stop" ? "completed" : "error",
        imageHash: await fingerprint(data),
        elapsedMs: Math.round(performance.now() - started),
        response,
        score: response.stopReason === "stop" ? scoreBoard(text) : null,
        usage: usageMetrics([response]),
      });
    } catch (e) {
      results.push({
        size,
        status: "error",
        error: String(e.message),
        elapsedMs: Math.round(performance.now() - started),
      });
    }
  }
  return {
    prompt: boardPrompt,
    expected: boardRows,
    order: [128, 512],
    results,
  };
}
