import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportThemeZip, importThemeZip } from './theme';

const ui = '[global settings]\r\nformBodyColor = 0x5e06\r\n\r\n[cover]\r\nx = 140\r\n';

function sampleZip(prefix: string) {
  return zipSync({
    [`${prefix}uisettings.ini`]: strToU8(ui),
    [`${prefix}custom.ini`]: strToU8('[date]\r\nshow = 1\r\n'),
    [`${prefix}upper_screen.bmp`]: new Uint8Array([1, 2, 3]),
    [`${prefix}bgm.bcstm`]: new Uint8Array([4]),
  });
}

describe('theme zip', () => {
  it('finds the theme inside a double-nested folder', () => {
    const t = importThemeZip(sampleZip('Miku/Miku/'));
    expect(t.name).toBe('Miku');
    expect(t.files.has('upper_screen.bmp')).toBe(true);
  });

  it('exports AKMenu-Next themes unchanged in one folder', () => {
    const t = importThemeZip(sampleZip('Miku/'));
    const { zip, dropped } = exportThemeZip(t, 'next');
    const out = unzipSync(zip);
    expect(dropped).toEqual([]);
    expect(strFromU8(out['Miku/uisettings.ini'])).toBe(ui);
    expect([...out['Miku/upper_screen.bmp']]).toEqual([1, 2, 3]);
  });

  it('drops AKMenu-Next-only bits from classic exports and says so', () => {
    const t = importThemeZip(sampleZip('Miku/'));
    const { zip, dropped } = exportThemeZip(t, 'classic');
    const out = unzipSync(zip);
    expect(strFromU8(out['Miku/uisettings.ini'])).not.toContain('[cover]');
    expect(out['Miku/custom.ini']).toBeUndefined();
    expect(out['Miku/bgm.bcstm']).toBeUndefined();
    expect(dropped).toEqual(['[cover] in uisettings.ini', 'custom.ini', 'bgm.bcstm']);
  });
});
