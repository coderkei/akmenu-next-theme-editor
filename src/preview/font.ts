// Text drawing as the menu does it (arm9/source/font/font_pcf.cpp, font/font.cpp and
// gdi.cpp textOutRect). The preview uses the menu's own font, public/fonts/liberation.pcf.

import type { Surface } from './surface';

/** gs().fontHeight default (globalsettings.cpp); also SYSTEM_FONT_HEIGHT in gdi.h. */
export const FONT_HEIGHT = 12;

export interface Glyph {
  /** Pen advance in pixels. */
  advance: number;
  /** Bitmap offset from the pen position. */
  left: number;
  /** Rows above the baseline. */
  ascent: number;
  width: number;
  height: number;
  /** width × height, 1 = ink. */
  bits: Uint8Array;
}

export interface PreviewFont {
  /** Baseline offset from the top of a line (liberation.pcf: 9). */
  ascent: number;
  glyph(code: number): Glyph | null;
}

// Codes 1–7 draw the menu's built-in 9×9 button symbols (A, B, X, Y, L, R, D-pad).
const SPECIAL = [
  0x7c, 0, 0xfe, 0, 0xef, 1, 0xd7, 1, 0xd7, 1, 0x83, 1, 0xbb, 1, 0xfe, 0, 0x7c, 0,
  0x7c, 0, 0xfe, 0, 0xc3, 1, 0xbb, 1, 0xc3, 1, 0xbb, 1, 0xc3, 1, 0xfe, 0, 0x7c, 0,
  0x7c, 0, 0xfe, 0, 0xbb, 1, 0xd7, 1, 0xef, 1, 0xd7, 1, 0xbb, 1, 0xfe, 0, 0x7c, 0,
  0x7c, 0, 0xfe, 0, 0xbb, 1, 0xd7, 1, 0xef, 1, 0xef, 1, 0xef, 1, 0xfe, 0, 0x7c, 0,
  0xf8, 1, 0xfc, 1, 0xf6, 1, 0xf7, 1, 0xf7, 1, 0xf7, 1, 0x87, 1, 0xff, 1, 0xff, 1,
  0x3f, 0, 0x7f, 0, 0xc3, 0, 0xbb, 1, 0xc3, 1, 0xdb, 1, 0xbb, 1, 0xff, 1, 0xff, 1,
  0x38, 0, 0x38, 0, 0x38, 0, 0xff, 1, 0xef, 1, 0xff, 1, 0x38, 0, 0x38, 0, 0x38, 0,
];

function lookup(font: PreviewFont, code: number): Glyph | null {
  // cFontPcf::Search falls back to '?' for anything printable it can't find.
  return font.glyph(code) ?? (code > 32 ? font.glyph(63) : null);
}

/** cFontPcf::Info: how far the pen moves for this character. */
export function charWidth(font: PreviewFont, code: number): number {
  const g = lookup(font, code);
  if (g) return g.advance;
  return code > 0 && code < 8 ? 10 : 0;
}

export function stringWidth(font: PreviewFont, text: string): number {
  let w = 0;
  for (const ch of text) w += charWidth(font, ch.codePointAt(0)!);
  return w;
}

function drawChar(s: Surface, font: PreviewFont, x: number, y: number, code: number, colour: number) {
  const g = lookup(font, code);
  if (g) {
    const gx = x + g.left;
    const gy = y + font.ascent - g.ascent;
    for (let r = 0; r < g.height; r++) {
      for (let c = 0; c < g.width; c++) if (g.bits[r * g.width + c]) s.pixel(gx + c, gy + r, colour);
    }
  } else if (code > 0 && code < 8) {
    const base = (code - 1) * 18;
    const gy = y - 9 + font.ascent;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (SPECIAL[base + r * 2 + (c >> 3)] & (1 << (c & 7))) s.pixel(x + c, gy + r, colour);
      }
    }
  }
}

/**
 * gdi textOutRect: draws text from (x, y). A character is only drawn if it ends
 * inside the width; '\n' starts a new line and stops once lines run past h.
 */
export function textOutRect(s: Surface, font: PreviewFont, x: number, y: number, w: number, h: number, text: string, colour: number) {
  const originX = x;
  const limitY = y + h - FONT_HEIGHT;
  for (const ch of text) {
    if (ch === '\r' || ch === '\n') {
      y += FONT_HEIGHT;
      x = originX;
      if (y > limitY) break;
      continue;
    }
    const code = ch.codePointAt(0)!;
    const ww = charWidth(font, code);
    if (x + ww < originX + w) drawChar(s, font, x, y, code, colour);
    x += ww;
  }
}

/** gdi textOut: textOutRect with the whole screen as the box. */
export function textOut(s: Surface, font: PreviewFont, x: number, y: number, text: string, colour: number) {
  textOutRect(s, font, x, y, 256, 192, text, colour);
}

/** cFont::breakLine: word-wraps to maxWidth and always ends with '\n'. */
export function breakLine(font: PreviewFont, text: string, maxWidth: number): string {
  const chars = [...text];
  const out: string[] = [];
  let hasSpace = false;
  let width = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ') hasSpace = true;
    width += charWidth(font, ch.codePointAt(0)!);
    if (width > maxWidth) {
      if (hasSpace) {
        const last = out.lastIndexOf(' ');
        out[last] = '\n';
        width = stringWidth(font, chars.slice(last, i).join(''));
        hasSpace = false;
      } else {
        out.push('\n');
        width = 0;
      }
    }
    out.push(ch);
  });
  if (out[out.length - 1] !== '\n') out.push('\n');
  return out.join('');
}
