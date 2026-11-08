import { describe, expect, it } from 'vitest';
import { encodeBmp555 } from '../formats/bmp';
import { IniDocument } from '../formats/ini';
import { newTheme } from '../theme';
import type { PreviewFont } from './font';
import { renderTheme } from './menu';
import { elementAt, sameElement, savePosition, sectionLabel, setPosition, setSize } from './move';
import { newMenuState } from './navigator';

const font: PreviewFont = {
  ascent: 9,
  glyph: (code) => (code < 32 ? null : { advance: 5, left: 0, ascent: 6, width: 4, height: 6, bits: new Uint8Array(24).fill(1) }),
};

function solidBmp(width: number, height: number) {
  return encodeBmp555({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(200) });
}

function themeWith(ui: string, custom = '') {
  const t = newTheme('Test');
  t.uisettings = IniDocument.parse(ui);
  t.custom = IniDocument.parse(custom);
  t.files.set('calendar/clock_numbers.bmp', solidBmp(10, 200)); // 10×20 digits
  t.files.set('brightness.bmp', solidBmp(16, 16));
  return t;
}

const opts = { cardActivity: false, userName: 'Player', now: new Date(2026, 10, 8, 12, 29) };

describe('movable elements', () => {
  it('records where each element is drawn', () => {
    const t = themeWith('[big clock]\r\nx = 20\r\ny = 30\r\nshow = 1\r\n[brightness btn]\r\nx = 200\r\ny = 2\r\n', '[user name]\r\nx = 5\r\ny = 150\r\nshow = 1\r\n');
    const { elements } = renderTheme(t, 'next', font, newMenuState(), opts);
    // Clock: four 10-px digits, 2 px apart, with the minutes pulled 8 px left.
    expect(sameElement(elements, { file: 'uisettings.ini', section: 'big clock' })).toMatchObject({ screen: 'top', x: 20, y: 30, w: 4 * 12 - 8 + 10, h: 20 });
    expect(sameElement(elements, { file: 'uisettings.ini', section: 'brightness btn' })).toMatchObject({ screen: 'bottom', x: 200, y: 2, w: 16, h: 16 });
    expect(sameElement(elements, { file: 'custom.ini', section: 'user name' })).toMatchObject({ x: 5, y: 150, w: 30, h: 12 });
    expect(elementAt(elements, 'top', 25, 35)?.section).toBe('big clock');
    expect(elementAt(elements, 'bottom', 25, 35)).toBeUndefined();
  });

  it('only offers bottom-screen elements while the main window is in front', () => {
    const t = themeWith('[brightness btn]\r\nx = 200\r\ny = 2\r\n');
    const s = newMenuState();
    s.windows.push({ kind: 'text', which: 'help', firstLine: 0, lineCount: 0, visible: 0 });
    const { elements } = renderTheme(t, 'next', font, s, opts);
    expect(elements.filter((e) => e.screen === 'bottom')).toEqual([]);
  });
});

describe('resizing', () => {
  it('offers a size only where width and height decide what’s drawn', () => {
    const t = themeWith(
      '[folder text]\r\nx = 20\r\ny = 2\r\nw = 100\r\nh = 16\r\n[calendar day]\r\nx = 100\r\ny = 40\r\ndw = 16\r\ndh = 14\r\nshow = 1\r\n',
    );
    const { elements } = renderTheme(t, 'next', font, newMenuState(), opts);
    const folder = sameElement(elements, { file: 'uisettings.ini', section: 'folder text' })!;
    expect(folder.size).toEqual({ wKey: 'w', hKey: 'h', w: 100, h: 16, perW: 1, perH: 1 });
    // November 2026 starts on a Sunday: 5 rows of 16×14 cells.
    const calendar = sameElement(elements, { file: 'uisettings.ini', section: 'calendar day' })!;
    expect(calendar.size).toEqual({ wKey: 'dw', hKey: 'dh', w: 16, h: 14, perW: 7, perH: 5 });
    // brightness.bmp sets the button's size, so w and h don't.
    expect(sameElement(elements, { file: 'uisettings.ini', section: 'brightness btn' })?.size).toBeUndefined();
  });

  it('writes the new size in the element’s own units, kept in range', () => {
    const t = themeWith('[calendar day]\r\ndw = 16\r\ndh = 14\r\n');
    const calendar = { file: 'uisettings.ini' as const, section: 'calendar day', size: { wKey: 'dw', hKey: 'dh', w: 16, h: 14, perW: 7, perH: 5 } };
    // Dragging the grid to 140×100 px makes 20×20 cells.
    expect(setSize(t, calendar, 140, 100)).toEqual({ w: 20, h: 20 });
    expect(t.uisettings.get('calendar day', 'dw')).toBe('20');
    // Never smaller than 1.
    expect(setSize(t, calendar, -50, 0)).toEqual({ w: 1, h: 1 });
  });

  it('cancelling puts the size back too', () => {
    const t = themeWith('[folder text]\r\nw = 100\r\n');
    const el = { file: 'uisettings.ini' as const, section: 'folder text', size: { wKey: 'w', hKey: 'h', w: 100, h: 16, perW: 1, perH: 1 } };
    const restore = savePosition(t, el);
    setPosition(t, el, 5, 5);
    setSize(t, el, 40, 40);
    restore();
    expect(t.uisettings.toString()).toBe('[folder text]\r\nw = 100\r\n');
  });
});

describe('moving', () => {
  it('writes x and y, kept inside the schema limits', () => {
    const t = themeWith('[big clock]\r\nx = 20\r\ny = 30\r\nshow = 1\r\n');
    const el = { file: 'uisettings.ini' as const, section: 'big clock' };
    expect(setPosition(t, el, 40.4, 300)).toEqual({ x: 40, y: 191 });
    expect(t.uisettings.toString()).toBe('[big clock]\r\nx = 40\r\ny = 191\r\nshow = 1\r\n');
    expect(sectionLabel(el)).toBe('Big clock');
  });

  it('puts back exactly what was there when cancelled', () => {
    const t = themeWith('[cover]\r\ndarken = 20\r\n');
    const el = { file: 'uisettings.ini' as const, section: 'cover' };
    const restore = savePosition(t, el);
    setPosition(t, el, 10, 10);
    restore();
    expect(t.uisettings.toString()).toBe('[cover]\r\ndarken = 20\r\n');
  });
});
