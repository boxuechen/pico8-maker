import palette from "./palette.js";
import { pixel, sprite, sound, music } from "./assets.js";

const colors = palette
  .slice(0, 16)
  .map((p) => [1, 3, 5].map((i) => parseInt(p.rgb.slice(i, i + 2), 16)));
function raster(width, height, colorAt) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rgba.set([...colors[colorAt(x, y)], 255], (y * width + x) * 4);
  return { width, height, rgba };
}
export function renderSheet(
  bytes,
  { x = 0, y = 0, width = 128, height = 128 } = {},
) {
  return raster(width, height, (i, j) => pixel(bytes, x + i, y + j));
}
export function renderMap(bytes, { x, y, width, height }) {
  return raster(width * 8, height * 8, (i, j) => {
    const tile = bytes[0x2000 + (y + (j >> 3)) * 128 + x + (i >> 3)];
    return tile === 0
      ? 0
      : pixel(
          bytes,
          (tile % 16) * 8 + (i % 8),
          Math.floor(tile / 16) * 8 + (j % 8),
        );
  });
}
const digits = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001111001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001001001",
  "111101111101111",
  "111101111001111",
];
function set(image, x, y, rgb) {
  image.rgba.set([...rgb, 255], (y * image.width + x) * 4);
}
function number(image, value, x, y) {
  [...String(value)].forEach((digit, n) => {
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++)
        if (digits[Number(digit)][j * 3 + i] === "1")
          set(image, x + n * 4 + i, y + j, colors[7]);
  });
}
function paste(target, source, x, y, scale) {
  for (let j = 0; j < source.height * scale; j++)
    for (let i = 0; i < source.width * scale; i++) {
      const start =
        (Math.floor(j / scale) * source.width + Math.floor(i / scale)) * 4;
      set(target, x + i, y + j, source.rgba.subarray(start, start + 3));
    }
}

// Authored data only. No runtime palette, transparency, camera or flags filter.
export function assetPreview(bytes, query, data) {
  const rendering =
    "Authored base palette; color 0 is black; map tile 0 is empty. Runtime palette, transparency, camera and flag filters are not applied.";
  if (query.kind === "sprite") {
    const columns = Math.min(4, data.length),
      cellWidth = 40,
      cellHeight = 44;
    const image = raster(
      columns * cellWidth,
      Math.ceil(data.length / columns) * cellHeight,
      () => 5,
    );
    const slots = data.map((s, i) => {
      const x = (i % columns) * cellWidth,
        y = Math.floor(i / columns) * cellHeight;
      number(image, s.id, x + 4, y + 2);
      paste(
        image,
        renderSheet(bytes, {
          x: (s.id % 16) * 8,
          y: Math.floor(s.id / 16) * 8,
          width: 8,
          height: 8,
        }),
        x + 4,
        y + 10,
        4,
      );
      return {
        id: s.id,
        flags: s.flags,
        imageRegion: { x: x + 4, y: y + 10, width: 32, height: 32 },
      };
    });
    return {
      image,
      description: {
        kind: "sprite-atlas",
        rendering,
        pixelScale: 4,
        columns,
        cellWidth,
        cellHeight,
        slots,
      },
    };
  }
  const { x, y, rows } = data;
  const height = rows.length,
    width = rows[0].length;
  const image = raster(width * 17 + 1, height * 17 + 1, () => 5);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++)
      paste(
        image,
        renderMap(bytes, { x: x + i, y: y + j, width: 1, height: 1 }),
        1 + i * 17,
        1 + j * 17,
        2,
      );
  return {
    image,
    description: {
      kind: "map",
      rendering,
      pixelScale: 2,
      tileStride: 17,
      gridWidth: 1,
      origin: { x, y },
      tiles: { width, height },
    },
  };
}

export function assetChanges(before, after, edits) {
  const changes = new Map();
  for (const e of edits) {
    if (e.kind === "map") {
      let cells = 0;
      for (let j = 0; j < e.rows.length; j++)
        for (let i = 0; i < e.rows[0].length; i++) {
          const at = 0x2000 + (e.y + j) * 128 + e.x + i;
          if (before[at] !== after[at]) cells++;
        }
      if (cells) {
        const region = {
          kind: "map",
          x: e.x,
          y: e.y,
          width: e.rows[0].length,
          height: e.rows.length,
        };
        changes.set(JSON.stringify(region), { ...region, changedCells: cells });
      }
    } else {
      const read = { sprite, sfx: sound, music }[e.kind];
      const a = read(before, e.id),
        b = read(after, e.id);
      const fields = Object.keys(b).filter(
        (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
      );
      if (fields.length)
        changes.set(`${e.kind}:${e.id}`, { kind: e.kind, id: e.id, fields });
    }
  }
  return [...changes.values()];
}
