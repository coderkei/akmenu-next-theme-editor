// BMP read/write. Theme images must be 16-bit X1R5G5B5: akmenu-next's loader
// (arm9/source/bmp15.cpp) rejects anything that isn't 16bpp with compression 0 or 3.
// Pure black (0x0000) is drawn as transparent by the menu.

export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

/** Encodes RGBA pixels as a bottom-up 16-bit BI_RGB (X1R5G5B5) BMP. */
export function encodeBmp555(img: RgbaImage): Uint8Array {
  const { width, height, data } = img;
  const rowSize = Math.ceil((width * 2) / 4) * 4;
  const pixelBytes = rowSize * height;
  const out = new Uint8Array(54 + pixelBytes);
  const v = new DataView(out.buffer);

  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  v.setUint32(2, out.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true); // positive = bottom-up
  v.setUint16(26, 1, true);
  v.setUint16(28, 16, true);
  v.setUint32(30, 0, true); // BI_RGB; 16bpp BI_RGB is defined as X1R5G5B5
  v.setUint32(34, pixelBytes, true);
  v.setInt32(38, 2835, true);
  v.setInt32(42, 2835, true);

  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Transparent pixels become pure black, which the menu treats as transparent.
      const px =
        data[i + 3] < 128
          ? 0
          : (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3);
      v.setUint16(row + x * 2, px, true);
    }
  }
  return out;
}

/** Decodes uncompressed 16 (555), 24 and 32-bit BMPs, plus 16-bit BI_BITFIELDS. */
export function decodeBmp(bytes: Uint8Array): RgbaImage {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint16(0, true) !== 0x4d42) throw new Error('Not a BMP file');
  const offset = v.getUint32(10, true);
  const width = v.getInt32(18, true);
  const rawHeight = v.getInt32(22, true);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bpp = v.getUint16(28, true);
  const compression = v.getUint32(30, true);
  if (!(compression === 0 || (compression === 3 && bpp === 16))) {
    throw new Error(`Unsupported BMP compression (${compression})`);
  }
  if (![16, 24, 32].includes(bpp)) throw new Error(`Unsupported BMP bit depth (${bpp})`);

  // 16-bit BITFIELDS may be 565; read the masks if present.
  let rMask = 0x7c00, gMask = 0x03e0, bMask = 0x001f;
  if (compression === 3) {
    rMask = v.getUint32(54, true);
    gMask = v.getUint32(58, true);
    bMask = v.getUint32(62, true);
  }
  const chan = (px: number, mask: number) => {
    if (!mask) return 0;
    const shift = Math.log2(mask & -mask);
    const max = mask >>> shift;
    return Math.round((((px & mask) >>> shift) * 255) / max);
  };

  const rowSize = Math.ceil((width * bpp) / 32) * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 16) {
        const px = v.getUint16(row + x * 2, true);
        data[o] = chan(px, rMask);
        data[o + 1] = chan(px, gMask);
        data[o + 2] = chan(px, bMask);
      } else {
        const p = row + x * (bpp / 8);
        data[o] = bytes[p + 2];
        data[o + 1] = bytes[p + 1];
        data[o + 2] = bytes[p];
      }
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Counts opaque pixels that will turn transparent on the DS (they quantise to 0x0000). */
export function countPureBlack(img: RgbaImage): number {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] >= 128 && img.data[i] < 8 && img.data[i + 1] < 8 && img.data[i + 2] < 8) n++;
  }
  return n;
}

/** Nudges near-black opaque pixels up to 0x0421 (#080808) so they stay visible. */
export function replacePureBlack(img: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128 && data[i] < 8 && data[i + 1] < 8 && data[i + 2] < 8) {
      data[i] = data[i + 1] = data[i + 2] = 8;
    }
  }
  return { ...img, data };
}
