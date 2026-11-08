// Reads X11 PCF bitmap fonts, the format the menu uses (arm9/source/font/font_pcf.cpp).
// This lets the preview use the menu's own font, picked from the user's SD card
// (_nds/akmenunext/fonts/liberation.pcf); the file never leaves their browser.

import type { Glyph, PreviewFont } from './font';

const PCF_ACCELERATORS = 1 << 1;
const PCF_METRICS = 1 << 2;
const PCF_BITMAPS = 1 << 3;
const PCF_BDF_ENCODINGS = 1 << 5;
const PCF_BDF_ACCELERATORS = 1 << 8;
const PCF_COMPRESSED_METRICS = 0x100;
const PCF_BYTE_MASK = 1 << 2; // set: most significant byte first
const PCF_BIT_MASK = 1 << 3; // set: most significant bit first

interface Metric {
  left: number;
  right: number;
  width: number;
  ascent: number;
  descent: number;
}

export function parsePcf(bytes: Uint8Array): PreviewFont {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || v.getUint32(0, false) !== 0x01666370) throw new Error('This isn’t a PCF font file.');
  const count = v.getUint32(4, true);
  const tables = new Map<number, { format: number; offset: number }>();
  for (let i = 0; i < count; i++) {
    const at = 8 + i * 16;
    tables.set(v.getUint32(at, true), { format: v.getUint32(at + 4, true), offset: v.getUint32(at + 12, true) });
  }
  const table = (type: number) => {
    const t = tables.get(type);
    if (!t) return null;
    const format = v.getUint32(t.offset, true);
    const le = !(format & PCF_BYTE_MASK);
    return { format, le, at: t.offset + 4 };
  };

  const accel = table(PCF_BDF_ACCELERATORS) ?? table(PCF_ACCELERATORS);
  const metrics = table(PCF_METRICS);
  const bitmaps = table(PCF_BITMAPS);
  const encodings = table(PCF_BDF_ENCODINGS);
  if (!accel || !metrics || !bitmaps || !encodings) throw new Error('This PCF font is missing tables the menu needs.');

  const ascent = v.getInt32(accel.at + 8, accel.le);

  const glyphMetrics: Metric[] = [];
  if (metrics.format & PCF_COMPRESSED_METRICS) {
    const n = v.getUint16(metrics.at, metrics.le);
    for (let i = 0; i < n; i++) {
      const b = (k: number) => bytes[metrics.at + 2 + i * 5 + k] - 0x80;
      glyphMetrics.push({ left: b(0), right: b(1), width: b(2), ascent: b(3), descent: b(4) });
    }
  } else {
    const n = v.getUint32(metrics.at, metrics.le);
    for (let i = 0; i < n; i++) {
      const s = (k: number) => v.getInt16(metrics.at + 4 + i * 12 + k * 2, metrics.le);
      glyphMetrics.push({ left: s(0), right: s(1), width: s(2), ascent: s(3), descent: s(4) });
    }
  }

  const glyphCount = v.getUint32(bitmaps.at, bitmaps.le);
  const offsets = (i: number) => v.getUint32(bitmaps.at + 4 + i * 4, bitmaps.le);
  const data = bitmaps.at + 4 + glyphCount * 4 + 16;
  const pad = 1 << (bitmaps.format & 3);
  const msbBit = !!(bitmaps.format & PCF_BIT_MASK);

  const e = encodings;
  const s16 = (k: number) => v.getInt16(e.at + k * 2, e.le);
  const [min2, max2, min1, max1] = [s16(0), s16(1), s16(2), s16(3)];
  const perRow = max2 - min2 + 1;
  const indexFor = (code: number): number => {
    const b1 = code >> 8, b2 = code & 0xff;
    if (b1 < min1 || b1 > max1 || b2 < min2 || b2 > max2) return -1;
    const idx = v.getUint16(e.at + 10 + ((b1 - min1) * perRow + (b2 - min2)) * 2, e.le);
    return idx === 0xffff ? -1 : idx;
  };

  const cache = new Map<number, Glyph | null>();
  return {
    ascent,
    glyph(code) {
      if (cache.has(code)) return cache.get(code)!;
      const i = code > 0xffff ? -1 : indexFor(code);
      let g: Glyph | null = null;
      if (i >= 0 && i < glyphMetrics.length && i < glyphCount) {
        const m = glyphMetrics[i];
        const width = Math.max(0, m.right - m.left);
        const height = Math.max(0, m.ascent + m.descent);
        const rowBytes = Math.ceil(Math.ceil(width / 8) / pad) * pad;
        const bits = new Uint8Array(width * height);
        const start = data + offsets(i);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const byte = bytes[start + y * rowBytes + (x >> 3)];
            const bit = msbBit ? 7 - (x & 7) : x & 7;
            bits[y * width + x] = (byte >> bit) & 1;
          }
        }
        g = { advance: m.width, left: m.left, ascent: m.ascent, width, height, bits };
      }
      cache.set(code, g);
      return g;
    },
  };
}
