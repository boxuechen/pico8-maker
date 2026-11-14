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
// The scripts below were written as game actions; the agent only has
// read/write/edit/bash and the resource tools, so turn each action into the
// shell call a model would make.
const BUTTON_NAMES = [[1, "left"], [2, "right"], [4, "up"], [8, "down"], [16, "o"], [32, "x"]];
const pressText = (steps) =>
  steps
    .map(({ frames, buttons }) => {
      const names = BUTTON_NAMES.filter(([bit]) => buttons & bit).map(([, n]) => n);
      return `${names.join("+") || "wait"}${frames > 1 ? `*${frames}` : ""}`;
    })
    .join(" ");
function toShell(actions) {
  const out = [];
  let route = null;
  const flush = () => {
    if (route) out.push(["bash", { command: `p8 run --press "${pressText(route)}"` }]);
    route = null;
  };
  for (const [name, args] of actions) {
    if (name === "press_buttons") {
      (route ??= []).push(...args.steps);
      continue;
    }
    flush();
    if (name === "reset_game") route = [];
    else if (name === "load_game") {
      if (args.source !== undefined) out.push(["write", { path: "/cart/main.lua", content: args.source }]);
      out.push(["bash", { command: "p8 check" }]);
    } else if (name === "observe_game") {
      out.push(["bash", { command: "p8 look --png /tmp/screen.png" }]);
      out.push(["read", { path: "/tmp/screen.png" }]);
    } else out.push([name, args]);
  }
  flush();
  return out;
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
    for (const name of ["read", "write", "edit", "bash", "read_assets", "edit_assets"])
      if (!offered.has(name))
        throw new Error(`Missing registered game tool: ${name}`);
    const resourceFixture = body.model === "fixture-resources";
    const comparisonFixture = body.model === "fixture-comparison";
    const isRequest = (m) =>
      m.role === "user" &&
      (typeof m.content === "string" ||
        m.content?.every((p) => p.type === "text"));
    const round = body.messages.filter(isRequest).length;
    const messages = comparisonFixture
      ? body.messages.slice(body.messages.findLastIndex(isRequest))
      : body.messages;
    const toolResults = messages.filter((m) => m.role === "tool");
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
    const operations = toShell(comparisonFixture
      ? round > 2
        ? []
        : [
            ...(round === 1
              ? [[11, "BEFORE"]]
              : [
                  [12, "INTERMEDIATE"],
                  [14, "AFTER"],
                ]
            ).map(([color, label]) => [
              "load_game",
              {
                source: `function _draw() cls(1) circfill(64,64,14,${color}) print("${label}",40,90,7) end`,
              },
            ]),
            ["reset_game", { purpose: "normal" }],
            [
              "press_buttons",
              { steps: [{ frames: 1, buttons: 16, tap: true, capture: true }] },
            ],
          ]
      : body.model === "fixture-draft"
        ? [
            [
              "edit_assets",
              {
                edits: [
                  { kind: "sprite", id: 1, rows: Array(8).fill("bbbbbbbb") },
                ],
              },
            ],
            [
              "load_game",
              {
                source:
                  "-- COMMITTED_SOURCE\nfunction _draw() cls(1) spr(1,16,64) end",
              },
            ],
            [
              "edit_assets",
              {
                edits: [
                  { kind: "sprite", id: 1, rows: Array(8).fill("eeeeeeee") },
                ],
              },
            ],
            ["load_game", { source: "-- DRAFT_SOURCE\nfunction broken(" }],
          ]
        : resourceFixture
          ? [
              ["read_assets", {}],
              [
                "edit_assets",
                {
                  edits: [
                    {
                      kind: "sprite",
                      id: 1,
                      rows: [
                        "00088000",
                        "00888800",
                        "08888880",
                        "08800880",
                        "08888880",
                        "00888800",
                        "00800800",
                        "08000080",
                      ],
                      flags: 1,
                    },
                    {
                      kind: "sprite",
                      id: 2,
                      rows: Array(8).fill("33333333"),
                      flags: 1,
                    },
                    { kind: "map", x: 0, y: 12, rows: [Array(16).fill(2)] },
                    {
                      kind: "sfx",
                      id: 0,
                      speed: 8,
                      notes: [
                        { pitch: 24, waveform: 0, volume: 5, effect: 0 },
                        { pitch: 28, waveform: 0, volume: 5, effect: 0 },
                        { pitch: 31, waveform: 0, volume: 5, effect: 0 },
                      ],
                    },
                    {
                      kind: "music",
                      id: 0,
                      channels: [0, null, null, null],
                      loopStart: true,
                      loopEnd: true,
                    },
                  ],
                },
              ],
              [
                "load_game",
                {
                  source:
                    "function _init() x=60 assert(mget(0,12)==2) assert(fget(1,0)) music(0) end\nfunction _update() if btn(0) then x-=1 end if btn(1) then x+=1 end end\nfunction _draw() cls(1) map(0,0,0,0,16,16) spr(1,x,88) print('resource test',36,20,7) end",
                },
              ],
              ["press_buttons", { steps: [{ frames: 10, buttons: 2 }] }],
              [
                "edit_assets",
                {
                  edits: [
                    {
                      kind: "sprite",
                      id: 1,
                      rows: [
                        "000bb000",
                        "00bbbb00",
                        "0bbbbbb0",
                        "0bb00bb0",
                        "0bbbbbb0",
                        "00bbbb00",
                        "00b00b00",
                        "0b0000b0",
                      ],
                    },
                  ],
                },
              ],
              ["load_game", {}],
              ["read_assets", { kind: "sprite", id: 1 }],
              ["observe_game", {}],
            ]
          : editFixture
            ? [
                ["read", { path: "/cart/main.lua" }],
                [
                  "edit",
                  {
                    path: "main.lua",
                    edits: [
                      { oldText: "jump_speed=-3", newText: "jump_speed=-4.5" },
                    ],
                  },
                ],
                ["load_game", {}],
                ["reset_game", {}],
                ["press_buttons", { steps: [{ frames: 24, buttons: 2 }] }],
                ["press_buttons", { steps: [{ frames: 1, buttons: 34 }] }],
                ["press_buttons", { steps: [{ frames: 45, buttons: 2 }] }],
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
                    {
                      format: "both",
                      region: { x: 1, y: 3, width: 7, height: 5 },
                    },
                  ],
                  ["observe_game", {}],
                ]
              : [
                  ["read", { path: "/cart/main.lua" }],
                  ["reset_game", {}],
                  ["press_buttons", { steps: [{ frames: 24, buttons: 2 }] }],
                  ["press_buttons", { steps: [{ frames: 1, buttons: 34 }] }],
                  ["press_buttons", { steps: [{ frames: 45, buttons: 2 }] }],
                  [
                    "load_game",
                    {
                      source: source.replace(
                        "jump_speed=-3",
                        "jump_speed=-4.5",
                      ),
                    },
                  ],
                  ["reset_game", {}],
                  ["press_buttons", { steps: [{ frames: 24, buttons: 2 }] }],
                  ["press_buttons", { steps: [{ frames: 1, buttons: 34 }] }],
                  ["press_buttons", { steps: [{ frames: 45, buttons: 2 }] }],
                  ["observe_game", {}],
                ]);
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
            id: comparisonFixture ? `call_${round}_${step}` : `call_${step}`,
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
        if (!text.includes("screen 32x32") || !sizes.includes("512x512"))
          throw new Error(
            "Observation fixture did not receive the p8 look text picture and its 512x512 PNG",
          );
      }
      send({
        content:
          body.model === "fixture-draft"
            ? "草稿检查模拟：v1 包含 COMMITTED_SOURCE 和绿色精灵，失败草稿包含 DRAFT_SOURCE 和粉色精灵。请切换 Code / Resources 的版本选择检查；这是本地测试响应。"
            : resourceFixture
              ? "资源联调完成：源码与资源已提交两版，仅资源变化也生成了版本。此响应来自本地测试服务，不是实际模型推理。"
              : observationFixture
                ? "联调模拟响应：p8 look 的 32×32 字符画和 512×512 PNG 已收到。此响应来自本地测试服务，不是实际模型推理。"
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
const port = Number(process.env.MOCK_MODEL_PORT || 8788);
server.listen(port, "127.0.0.1", () =>
  console.log(`Test-only model fixture: http://127.0.0.1:${port}/v1`),
);
