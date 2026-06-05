// scripts/gen-icons.mjs
// Dependency-free icon generator for Refont. Renders a white "R." mark on a
// cobalt rounded square (matches the wordmark + --accent #2f55e0). Outputs
// public/icons/icon-{16,48,128,512}.png and a scalable public/icons/icon.svg.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'icons');

// ---- design parameters (in a 0..100 coordinate space, y down) ----
const BG_RADIUS = 24;
const TOP = [47, 85, 224];   // #2f55e0
const BOT = [30, 63, 181];   // #1e3fb5
const STROKE_H = 6.8;        // half stroke width (full 13.6)
const STEM = [37.5, 22, 37.5, 78];
const BOWL_C = [37.5, 35];   // center; right-half ring, radius 13 → semicircle 22..48
const BOWL_R = 13;
const LEG = [40, 46, 58, 78];
const DOT = [67, 72, 6.2];   // the "Refont." period

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inGlyph(X, Y) {
  if (segDist(X, Y, STEM[0], STEM[1], STEM[2], STEM[3]) <= STROKE_H) return true;
  if (segDist(X, Y, LEG[0], LEG[1], LEG[2], LEG[3]) <= STROKE_H) return true;
  if (X >= BOWL_C[0] && Math.abs(Math.hypot(X - BOWL_C[0], Y - BOWL_C[1]) - BOWL_R) <= STROKE_H) return true;
  if (Math.hypot(X - DOT[0], Y - DOT[1]) <= DOT[2]) return true;
  return false;
}
function bgSdf(X, Y) {
  const dx = Math.abs(X - 50) - (50 - BG_RADIUS);
  const dy = Math.abs(Y - 50) - (50 - BG_RADIUS);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - BG_RADIUS;
}

function render(size) {
  const S = size <= 48 ? 8 : 4; // supersample factor for anti-aliasing
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const X = ((px + (sx + 0.5) / S) / size) * 100;
          const Y = ((py + (sy + 0.5) / S) / size) * 100;
          if (inGlyph(X, Y)) { r += 255; g += 255; b += 255; a += 255; }
          else if (bgSdf(X, Y) <= 0) {
            const t = Y / 100;
            r += TOP[0] + (BOT[0] - TOP[0]) * t;
            g += TOP[1] + (BOT[1] - TOP[1]) * t;
            b += TOP[2] + (BOT[2] - TOP[2]) * t;
            a += 255;
          }
        }
      }
      const n = S * S;
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f55e0"/>
      <stop offset="1" stop-color="#1e3fb5"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="24" ry="24" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="13.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M37.5 22 L37.5 78"/>
    <path d="M37.5 22 A13 13 0 0 1 37.5 48"/>
    <path d="M40 46 L58 78"/>
  </g>
  <circle cx="67" cy="72" r="6.2" fill="#ffffff"/>
</svg>
`;

for (const size of [16, 48, 128, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), encodePng(size, render(size)));
  console.log(`wrote icon-${size}.png`);
}
writeFileSync(join(outDir, 'icon.svg'), SVG);
console.log('wrote icon.svg');
