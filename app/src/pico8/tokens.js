// Approximate PICO-8 token counter, following the manual's rules: words,
// operators, literals and bracket pairs count once; commas, periods, colons,
// semicolons, `local`, `end`, closing brackets and comments are free.
export const TOKEN_LIMIT = 8192;
export const CHAR_LIMIT = 65535;

const free = new Set(["local", "end"]);
const operators = [
  ">>>=", "<<>=", ">><=", "...", "..=", ">>>", "<<>", ">><", "^^=",
  "==", "~=", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "^=", "\\=",
  "&=", "|=", "..", ">>", "<<", "^^",
];
const keywords = new Set([
  "and", "break", "do", "else", "elseif", "end", "for", "function", "goto",
  "if", "in", "local", "not", "or", "repeat", "return", "then", "until", "while",
]);
// True when the previous token ends an expression, making "-" binary.
const endsValue = (prev) =>
  /^[0"')\]}]$/.test(prev) || (/^[A-Za-z_]/.test(prev) && !keywords.has(prev));

// The optional visitor shares string/comment skipping with advisory source checks.
export function countTokens(source = "", { onNumber } = {}) {
  const s = String(source);
  let count = 0;
  let i = 0;
  let prev = ""; // last significant character or word, for unary minus
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ((c === "-" && s[i + 1] === "-") || (c === "/" && s[i + 1] === "/")) {
      i += 2;
      const long = c === "-" && /^\[(=*)\[/.exec(s.slice(i, i + 16));
      if (long) {
        const close = `]${long[1]}]`;
        const end = s.indexOf(close, i);
        i = end < 0 ? s.length : end + close.length;
      } else while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    const longString = c === "[" && /^\[(=*)\[/.exec(s.slice(i, i + 16));
    if (longString) {
      const close = `]${longString[1]}]`;
      const end = s.indexOf(close, i + longString[0].length);
      i = end < 0 ? s.length : end + close.length;
      count++;
      prev = '"';
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < s.length && s[i] !== c && s[i] !== "\n") i += s[i] === "\\" ? 2 : 1;
      i++;
      count++;
      prev = '"';
      continue;
    }
    const number = /^(0x[0-9a-f_]*\.?[0-9a-f_]*|0b[01_]*\.?[01_]*|\d[\d_]*\.?[\d_]*(e[+-]?\d+)?|\.\d[\d_]*(e[+-]?\d+)?)/i.exec(
      s.slice(i, i + 64),
    );
    if (number) {
      onNumber?.(number[0], i);
      i += number[0].length;
      count++;
      prev = "0";
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i, i + 256));
    if (word) {
      i += word[0].length;
      if (!free.has(word[0])) count++;
      prev = word[0];
      continue;
    }
    const op = operators.find((o) => s.startsWith(o, i));
    if (op) {
      i += op.length;
      count++;
      prev = op;
      continue;
    }
    i++;
    if (",;.:)]}".includes(c)) {
      prev = c;
      continue;
    }
    // A minus directly before a number literal folds into that literal.
    if (c === "-" && !endsValue(prev) && /^\s*(\d|\.\d)/.test(s.slice(i, i + 8))) {
      prev = c;
      continue;
    }
    count++;
    prev = c;
  }
  return count;
}
