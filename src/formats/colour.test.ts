import { describe, expect, it } from 'vitest';
import { cssToDs, dsToCss, dsToHex, parseDsColour, rgbToDs } from './colour';

describe('colour', () => {
  it('packs channels like the docs describe', () => {
    expect(rgbToDs({ r: 255, g: 255, b: 255 })).toBe(0x7fff);
    expect(rgbToDs({ r: 255, g: 0, b: 0 })).toBe(0x001f);
    expect(rgbToDs({ r: 0, g: 255, b: 0 })).toBe(0x03e0);
    expect(rgbToDs({ r: 0, g: 0, b: 255 })).toBe(0x7c00);
  });

  it('round-trips through CSS', () => {
    for (const c of [0, 0x7fff, 0x5e06, 0x2d6b, 0x4210]) expect(cssToDs(dsToCss(c))).toBe(c);
  });

  it('parses hex and decimal INI values, masking bit 15', () => {
    expect(parseDsColour('0x7fff')).toBe(0x7fff);
    expect(parseDsColour('0xFFFF')).toBe(0x7fff);
    expect(parseDsColour('1024')).toBe(1024);
    expect(parseDsColour('nope')).toBeNull();
  });

  it('formats as 0x hex', () => {
    expect(dsToHex(0x1f)).toBe('0x001f');
  });
});
