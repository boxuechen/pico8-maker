import { useEffect, useRef } from "react";

// Match the website's power-on sequence: vertical coloured bits, dense cross-scan,
// horizontal streaks, then black. The game only starts after the sequence ends.
const palette = [
  "#000000",
  "#1d2b53",
  "#7e2553",
  "#008751",
  "#ab5236",
  "#5f574f",
  "#c2c3c7",
  "#fff1e8",
  "#ff004d",
  "#ffa300",
  "#ffec27",
  "#00e436",
  "#29adff",
  "#83769c",
  "#ff77a8",
  "#ffccaa",
];
export function BootScreen() {
  const canvas = useRef(null);
  useEffect(() => {
    const ctx = canvas.current.getContext("2d");
    const start = performance.now();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame;
    function draw(now) {
      const elapsed = now - start;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 128, 128);
      if (!reduced && elapsed > 100 && elapsed < 1240) {
        const phase = elapsed / 1400;
        const spacing = phase < 0.28 ? 8 : phase < 0.53 ? 4 : 2;
        const horizontal = phase > 0.72;
        for (let x = 0; x < 128; x += horizontal ? 1 : spacing)
          for (let y = 0; y < 128; y += horizontal ? 4 : 2) {
            const hash =
              ((x * 31 + y * 73 + Math.floor(elapsed / 65) * 17) ^
                (x * y * 13)) >>>
              0;
            if (hash % 5 === 0) continue;
            ctx.fillStyle = palette[1 + (hash % 15)];
            ctx.fillRect(x, y, phase > 0.6 ? 2 : 1, 1);
          }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={canvas}
      width={128}
      height={128}
      className="boot-screen"
      aria-label="Powering on PICO-8"
    />
  );
}
