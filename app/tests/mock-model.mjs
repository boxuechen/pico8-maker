// Local integration fixture, never an AI fallback. No real credentials needed.
import http from "node:http";
import { inflateSync } from "node:zlib";
function probeColor(body) {
  const part = body.messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .find((p) => p.type === "image_url");
  const png = Buffer.from(part.image_url.url.split(",")[1], "base64");
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const first = inflateSync(Buffer.concat(idat));
  return first[1] > first[2] && first[1] > first[3]
    ? "red"
    : first[2] > first[3]
      ? "green"
      : "blue";
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "*",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.model === "fixture-error") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "Fixture: invalid credentials",
            type: "authentication_error",
          },
        }),
      );
      return;
    }
    if (body.model === "fixture-slow")
      await new Promise((r) => setTimeout(r, 20000));
    if (!body.stream) {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        }),
      );
      return;
    }
    if (body.tools?.some((t) => t.function.name === "report_screen")) {
      const done = body.messages.some((m) => m.role === "tool");
      const delta = done
        ? { role: "assistant", content: "OK" }
        : {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "probe",
                type: "function",
                function: {
                  name: "report_screen",
                  arguments: JSON.stringify({ color: probeColor(body) }),
                },
              },
            ],
          };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: done ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
      );
      return;
    }
    const offered = new Set(body.tools?.map((t) => t.function.name));
    for (const name of [
      "read_game",
      "load_game",
      "reset_game",
      "press_buttons",
      "observe_game",
    ])
      if (!offered.has(name))
        throw new Error(`Missing registered game tool: ${name}`);
    const toolResults = body.messages.filter((m) => m.role === "tool");
    const step = toolResults.length;
    const first = toolResults[0]?.content;
    const source =
      typeof first === "string"
        ? first
        : (first ?? [])
            .filter((x) => x.type === "text")
            .map((x) => x.text)
            .join("\n");
    const observationFixture = body.model === "fixture-observation";
    // Repair through the workspace: targeted edit, then load the edited file.
    const editFixture = body.model === "fixture-edit";
    const operations = editFixture
      ? [
          ["read_game", {}],
          [
            "edit",
            {
              path: "main.lua",
              edits: [{ oldText: "jump_speed=-3", newText: "jump_speed=-4.5" }],
            },
          ],
          ["load_game", {}],
          ["reset_game", {}],
          ["press_buttons", { frames: 24, buttons: 2 }],
          ["press_buttons", { frames: 1, buttons: 34 }],
          ["press_buttons", { frames: 45, buttons: 2 }],
          ["observe_game", {}],
        ]
      : observationFixture
      ? [
          [
            "load_game",
            {
              source:
                "function _draw()\n cls(0) pal(8,136,1)\n for y=0,127 do for x=0,127 do pset(x,y,(x+y)%16) end end\nend",
            },
          ],
          ["observe_game", { format: "ascii" }],
          [
            "observe_game",
            { format: "both", region: { x: 1, y: 3, width: 7, height: 5 } },
          ],
          ["observe_game", {}],
        ]
      : [
          ["read_game", {}],
          ["reset_game", {}],
          ["press_buttons", { frames: 24, buttons: 2 }],
          ["press_buttons", { frames: 1, buttons: 34 }],
          ["press_buttons", { frames: 45, buttons: 2 }],
          [
            "load_game",
            { source: source.replace("jump_speed=-3", "jump_speed=-4.5") },
          ],
          ["reset_game", {}],
          ["press_buttons", { frames: 24, buttons: 2 }],
          ["press_buttons", { frames: 1, buttons: 34 }],
          ["press_buttons", { frames: 45, buttons: 2 }],
          ["observe_game", {}],
        ];
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const send = (delta, finish_reason = null) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    send({ role: "assistant", content: "" });
    if (step < operations.length) {
      const [name, args] = operations[step];
      send({
        tool_calls: [
          {
            index: 0,
            id: `call_${step}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      send({}, "tool_calls");
    } else {
      if (observationFixture) {
        const text = toolResults
          .map((r) =>
            typeof r.content === "string"
              ? r.content
              : JSON.stringify(r.content),
          )
          .join("\n");
        const images = body.messages
          .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
          .filter((p) => p.type === "image_url");
        const sizes = images.map((p) => {
          const png = Buffer.from(p.image_url.url.split(",")[1], "base64");
          return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
        });
        if (
          !text.includes("8 = deep rose (#be1250), display code 136") ||
          !text.includes("region: x=1 y=3 width=7 height=5") ||
          !sizes.includes("7x5") ||
          !sizes.includes("128x128")
        )
          throw new Error(
            "Observation fixture did not receive the expected palette, crop and PNG sizes",
          );
      }
      send({
        content: observationFixture
          ? "联调模拟响应：完整 ASCII、实际扩展调色板、7×5 同帧裁剪和默认 128×128 PNG 已收到。此响应来自本地测试服务，不是实际模型推理。"
          : "联调模拟响应：已执行读取、修复前测试、修改和修复后测试。此响应来自本地测试服务，不是实际模型推理。",
      });
      send({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }
});
server.listen(8788, "127.0.0.1", () =>
  console.log("Test-only model fixture: http://127.0.0.1:8788/v1"),
);
