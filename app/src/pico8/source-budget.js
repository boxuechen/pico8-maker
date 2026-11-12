import { countTokens, TOKEN_LIMIT, CHAR_LIMIT } from "./tokens.js";

// Advisory measurements, not a parser, export validator or authoring limit.
export function sourceBudget(source) {
  const codeTokensApprox = countTokens(source);
  return {
    codeTokensApprox,
    codeTokenTarget: TOKEN_LIMIT,
    sourceCharacters: source.length,
    sourceBytes: new TextEncoder().encode(source).length,
    characterTarget: CHAR_LIMIT,
    compatibility:
      "unverified; token count is approximate; compressed size and official PICO-8 execution are not checked",
    warnings: [
      ...(codeTokensApprox > TOKEN_LIMIT
        ? ["Approximate code tokens exceed the PICO-8 target."]
        : []),
      ...(source.length > CHAR_LIMIT
        ? ["Source characters exceed the PICO-8 target."]
        : []),
    ],
  };
}
