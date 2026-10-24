/**
 * Generates src/app/favicon.ico — a teal rounded square with a white "H".
 * Zero dependencies: hand-rolled PNG encoder (Node zlib) wrapped in an ICO
 * container. Re-run with:  node scripts/make-favicon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
    raw[y * stride] = 0; // filter: none
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TEAL = [13, 148, 136, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/** Rounded-square SDF mask. */
function insideRounded(x, y, S, r) {
  const fx = x + 0.5, fy = y + 0.5;
  const cx = Math.min(Math.max(fx, r), S - r);
  const cy = Math.min(Math.max(fy, r), S - r);
  return (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r;
}

/** White "H" glyph from three bars, scaled to the canvas. */
function insideH(x, y, S) {
  const u = S / 64; // scale factor from the 64px design
  const bar = (x0, x1, y0, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u;
  return bar(17, 24, 15, 49) || bar(40, 47, 15, 49) || bar(24, 40, 28, 36);
}

function render(S) {
  const px = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const bg = insideRounded(x, y, S, Math.round(S * 0.22));
      if (!bg) {
        px.set(CLEAR, i);
        continue;
      }
      px.set(insideH(x, y, S) ? WHITE : TEAL, i);
    }
  }
  return px;
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const e = entries.subarray(i * 16, (i + 1) * 16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.data)]);
}

const images = [16, 32, 48, 64].map((size) => ({ size, data: encodePng(size, render(size)) }));
writeFileSync('src/app/favicon.ico', buildIco(images));
console.log('src/app/favicon.ico written (' + images.map((i) => `${i.size}px`).join(', ') + ')');
