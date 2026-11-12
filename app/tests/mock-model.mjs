// Local integration fixture, never an AI fallback. No real credentials needed.
import http from "node:http";
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
    const operations = [
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
      send({
        content:
          "联调模拟响应：已执行读取、修复前测试、修改和修复后测试。此响应来自本地测试服务，不是实际模型推理。",
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
