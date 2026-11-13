import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { evaluationRecorder } from "./scripts/evaluation/evaluation-recorder.mjs";

const appEntry = fileURLToPath(new URL("./index.html", import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    evaluationRecorder(),
    react(),
    {
      name: "embedded-pico-cartridges",
      transformIndexHtml(_html, { filename }) {
        if (filename !== appEntry) return;
        const carts = JSON.parse(
          readFileSync(
            new URL("./src/assets/carts.json", import.meta.url),
            "utf8",
          ),
        );
        const data = Object.fromEntries(
          carts.map((cart) => [
            cart.id,
            readFileSync(
              new URL(`./src/assets/carts/${cart.id}.p8.png`, import.meta.url),
            ).toString("base64"),
          ]),
        );
        return [
          {
            tag: "script",
            attrs: { id: "pico-cartridges", type: "application/json" },
            children: JSON.stringify(data),
            injectTo: "head",
          },
        ];
      },
    },
  ],
});
