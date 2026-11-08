// A 256×192 DS framebuffer with the drawing calls the menu uses (arm9/source/gdi.cpp).
// Pixels are DS colours; bit 15 set means opaque. Writes use the same linear
// addressing as the menu (y * 256 + x), so things drawn past the right edge wrap
// onto the next row as they do on the DS; anything outside the buffer is dropped.

import type { MenuBitmap } from './menubmp';

export const SCREEN_W = 256;
export const SCREEN_H = 192;
const SIZE = SCREEN_W * SCREEN_H;
const OPAQUE = 0x8000;

export class Surface {
  readonly pixels = new Uint16Array(SIZE);

  constructor(fill = 0) {
    this.pixels.fill(fill);
  }

  private put(index: number, colour: number) {
    if (index >= 0 && index < SIZE) this.pixels[index] = colour;
  }

  pixel(x: number, y: number, colour: number) {
    this.put(y * SCREEN_W + x, colour | OPAQUE);
  }

  /** gdi fillRect: alternates colour1/colour2 pixel by pixel along each row. */
  fillRect(colour1: number, colour2: number, x: number, y: number, w: number, h: number) {
    const c = [colour1 | OPAQUE, colour2 | OPAQUE];
    for (let i = 0; i < h; i++) {
      const row = (y + i) * SCREEN_W + x;
      for (let j = 0; j < w; j++) this.put(row + j, c[j & 1]);
    }
  }

  /**
   * gdi fillRectBlend: mixes the colours over `source` (the background bitmap on the
   * bottom screen, or this surface itself on the top screen) at 0–100% opacity.
   */
  fillRectBlend(colour1: number, colour2: number, x: number, y: number, w: number, h: number, opacity: number, source: Uint16Array = this.pixels) {
    if (opacity === 0) return;
    if (opacity === 100) return this.fillRect(colour1, colour2, x, y, w, h);
    const alpha = Math.trunc((opacity * 32) / 100);
    for (let i = 0; i < h; i++) {
      const row = (y + i) * SCREEN_W + x;
      for (let j = 0; j < w; j++) {
        const idx = row + j;
        if (idx < 0 || idx >= SIZE) continue;
        const original = source[idx] & 0x7fff;
        const colour = j & 1 ? colour2 : colour1;
        const rb = ((colour & 0x7c1f) * alpha + (original & 0x7c1f) * (32 - alpha)) & 0xf83e0;
        const g = ((colour & 0x3e0) * alpha + (original & 0x3e0) * (32 - alpha)) & 0x7c00;
        this.pixels[idx] = ((rb | g) >> 5) | OPAQUE;
      }
    }
  }

  /** gdi drawLine: the end point is left out, as in the menu. */
  drawLine(colour: number, x1: number, y1: number, x2: number, y2: number) {
    if (x1 === x2 && y1 === y2) return;
    if (x1 === x2) {
      const [ys, ye] = y1 < y2 ? [y1, y2 - 1] : [y2 + 1, y1];
      for (let p = ys; p <= ye; p++) this.pixel(x1, p, colour);
      return;
    }
    if (y1 === y2) {
      const [xs, xe] = x1 < x2 ? [x1, x2 - 1] : [x2 + 1, x1];
      this.fillRect(colour, colour, xs, y1, xe - xs + 1, 1);
      return;
    }
    // Float stepping along the longer axis, truncating like the menu's (int) casts.
    if (Math.abs(x2 - x1) > Math.abs(y2 - y1)) {
      const xe = x2 - x1;
      const xv = xe > 0 ? 1 : -1;
      const yv = Math.fround((y2 - y1) / Math.abs(xe));
      let py = 0;
      for (let px = 0; px !== xe; px += xv, py = Math.fround(py + yv)) this.pixel(x1 + px, y1 + Math.trunc(py), colour);
    } else {
      const ye = y2 - y1;
      const yv = ye > 0 ? 1 : -1;
      const xv = Math.fround((x2 - x1) / Math.abs(ye));
      let px = 0;
      for (let py = 0; py !== ye; py += yv, px = Math.fround(px + xv)) this.pixel(x1 + Math.trunc(px), y1 + py, colour);
    }
  }

