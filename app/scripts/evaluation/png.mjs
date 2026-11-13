import { deflateSync } from "node:zlib";
function crc(bytes) {
  let n = -1;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ -1) >>> 0;
}
export function png(rgba, width = 128, height = 128) {
  const chunk = (type, bytes) => {
    const t = Buffer.from(type),
      sz = Buffer.alloc(4),
      c = Buffer.alloc(4);
    sz.writeUInt32BE(bytes.length);
    c.writeUInt32BE(crc(Buffer.concat([t, bytes])));
    return Buffer.concat([sz, t, bytes, c]);
  };
  const h = Buffer.alloc(13);
  h.writeUInt32BE(width, 0);
  h.writeUInt32BE(height, 4);
  h[8] = 8;
  h[9] = 6;
  const stride = width * 4,
    rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    rows.set(rgba.slice(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
