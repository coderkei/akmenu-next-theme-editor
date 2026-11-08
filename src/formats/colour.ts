// DS 15-bit colours: red + green*32 + blue*1024, each channel 0–31.
// Bit 15 is ignored by the menu, so it's masked off everywhere here.

export type Rgb = { r: number; g: number; b: number };

export function rgbToDs({ r, g, b }: Rgb): number {
  return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
}

/** Expands a 5-bit channel back to 8 bits so white stays white (31 -> 255). */
function expand(c: number): number {
  return (c << 3) | (c >> 2);
}

export function dsToRgb(colour: number): Rgb {
  const c = colour & 0x7fff;
  return { r: expand(c & 31), g: expand((c >> 5) & 31), b: expand((c >> 10) & 31) };
}

/** `0x7fff` style, as written in theme INIs. */
export function dsToHex(colour: number): string {
  return '0x' + (colour & 0x7fff).toString(16).padStart(4, '0');
}

/**
 * Parses an INI colour value. Mirrors CIniFile::GetInt in akmenu-next
 * (arm9/source/inifile.cpp): "0x" prefix means hex, otherwise decimal.
 */
export function parseDsColour(value: string): number | null {
  const v = value.trim();
  const n = /^0x/i.test(v) ? parseInt(v.slice(2), 16) : parseInt(v, 10);
  return Number.isNaN(n) ? null : n & 0x7fff;
}

export function dsToCss(colour: number): string {
  const { r, g, b } = dsToRgb(colour);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function cssToDs(css: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
  if (!m) throw new Error(`Not a #rrggbb colour: ${css}`);
  return rgbToDs({ r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) });
}