  frameRect(colour: number, x: number, y: number, w: number, h: number, thickness = 1) {
    for (let i = 0; i < thickness; i++) {
      // gdi drawLine leaves out each line's end point; the four lines meet anyway.
      this.fillRect(colour, colour, x, y, w - 1, 1);
      for (let p = y; p < y + h - 1; p++) this.pixel(x + w - 1, p, colour);
      this.fillRect(colour, colour, x + 1, y + h - 1, w - 1, 1);
      for (let p = y + 1; p < y + h; p++) this.pixel(x, p, colour);
      if (h <= 2 || w <= 2) break;
      x++;
      y++;
      w -= 2;
      h -= 2;
    }
  }

  /**
   * gdi bitBlt (5 args): copies every pixel, transparent ones included. Like the
   * menu, it walks the bitmap as rows of w (rounded up to even), whatever its real size.
   */
  bitBlt(bmp: MenuBitmap, x: number, y: number, w = bmp.width, h = bmp.height) {
    const pitch = w + (w & 1);
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < pitch; j++) this.put((y + i) * SCREEN_W + x + j, bmp.pixels[i * pitch + j] ?? 0);
    }
  }

  /**
   * gdi maskBlt (5 args): copies opaque pixels only, as rows of w rounded up to
   * even, starting `offset` pixels into the bitmap.
   */
  maskBlt(bmp: MenuBitmap, x: number, y: number, w: number, h: number, offset = 0) {
    const pitch = w + (w & 1);
    this.maskRows(bmp, offset, pitch, x, y, pitch, h);
  }

  /** gdi maskBlt (8 args): a w×h window of a bitmap whose rows are srcW long. */
  maskBltFrom(bmp: MenuBitmap, offset: number, srcW: number, srcH: number, x: number, y: number, w: number, h: number) {
    if (w <= 0) return;
    this.maskRows(bmp, offset, srcW, x, y, Math.min(w, srcW), Math.min(h, srcH));
  }

  private maskRows(bmp: MenuBitmap, offset: number, stride: number, x: number, y: number, w: number, h: number) {
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const px = bmp.pixels[offset + i * stride + j];
        if (px & OPAQUE) this.put((y + i) * SCREEN_W + x + j, px);
      }
    }
  }

  /** gdi blendBlt: opaque source pixels mixed over what's there at 0–100% opacity. */
  blendBlt(bmp: MenuBitmap, offset: number, srcW: number, x: number, y: number, w: number, h: number, opacity: number) {
    if (!w || !h || !opacity) return;
    const inv = 100 - opacity;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const src = bmp.pixels[offset + i * srcW + j];
        const idx = (y + i) * SCREEN_W + x + j;
        if (!(src & OPAQUE) || idx < 0 || idx >= SIZE) continue;
        const dst = this.pixels[idx];
        const mix = (shift: number) =>
          Math.trunc((((src >> shift) & 31) * opacity + ((dst >> shift) & 31) * inv + 50) / 100) & 31;
        this.pixels[idx] = mix(0) | (mix(5) << 5) | (mix(10) << 10) | OPAQUE;
      }
    }
  }

  /** Paints opaque pixels of `layer` over this surface. */
  overlay(layer: Surface) {
    for (let i = 0; i < SIZE; i++) if (layer.pixels[i] & OPAQUE) this.pixels[i] = layer.pixels[i];
  }

  /** RGBA for a canvas. Transparent pixels show `backdrop`. */
  toRgba(backdrop = 0): Uint8ClampedArray<ArrayBuffer> {
    const out = new Uint8ClampedArray(SIZE * 4);
    const expand = (c: number) => (c << 3) | (c >> 2);
    for (let i = 0; i < SIZE; i++) {
      const px = this.pixels[i] & OPAQUE ? this.pixels[i] : backdrop;
      out[i * 4] = expand(px & 31);
      out[i * 4 + 1] = expand((px >> 5) & 31);
      out[i * 4 + 2] = expand((px >> 10) & 31);
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}
