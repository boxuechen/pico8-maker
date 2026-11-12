import { createReadTool } from "@earendil-works/pi-durable/tools";
import { mainPath } from "./workspace.js";

const read = createReadTool();
const byteLimit = 32768;
export const sourceRangeProperties = {
  byteOffset: {
    type: "integer",
    minimum: 0,
    description:
      "Only /cart/main.lua: zero-based UTF-8 byte offset for continuing an oversized line. Use the returned next offset. Cannot combine with offset/limit.",
  },
  byteLimit: {
    type: "integer",
    minimum: 4,
    maximum: byteLimit,
    description:
      "Source byte-range length (default 32768). Requires byteOffset; the result ends at a UTF-8 boundary.",
  },
};
const continuation = (args) =>
  `Continue with read(${JSON.stringify({ path: mainPath, ...args })}).`;

// Keep Pi's normal line pagination. Byte ranges handle the one case its built-in
// diagnostic delegates to bash, which this browser workspace does not provide.
export async function readSource(args, workspace, context = {}) {
  context.abortSignal?.throwIfAborted();
  const source = workspace.read();
  if (args.byteOffset !== undefined || args.byteLimit !== undefined) {
    const start = args.byteOffset;
    const limit = args.byteLimit ?? byteLimit;
    if (
      args.offset !== undefined ||
      args.limit !== undefined ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 4 ||
      limit > byteLimit
    )
      throw new Error(
        "Source byte reads require byteOffset >= 0 and byteLimit 4–32768, without offset/limit",
      );
    const bytes = new TextEncoder().encode(source);
    if (
      start > bytes.length ||
      (start < bytes.length && (bytes[start] & 0xc0) === 0x80)
    )
      throw new Error(
        "byteOffset must be a UTF-8 boundary within the source; use the returned next offset",
      );
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    // Keep this range below the Harness's line limit too.
    let lines = 0;
    for (let i = start; i < end; i++) {
      if (bytes[i] === 10 && ++lines === 1000) {
        end = i + 1;
        break;
      }
    }
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes.subarray(start, end));
    return {
      output: text ? [{ type: "text", text }] : [],
      structuredOutput: text,
      diagnostics: [
        {
          severity: "info",
          code: "source_range",
          message: `Source bytes ${start}–${end} (end exclusive) of ${bytes.length}. ${end < bytes.length ? continuation({ byteOffset: end }) : "End of source."}`,
        },
      ],
    };
  }
  const result = await read.execute(
    { ...args, path: mainPath },
    { env: workspace },
    context,
  );
  if (result.details?.truncation?.firstLineExceedsLimit) {
    const startLine = args.offset ?? 1;
    const lines = source.split("\n");
    const prefix =
      startLine > 1 ? lines.slice(0, startLine - 1).join("\n") + "\n" : "";
    const next =
      new TextEncoder().encode(prefix).length +
      result.details.truncation.outputBytes +
      (startLine === 1 && source.startsWith("\ufeff") ? 3 : 0);
    result.diagnostics = [
      {
        severity: "info",
        code: "truncated",
        message: `Line ${startLine} is only partially shown. ${continuation({ byteOffset: next })}`,
      },
    ];
  } else {
    result.diagnostics = (result.diagnostics ?? []).map((d) => ({
      ...d,
      message: d.message.replace(
        /Use offset=(\d+) to continue\./g,
        (_, offset) => continuation({ offset: Number(offset) }),
      ),
    }));
  }
  return result;
}
