import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANNER_BYTES, decodeBannerIcon, encodeBannerIcon } from './banner';

describe('file list icons', () => {
  it('re-encodes the menu’s own icons without changing a pixel', () => {
    for (const name of ['microsd_banner', 'folder_banner', 'gbarom_banner']) {
      const stock = new Uint8Array(readFileSync(`public/icons/${name}.bin`));
      const img = decodeBannerIcon(stock);
      const again = encodeBannerIcon(img);
      expect(again.length).toBe(BANNER_BYTES);
      expect(decodeBannerIcon(again).data).toEqual(img.data);
    }
  });

  it('keeps see-through pixels and squeezes many colours into 15', () => {
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) {
      const x = i % 32, y = Math.floor(i / 32);
      // A gradient with far more than 15 colours, and a see-through top row.
      data.set([x * 8, y * 8, 128, y === 0 ? 0 : 255], i * 4);
    }
    const out = decodeBannerIcon(encodeBannerIcon({ width: 32, height: 32, data }));
    expect(out.data[3]).toBe(0);
    expect(out.data[32 * 4 + 3]).toBe(255);
    const colours = new Set<string>();
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) colours.add(out.data.slice(i, i + 3).join());
    expect(colours.size).toBeLessThanOrEqual(15);
    expect(colours.size).toBeGreaterThan(8);
  });
});
