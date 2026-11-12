import { countTokens, TOKEN_LIMIT, CHAR_LIMIT } from "./tokens.js";

// Advisory measurements, not a parser, export validator or authoring limit.
export function sourceBudget(source) {
  const numericWarnings = [];
  let largeDecimals = 0;
  const codeTokensApprox = countTokens(source, {
    onNumber(literal, offset) {
      // Hex/binary often encode intentional bit patterns. Leave the +/-32768
      // boundary alone: this lexical check does not resolve unary expressions.
      if (
        /^0[xb]/i.test(literal) ||
        Number(literal.replaceAll("_", "")) <= 32768
      )
        return;
      largeDecimals++;
      if (numericWarnings.length === 4) return;
      const line = source.slice(0, offset).split("\n").length;
      numericWarnings.push(
        `Line ${line}: decimal literal ${literal} exceeds signed 16.16 magnitude and wraps in PICO-8. Check distance sentinels or counters; use nil for an unset nearest distance or keep values bounded. Intentional wrap may be retained.`,
      );
    },
  });
  return {
    codeTokensApprox,
    codeTokenTarget: TOKEN_LIMIT,
    sourceCharacters: source.length,
    sourceBytes: new TextEncoder().encode(source).length,
    characterTarget: CHAR_LIMIT,
    compatibility:
      "unverified; token count is approximate; compressed size and official PICO-8 execution are not checked",
    warnings: [
      ...numericWarnings,
      ...(largeDecimals > numericWarnings.length
        ? [
            `${largeDecimals - numericWarnings.length} more large decimal literals; only the first 4 are listed.`,
          ]
        : []),
      ...(codeTokensApprox > TOKEN_LIMIT
        ? ["Approximate code tokens exceed the PICO-8 target."]
        : []),
      ...(source.length > CHAR_LIMIT
        ? ["Source characters exceed the PICO-8 target."]
        : []),
    ],
  };
}
