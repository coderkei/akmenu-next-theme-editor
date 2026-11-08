import { describe, expect, it } from 'vitest';
import { countPureBlack, decodeBmp, encodeBmp555, replacePureBlack, type RgbaImage } from './bmp';

function image(width: number, height: number, fill: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}

describe('bmp', () => {
  it('writes a 16bpp BI_RGB header the menu accepts', () => {
    const bmp = encodeBmp555(image(256, 192, [255, 255, 255, 255]));
    const v = new DataView(bmp.buffer);
    expect(v.getUint16(28, true)).toBe(16);
    expect(v.getUint32(30, true)).toBe(0);
    expect(bmp.length).toBe(54 + 256 * 2 * 192);
    expect(v.getUint16(54, true)).toBe(0x7fff);
  });

  it('pads odd-width rows to 4 bytes and round-trips', () => {
    const img = image(3, 2, [248, 128, 8, 255]);
    img.data.set([0, 0, 248, 255], 0); // top-left pixel blue
    const out = decodeBmp(encodeBmp555(img));
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect([...out.data.slice(0, 3)]).toEqual([0, 0, 255]);
    expect(out.data[4]).toBeGreaterThan(240);
  });

  it('turns transparent pixels into pure black', () => {
    const bmp = encodeBmp555(image(1, 1, [255, 255, 255, 0]));
    expect(new DataView(bmp.buffer).getUint16(54, true)).toBe(0);
  });

  it('finds and replaces pixels that would become transparent', () => {
    const img = image(2, 2, [4, 0, 7, 255]);
    expect(countPureBlack(img)).toBe(4);
    expect(countPureBlack(replacePureBlack(img))).toBe(0);
  });
});
