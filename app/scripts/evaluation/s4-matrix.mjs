import { createConnection } from "../../src/model-config.js";

// Credentials are referenced only by environment-variable name; use a separate
// variable for each endpoint. No discovery, fallback keys or family inference.
export function resolveMatrix(matrix, env = process.env) {
  if (
    matrix.schemaVersion !== 1 ||
    !Array.isArray(matrix.models) ||
    !matrix.models.length
  )
    throw Error("Invalid S4 matrix");
  const ids = new Set();
  return matrix.models.map((row) => {
    const allowed = [
      "id",
      "family",
      "provider",
      "model",
      "baseUrl",
      "apiKeyEnv",
      "thinkingLevel",
      "contextWindow",
      "maxTokens",
      "input",
      "api",
    ];
    if (
      Object.keys(row).some((k) => !allowed.includes(k)) ||
      !/^[a-z0-9-]+$/.test(row.id) ||
      ids.has(row.id)
    )
      throw Error("Invalid or duplicate model entry");
    ids.add(row.id);
    if (!/^[A-Z][A-Z0-9_]+$/.test(row.apiKeyEnv))
      throw Error("apiKeyEnv must name an environment variable");
    const metadata = { ...row };
    if (!row.model || !row.baseUrl)
      return {
        metadata,
        status: "not_run",
        reason: "model_or_endpoint_not_configured",
      };
    if (!env[row.apiKeyEnv])
      return {
        metadata,
        status: "not_run",
        reason: "credential_not_configured",
      };
    if (row.provider === "custom" && !row.input?.includes("image"))
      return {
        metadata,
        status: "not_run",
        reason: "vision_capability_not_declared",
      };
    const connection = createConnection({ ...row, apiKey: env[row.apiKeyEnv] });
    const m = connection.model;
    return {
      config: connection.config,
      status: "ready",
      metadata: {
        ...metadata,
        api: m.api,
        input: m.input,
        capabilitySource:
          row.provider === "custom" ? "explicit_config" : "pinned_catalog",
        thinkingLevel: connection.thinkingLevel,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      },
    };
  });
}
