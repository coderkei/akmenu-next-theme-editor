// Loads theme bitmaps the way the menu does (arm9/source/bmp15.cpp createBMP15FromFile),
// so the preview shows exactly what the DS would: same accepted files, same transparency.
//
// - Only 16 bpp, compression 0 (BI_RGB) or 3 (BI_BITFIELDS), one plane, bottom-up.
//   Masks are ignored, so every 16-bit file is read as X1R5G5B5.
// - Width 1–1024, pixel data must fit in the file and in 2 MB.
// - Rows are read with a pitch of the width rounded up to even, in pixels.
// - A pixel whose 15 colour bits are all zero is transparent (bit 15 clear).

export interface MenuBitmap {
  width: number;
  height: number;
  /** Row length in pixels: width rounded up to even. */
  pitch: number;
  /** DS colours (red in the low bits), bit 15 set on opaque pixels. pitch × height. */
  pixels: Uint16Array;
}

export type MenuBitmapResult = { ok: true; bitmap: MenuBitmap } | { ok: false; reason: string };

export function loadMenuBitmap(bytes: Uint8Array): MenuBitmapResult {
  const fail = (reason: string): MenuBitmapResult => ({ ok: false, reason });
  if (bytes.length < 54) return fail('it’s too small to be a BMP');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint16(0, true) !== 0x4d42) return fail('it isn’t a BMP file');
  const width = v.getUint32(0x12, true);
  const height = v.getUint32(0x16, true);
  if (v.getUint16(0x1a, true) !== 1) return fail('its header is invalid');
  const bpp = v.getUint16(0x1c, true);
  if (bpp !== 16) return fail(`it’s ${bpp}-bit, but the menu only loads 16-bit (X1R5G5B5) BMPs`);
  const compression = v.getUint32(0x1e, true);
  if (compression !== 0 && compression !== 3) return fail('it’s compressed');
  const offset = v.getUint32(0x0a, true);
  // Height is read unsigned, so top-down files (negative height) are rejected here.
  if (width === 0 || height === 0 || width > 1024 || height > 0x7fffffff || offset < 54 || offset > bytes.length) {
    return fail(height > 0x7fffffff ? 'it’s stored top-down; the menu needs bottom-up BMPs' : 'its size is invalid');
  }
  const pitch = width + (width & 1);
  const bitmapSize = pitch * 2 * height;
  if (bitmapSize > 1024 * 1024 * 2 || bitmapSize > bytes.length - offset) return fail('its pixel data is missing or too big');

  const pixels = new Uint16Array(pitch * height);
  for (let y = 0; y < height; y++) {
    const row = offset + (height - 1 - y) * pitch * 2;
    for (let x = 0; x < pitch; x++) {
      const px = v.getUint16(row + x * 2, true);
      const ds = ((px & 0x7c00) >> 10) | (px & 0x03e0) | ((px & 0x1f) << 10);
      pixels[y * pitch + x] = ds ? ds | 0x8000 : 0;
    }
  }
  return { ok: true, bitmap: { width, height, pitch, pixels } };
}
