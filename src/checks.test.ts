import { readFileSync } from 'node:fs';
import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkTheme } from './checks';
import { encodeBmp555 } from './formats/bmp';
import { customPicturePath, exportThemeZip, importThemeZip, syncCustomPicturePath } from './theme';
import { unzipSync, strFromU8 } from 'fflate';

const starlight = () => importThemeZip(new Uint8Array(readFileSync('public/themes/Starlight.zip')));

describe('checks before export', () => {
  it('finds nothing wrong with Starlight', () => {
    expect(checkTheme(starlight(), 'next')).toEqual([]);
  });

  it('flags what makes the menu refuse a theme, and what just won’t show', () => {
    const t = starlight();
    t.files.delete('lower_screen.bmp');
    t.files.set('brightness.bmp', encodeBmp555({ width: 300, height: 10, data: new Uint8ClampedArray(300 * 10 * 4).fill(255) }));
    t.files.set('gbaframe.bmp', strToU8('not a bmp'));
    const issues = checkTheme(t, 'next');
    expect(issues.filter((i) => i.level === 'problem').map((i) => i.message)).toEqual([
      expect.stringContaining('lower_screen.bmp) is missing'),
      expect.stringContaining('brightness.bmp) is 300×10; the menu allows up to 256×192'),
    ]);
    expect(issues.filter((i) => i.level === 'warning').map((i) => i.message)).toEqual([expect.stringContaining('gbaframe.bmp) won’t load')]);
  });

  it('only checks AKMenu-Next extras for AKMenu-Next themes', () => {
    const t = starlight();
    t.files.set('bgm1.wav', strToU8('nope'));
    expect(checkTheme(t, 'next').map((i) => i.message)).toEqual([expect.stringContaining('bgm1.wav won’t play')]);
    expect(checkTheme(t, 'classic')).toEqual([]);
  });
});

describe('the custom picture path', () => {
  it('follows the theme’s folder name, in the editor and in the export', () => {
    const t = starlight();
    t.files.set('custom_picture.bmp', new Uint8Array([1]));
    t.custom.set('custom picture', 'file', customPicturePath('Starlight'));
    t.name = 'My: Theme';
    const zip = unzipSync(exportThemeZip(t, 'next').zip);
    expect(strFromU8(zip['My_ Theme/custom.ini'])).toContain('file = /_nds/akmenunext/ui/My_ Theme/custom_picture.bmp');
    expect(syncCustomPicturePath(t)).toBe(true);
    expect(t.custom.get('custom picture', 'file')).toBe('/_nds/akmenunext/ui/My_ Theme/custom_picture.bmp');
    expect(syncCustomPicturePath(t)).toBe(false);
  });
});
