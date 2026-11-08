// File list icons: the icon part of an NDS banner (0x840 bytes). The menu reads the
// 32×32 4-bit tiled icon at 0x20 and its 16-colour palette at 0x220
// (arm9/source/dsrom.cpp DSRomInfo::drawDSRomIcon); palette entry 0 is see-through.

import type { RgbaImage } from './bmp';

export const BANNER_BYTES = 0x840;
const ICON = 0x20;
const PALETTE = 0x220;

const expand = (c: number) => (c << 3) | (c >> 2);

/** The 32×32 icon from a banner, palette index 0 as transparent. */
export function decodeBannerIcon(banner: Uint8Array): RgbaImage {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  const colour = (i: number) => banner[PALETTE + i * 2] | (banner[PALETTE + i * 2 + 1] << 8);
  for (let tile = 0; tile < 16; tile++) {
    for (let p = 0; p < 32; p++) {
      const byte = banner[ICON + tile * 32 + p];
      const x = (tile & 3) * 8 + ((p * 2) & 7);
      const y = (tile >> 2) * 8 + (p >> 2);
      [byte & 0x0f, byte >> 4].forEach((index, half) => {
        if (!index) return;
        const c = colour(index);
        data.set([expand(c & 31), expand((c >> 5) & 31), expand((c >> 10) & 31), 255], (y * 32 + x + half) * 4);
      });
    }
  }
  return { width: 32, height: 32, data };
}

/** CRC-16/MODBUS, which is what the DS BIOS swiCRC16 computes with 0xFFFF. */
function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

type Colour = [number, number, number];

/** Median cut down to at most `count` colours (5-bit channels). */
function quantise(all: Colour[], count: number): Colour[] {
  // Few enough colours already (like any real DS icon): keep them exactly.
  const distinct = [...new Map(all.map((c) => [c.join(), c])).values()];
  if (distinct.length <= count) return distinct;
  // Otherwise cut on the distinct colours, so a big patch of one colour can't take
  // up several palette entries.
  const boxes: Colour[][] = [distinct];
  while (boxes.length < count) {
    // Split the box with the widest channel range.
    let best = -1, bestRange = 0, bestChannel = 0;
    boxes.forEach((box, i) => {
      for (let c = 0; c < 3; c++) {
        let lo = 31, hi = 0;
        for (const col of box) {
          lo = Math.min(lo, col[c]);
          hi = Math.max(hi, col[c]);
        }
        if (hi - lo > bestRange) [best, bestRange, bestChannel] = [i, hi - lo, c];
      }
    });
    if (best < 0) break; // every box is a single colour
    const box = boxes[best].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    const sum = box.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]);
    return sum.map((v) => Math.round(v / box.length)) as Colour;
  });
}

/**
 * Turns a 32×32 picture into a banner the menu can use as an icon: up to 15 colours
 * plus see-through (pixels under half opacity).
 */
export function encodeBannerIcon(img: RgbaImage): Uint8Array {
  if (img.width !== 32 || img.height !== 32) throw new Error('icons are 32×32');
  const pixels: (Colour | null)[] = [];
  for (let i = 0; i < 32 * 32; i++) {
    const o = i * 4;
    pixels.push(img.data[o + 3] < 128 ? null : [img.data[o] >> 3, img.data[o + 1] >> 3, img.data[o + 2] >> 3]);
  }
  const palette = quantise(pixels.filter((p): p is Colour => !!p), 15);
  const nearest = (c: Colour) => {
    let best = 0, dist = Infinity;
    palette.forEach((p, i) => {
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < dist) [best, dist] = [i, d];
    });
    return best + 1; // 0 is see-through
  };

  const out = new Uint8Array(BANNER_BYTES);
  const v = new DataView(out.buffer);
  v.setUint16(0, 1, true); // banner version 1
  for (let tile = 0; tile < 16; tile++) {
    for (let p = 0; p < 32; p++) {
      const x = (tile & 3) * 8 + ((p * 2) & 7);
      const y = (tile >> 2) * 8 + (p >> 2);
      const left = pixels[y * 32 + x];
      const right = pixels[y * 32 + x + 1];
      out[ICON + tile * 32 + p] = (left ? nearest(left) : 0) | ((right ? nearest(right) : 0) << 4);
    }
  }
  palette.forEach(([r, g, b], i) => v.setUint16(PALETTE + (i + 1) * 2, r | (g << 5) | (b << 10), true));
  v.setUint16(2, crc16(out.subarray(0x20, BANNER_BYTES)), true);
  return out;
}
