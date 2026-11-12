import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
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
    react(),
    {
      name: "embedded-pico-cartridges",
      transformIndexHtml() {
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
              new URL(
                `./public/assets/carts/${cart.id}.p8.png`,
                import.meta.url,
              ),
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
