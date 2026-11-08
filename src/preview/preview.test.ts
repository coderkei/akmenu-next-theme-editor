import { describe, expect, it } from 'vitest';
import { encodeBmp555, type RgbaImage } from '../formats/bmp';
import { IniDocument } from '../formats/ini';
import { BANNER_SIZE, THEME_ICONS } from '../schema';
import { importThemeZip, newTheme, type Theme } from '../theme';
import { breakLine, stringWidth, textOutRect, type Glyph, type PreviewFont } from './font';
import { readFileSync } from 'node:fs';
import { DEFAULT_OPTIONS, renderTheme, type PreviewOptions } from './menu';
import { act, listRows, newMenuState, setSetting, setting, type Key, type MenuState } from './navigator';
import { loadMenuBitmap } from './menubmp';
import { parsePcf } from './pcf';
import { parseIniInt, ThemeSettings } from './settings';
import { SCREEN_W, Surface } from './surface';

/** Every printable character is a solid 4×6 block, 5 pixels apart. */
const blockFont: PreviewFont = {
  ascent: 9,
  glyph(code) {
    if (code < 32) return null;
    if (code === 32) return { advance: 3, left: 0, ascent: 0, width: 0, height: 0, bits: new Uint8Array(0) };
    return { advance: 5, left: 0, ascent: 6, width: 4, height: 6, bits: new Uint8Array(24).fill(1) } satisfies Glyph;
  },
};

const ds = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);

/** A solid-colour image from a DS colour (0 stays pure black). */
function solid(width: number, height: number, colour: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (colour & 31) << 3;
    data[i * 4 + 1] = ((colour >> 5) & 31) << 3;
    data[i * 4 + 2] = ((colour >> 10) & 31) << 3;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function bmp(width: number, height: number, colour: number) {
  return encodeBmp555(solid(width, height, colour));
}

function theme(ui: string, custom = '', files: Record<string, Uint8Array> = {}): Theme {
  const t = newTheme();
  t.uisettings = IniDocument.parse(ui);
  t.custom = IniDocument.parse(custom);
  for (const [k, v] of Object.entries(files)) t.files.set(k, v);
  return t;
}

/** Renders with the menu in a given state (home screen by default). */
function render(t: Theme, flavour: 'next' | 'classic' = 'next', setup?: (s: MenuState) => void, o: Partial<PreviewOptions> = {}) {
  const state = newMenuState();
  setup?.(state);
  return renderTheme(t, flavour, blockFont, state, opts(o));
}

const env = { themeName: 'Test', coverTheme: false };
const keys = (s: MenuState, ...ks: Key[]) => ks.forEach((key) => act(s, { type: 'key', key }, env));

const opts = (o: Partial<PreviewOptions> = {}): PreviewOptions => ({
  ...DEFAULT_OPTIONS,
  now: new Date(2026, 10, 8, 14, 37),
  ...o,
});

const at = (s: Surface, x: number, y: number) => s.pixels[y * SCREEN_W + x];

describe('menu bitmap loader', () => {
  it('reads 16-bit bottom-up BMPs as DS colours with black transparent', () => {
    const img = solid(3, 2, ds(31, 0, 0));
    img.data.fill(0, 0, 4); // top-left pixel pure black
    const res = loadMenuBitmap(encodeBmp555(img));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.bitmap.pitch).toBe(4);
    expect(res.bitmap.pixels[0]).toBe(0);
    expect(res.bitmap.pixels[1]).toBe(ds(31, 0, 0) | 0x8000);
  });

  it('rejects bitmaps the menu rejects, and says why', () => {
    const bytes = bmp(2, 2, 1);
    const v = new DataView(bytes.buffer);
    v.setUint16(0x1c, 24, true);
    expect(loadMenuBitmap(bytes)).toEqual({ ok: false, reason: expect.stringContaining('24-bit') });

    const topDown = bmp(2, 2, 1);
    new DataView(topDown.buffer).setInt32(0x16, -2, true);
    expect(loadMenuBitmap(topDown)).toEqual({ ok: false, reason: expect.stringContaining('top-down') });
  });
});

describe('INI reading', () => {
  it('parses numbers like CIniFile::GetInt', () => {
    expect(parseIniInt('0x7fff')).toBe(0x7fff);
    expect(parseIniInt('12abc')).toBe(12);
    expect(parseIniInt('-5')).toBe(-5);
    expect(parseIniInt('')).toBe(0);
    expect(parseIniInt('0x')).toBe(0);
  });

  it('only reads keys that are in the schema', () => {
    const s = new ThemeSettings(theme('[main list]\r\ntextColor = 0x1234\r\n'));
    expect(s.ui('main list', 'textColor')).toBe(0x1234);
    expect(s.ui('main list', 'selectionBarOpacity')).toBe(100);
    expect(() => s.ui('main list', 'madeUpKey')).toThrow(/schema/);
  });
});

describe('surface', () => {
  it('alternates fillRect colours and wraps past the right edge like the DS', () => {
    const s = new Surface();
    s.fillRect(1, 2, 254, 0, 4, 1);
    expect(at(s, 254, 0)).toBe(1 | 0x8000);
    expect(at(s, 255, 0)).toBe(2 | 0x8000);
    expect(at(s, 0, 1)).toBe(1 | 0x8000);
  });

  it('blends with the given source at 0–100% opacity', () => {
    const s = new Surface();
    const source = new Uint16Array(SCREEN_W * 192).fill(ds(0, 0, 0));
    s.fillRectBlend(ds(31, 31, 31), ds(31, 31, 31), 0, 0, 1, 1, 50, source);
    expect(at(s, 0, 0)).toBe(ds(15, 15, 15) | 0x8000);
  });
});

describe('text', () => {
  it('only draws characters that end inside the box', () => {
    const s = new Surface();
    textOutRect(s, blockFont, 0, 0, 12, 12, 'abc', 0x1f);
    // Line top is y=0, baseline at 9, blocks span rows 3–8.
    expect(at(s, 0, 3)).toBe(0x1f | 0x8000);
    expect(at(s, 5, 3)).toBe(0x1f | 0x8000);
    expect(at(s, 10, 3)).toBe(0); // 'c' would end at 15, past 12
  });

  it('wraps like cFont::breakLine, always ending with a newline', () => {
    expect(breakLine(blockFont, 'aaa aaa', 20)).toBe('aaa\naaa\n');
    expect(breakLine(blockFont, 'aa', 100)).toBe('aa\n');
    expect(stringWidth(blockFont, '\x01')).toBe(10);
  });
});

describe('PCF fonts', () => {
  /** A one-glyph PCF ('A': 3×2, rows 101 / 010) laid out like bdftopcf -p1 -l -L output. */
  function tinyPcf(): Uint8Array {
    const le = (n: number, size: 2 | 4) => (size === 2 ? [n & 0xff, (n >> 8) & 0xff] : [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
    const accel = [...le(0, 4), 0, 0, 0, 0, 0, 0, 0, 0, ...le(9, 4), ...le(2, 4)];
    const metrics = [...le(0, 4), ...le(1, 4), ...[0, 3, 4, 2, 0, 0].flatMap((n) => le(n, 2))];
    const bitmaps = [...le(0, 4), ...le(1, 4), ...le(0, 4), ...le(2, 4), ...le(0, 4), ...le(0, 4), ...le(0, 4), 0b101, 0b010];
    const encodings = [...le(0, 4), ...[65, 65, 0, 0, 0].flatMap((n) => le(n, 2)), ...le(0, 2)];
    const tables: [number, number[]][] = [[2, accel], [4, metrics], [8, bitmaps], [32, encodings]];
    const head = [1, 0x66, 0x63, 0x70, ...le(tables.length, 4)];
    let offset = head.length + tables.length * 16;
    const toc: number[] = [];
    for (const [type, data] of tables) {
      toc.push(...le(type, 4), ...le(0, 4), ...le(data.length, 4), ...le(offset, 4));
      offset += data.length;
    }
    return new Uint8Array([...head, ...toc, ...tables.flatMap(([, d]) => d)]);
  }

  it('reads glyphs and metrics the way the menu does', () => {
    const font = parsePcf(tinyPcf());
    expect(font.ascent).toBe(9);
    const g = font.glyph(65)!;
    expect([g.advance, g.left, g.ascent, g.width, g.height]).toEqual([4, 0, 2, 3, 2]);
    expect([...g.bits]).toEqual([1, 0, 1, 0, 1, 0]);
    expect(font.glyph(66)).toBeNull();
  });

  it('rejects files that aren’t PCF', () => {
    expect(() => parsePcf(new Uint8Array(16))).toThrow(/PCF/);
  });
});

describe('theme rendering', () => {
  const lower = ds(3, 6, 9);
  const files = { 'lower_screen.bmp': bmp(256, 192, lower), 'upper_screen.bmp': bmp(256, 192, ds(9, 6, 3)) };

  it('renders every window and view mode of an empty theme without unknown keys', () => {
    const setups: ((s: MenuState) => void)[] = [
      () => {},
      (s) => keys(s, 'A', 'DOWN'), // in a folder
      (s) => keys(s, 'START'), // start menu
      (s) => keys(s, 'DOWN', 'DOWN', 'DOWN', 'A'), // Slot-2 message
      (s) => keys(s, 'START', 'UP', 'UP', 'UP', 'A'), // Settings
      (s) => keys(s, 'START', 'UP', 'UP', 'UP', 'A', 'R', 'A'), // Settings confirm
      (s) => keys(s, 'START', 'DOWN', 'DOWN', 'DOWN', 'A'), // Themes
      (s) => keys(s, 'START', 'UP', 'UP', 'A'), // Help
      (s) => keys(s, 'START', 'UP', 'A'), // About
      (s) => keys(s, 'A', 'DOWN', 'A', 'A'), // loading a game
      (s) => keys(s, 'A', 'DOWN', 'A', 'Y'), // File Info for a game
      (s) => keys(s, 'START', 'DOWN', 'DOWN', 'A'), // File Info for the card
      (s) => keys(s, 'START', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'A'), // Tools
      (s) => keys(s, 'START', 'UP', 'UP', 'UP', 'A', 'A'), // language selector
      (s) => (s.console = 'dsi'), // DSi home list
    ];
    for (const setup of setups) {
      for (let mode = 0; mode < 4; mode++) {
        expect(() => render(newTheme(), 'next', (s) => (setup(s), setSetting(s, 'viewMode', mode)))).not.toThrow();
      }
    }
  });

  it('draws the backgrounds and the checkered selection bar', () => {
    const t = theme('[main list]\r\nselectionBarColor1 = 0x001f\r\nselectionBarColor2 = 0x03e0\r\n', '', files);
    const { top, bottom } = render(t);
    expect(at(top, 100, 100)).toBe(ds(9, 6, 3) | 0x8000);
    expect(at(bottom, 0, 100)).toBe(lower | 0x8000);
    // Bar starts at (2, 19); even rows start with colour 2.
    expect(at(bottom, 2, 19)).toBe(0x03e0 | 0x8000);
    expect(at(bottom, 3, 19)).toBe(0x001f | 0x8000);
    expect(at(bottom, 2, 20)).toBe(0x001f | 0x8000);
  });

  it('draws the big clock from clock_numbers.bmp', () => {
    // 10 digits of 4×2; the "1" row is colour 1, everything else colour 2.
    const img = solid(4, 20, 2);
    for (let i = 4 * 2; i < 4 * 4; i++) img.data.set([8, 0, 0, 255], i * 4);
    const t = theme('[big clock]\r\nx = 10\r\ny = 50\r\nshow = 1\r\n', '', {
      ...files,
      'calendar/clock_numbers.bmp': encodeBmp555(img),
    });
    const { top } = render(t, 'next', undefined, { now: new Date(2026, 0, 1, 1, 0) });
    // "01:00": digit 0 at x=10, digit 1 at x=16, minutes at 22-8+... (id 3 → 10+18-8=20).
    expect(at(top, 10, 50)).toBe(2 | 0x8000);
    expect(at(top, 16, 50)).toBe(1 | 0x8000);
    expect(at(top, 20, 50)).toBe(2 | 0x8000);
  });

  it('blinks the clock colon at its full size, so themes can animate with it', () => {
    // A 40×30 colon picture, much bigger than the 4-wide digits, like an animation frame.
    const t = theme('[big clock]\r\nx = 10\r\ny = 50\r\nshow = 1\r\n', '', {
      ...files,
      'calendar/clock_numbers.bmp': bmp(4, 20, 2),
      'calendar/clock_colon.bmp': bmp(40, 30, ds(0, 31, 0)),
    });
    const on = render(t, 'next', undefined, { colonShow: true }).top;
    const off = render(t, 'next', undefined, { colonShow: false }).top;
    // The colon starts at x + 2 × digit width and covers all 40×30 pixels.
    expect(at(on, 10 + 8, 50)).toBe(ds(0, 31, 0) | 0x8000);
    expect(at(on, 10 + 8 + 39, 50 + 29)).toBe(ds(0, 31, 0) | 0x8000);
    expect(at(off, 10 + 8 + 39, 50 + 29)).toBe(ds(9, 6, 3) | 0x8000);
  });

  it('highlights today in the calendar', () => {
    const t = theme('[calendar day]\r\nx = 100\r\ny = 40\r\nshow = 1\r\nhighlightColor = 0x7c00\r\n', '', files);
    // 1 Nov 2026 is a Sunday, so the 8th is the first cell of the second row.
    const { top } = render(t);
    expect(at(top, 100 - 8, 40 + 14 - 7)).toBe(0x7c00 | 0x8000);
  });

  it('decodes theme icons from icons/*.bin', () => {
    const banner = new Uint8Array(BANNER_SIZE);
    banner[0x20] = 0x21; // first two pixels: index 1, then index 2
    banner.set([0x1f, 0x00], 0x222); // palette[1]
    banner.set([0xe0, 0x03], 0x224); // palette[2]
    const t = theme('', '', { ...files, 'icons/microsd_banner.bin': banner });
    const { bottom } = render(t, 'next', (s) => setSetting(s, 'viewMode', 1));
    // Row 0 icon at (5, 20 + (38-32)/2 - 1).
    expect(at(bottom, 5, 22)).toBe(0x001f | 0x8000);
    expect(at(bottom, 6, 22)).toBe(0x03e0 | 0x8000);
  });

  it('draws custom.ini text only for AKMenu-Next themes', () => {
    const custom = '[custom text]\r\ntext = Hi\r\nx = 30\r\ny = 30\r\nw = 50\r\nh = 20\r\ncolor = 0x001f\r\nshow = 1\r\n';
    const t = theme('', custom, files);
    expect(at(render(t).top, 30, 33)).toBe(0x001f | 0x8000);
    expect(at(render(t, 'classic').top, 30, 33)).toBe(ds(9, 6, 3) | 0x8000);
  });

  it('shows a cover for the selected game only in cover themes', () => {
    const t = theme('[cover]\r\nx = 0\r\ny = 0\r\n', '', files);
    expect(at(render(t, 'next', (s) => (s.dir = 'fat:/Games/')).top, 0, 0)).toBe(0xffff);
    expect(at(render(t).top, 0, 0)).toBe(ds(9, 6, 3) | 0x8000);
  });

  it('shows the menu’s own icons where the theme has none, and the theme’s where it does', () => {
    const stockIcons = new Map(
      Object.values(THEME_ICONS).map((p) => [p, new Uint8Array(readFileSync(`public/${p}`))] as [string, Uint8Array]),
    );
    const iconView = (s: MenuState) => setSetting(s, 'viewMode', 1);
    // A classic theme can't have icons, so it gets the stock ones...
    const classic = render(theme('', '', files), 'classic', iconView, { stockIcons }).bottom;
    // ...which look just like an AKMenu-Next theme that ships those same files.
    const withOwn = theme('', '', { ...files, ...Object.fromEntries(stockIcons) });
    expect(render(withOwn, 'next', iconView, { stockIcons }).bottom.pixels).toEqual(classic.pixels);
    // A theme's own icon wins over the stock one.
    const banner = new Uint8Array(BANNER_SIZE);
    banner[0x20] = 0x11;
    banner.set([0x1f, 0x00], 0x222);
    const own = render(theme('', '', { ...files, 'icons/microsd_banner.bin': banner }), 'next', iconView, { stockIcons }).bottom;
    expect(at(own, 5, 22)).toBe(0x001f | 0x8000);
    expect(at(classic, 5, 22)).not.toBe(0x001f | 0x8000);
  });

  it('only mentions missing icons for AKMenu-Next themes', () => {
    const t = theme('', '', files);
    const icon = (notes: string[]) => notes.some((n) => n.includes('icons/'));
    expect(icon(render(t, 'next', (s) => setSetting(s, 'viewMode', 1)).notes)).toBe(true);
    expect(icon(render(t, 'classic', (s) => setSetting(s, 'viewMode', 1)).notes)).toBe(false);
  });

  it('notes files the DS won’t load', () => {
    const bad = bmp(256, 192, 1);
    new DataView(bad.buffer).setUint16(0x1c, 24, true);
    const { notes } = render(theme('', '', { ...files, 'lower_screen.bmp': bad }));
    expect(notes.join('\n')).toMatch(/lower_screen\.bmp won’t load on the DS: it’s 24-bit/);
  });
});

describe('the bundled Starlight theme', () => {
  it('opens and draws the home screen without any warnings', () => {
    const t = importThemeZip(new Uint8Array(readFileSync('public/themes/Starlight.zip')));
    expect(t.name).toBe('Starlight');
    expect(t.uisettings.hasSection('global settings')).toBe(true);
    expect(render(t).notes).toEqual([]);
  });
});

describe('the bundled menu font', () => {
  it('is liberation.pcf with the menu’s metrics', () => {
    const font = parsePcf(new Uint8Array(readFileSync('public/fonts/liberation.pcf')));
    expect(font.ascent).toBe(9);
    expect(stringWidth(font, 'microSD Card')).toBe(59);
  });
});

describe('navigating the menu', () => {
  it('opens folders with A and goes back with B, keeping the selection', () => {
    const s = newMenuState();
    keys(s, 'A'); // microSD Card
    expect(s.dir).toBe('fat:/');
    expect(listRows(s).map((r) => r.showName)).toEqual(['_nds/', 'Games/', 'Homebrew/']);
    keys(s, 'DOWN', 'A');
    expect(s.dir).toBe('fat:/Games/');
    keys(s, 'B');
    expect([s.dir, s.selected]).toEqual(['fat:/', 1]);
    keys(s, 'B');
    expect([s.dir, s.selected]).toEqual(['', 0]);
  });

  it('scrolls a page with left and right', () => {
    const s = newMenuState();
    keys(s, 'A', 'DOWN', 'A', 'RIGHT'); // Games, Internal view: 4 rows visible
    expect([s.selected, s.first]).toEqual([4, 3]);
  });

  it('shows the menu’s message for an empty Slot-2', () => {
    const s = newMenuState();
    keys(s, 'DOWN', 'DOWN', 'DOWN', 'A');
    expect(s.windows.at(-1)).toMatchObject({ kind: 'message', title: 'Notify', text: 'There is no device in SLOT-2' });
    keys(s, 'A');
    expect(s.windows).toEqual([]);
  });

  it('changes settings only after confirming them', () => {
    const s = newMenuState();
    keys(s, 'START', 'UP', 'UP', 'UP', 'A'); // Settings
    expect(s.windows.at(-1)?.kind).toBe('settings');
    keys(s, 'R', 'RIGHT'); // Interface tab: Filelist style Internal -> Small Icons
    keys(s, 'A', 'B'); // confirm, then cancel the confirmation
    expect(setting(s, 'viewMode')).toBe(2);
    keys(s, 'A', 'A'); // confirm and OK
    expect(setting(s, 'viewMode')).toBe(3);
    expect(s.windows).toEqual([]);
  });

  it('adds favourites from the start menu and remembers launched games', () => {
    const s = newMenuState();
    keys(s, 'A', 'DOWN', 'A'); // Games
    keys(s, 'START', 'A'); // Set favourite on Bubble Garden
    expect(s.favourites).toEqual(['fat:/Games/Bubble Garden.nds']);
    keys(s, 'A', 'A'); // loading window, then back
    expect(s.recent).toEqual(['fat:/Games/Bubble Garden.nds']);
    keys(s, 'X');
    expect(listRows(s).map((r) => r.showName)).toEqual(['Bubble Garden.nds']);
  });

  it('lists the DSi’s own SD card and Slot-1 on a DSi', () => {
    const s = newMenuState('dsi');
    expect(listRows(s).map((r) => r.realName)).toEqual(['sd:/', 'favorites:/', 'recent:/', 'slot1:/']);
    keys(s, 'A');
    expect(listRows(s).map((r) => r.showName)).toEqual(['_nds/', 'Games/', 'Homebrew/']);
    keys(s, 'B');
    expect([s.dir, s.selected]).toEqual(['', 0]);
  });

  it('opens File Info with Y and Tools from the start menu', () => {
    const s = newMenuState();
    keys(s, 'A', 'DOWN', 'A', 'Y');
    expect(s.windows.at(-1)).toMatchObject({ kind: 'fileinfo', row: { showName: 'Bubble Garden.nds' } });
    keys(s, 'A', 'START', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'A');
    expect(s.windows.at(-1)?.kind).toBe('tools');
  });

  it('changes language through the menu’s own selector, then restarts', () => {
    const s = newMenuState();
    keys(s, 'A'); // into the card, so the restart has somewhere to come back from
    keys(s, 'START', 'UP', 'UP', 'UP', 'A'); // Settings; Language is the first item
    keys(s, 'A'); // opens the language selector
    expect(s.windows.at(-1)?.kind).toBe('language');
    keys(s, 'UP', 'X'); // Deutsch sorts before English
    expect(s.windows.at(-1)).toMatchObject({ kind: 'message', title: 'Question' });
    keys(s, 'A');
    expect([s.language, s.windows, s.dir]).toEqual(['Deutsch', [], '']);
  });

  it('finds tap targets where they were drawn', () => {
    const t = theme('[start button]\r\nx = 200\r\ny = 170\r\nw = 50\r\nh = 20\r\n');
    const s = newMenuState();
    const { hits, env: e } = renderTheme(t, 'next', blockFont, s, opts());
    const find = (x: number, y: number) => [...hits].reverse().find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    expect(find(210, 175)?.action).toEqual({ type: 'key', key: 'START' });
    expect(find(10, 30)?.action).toEqual({ type: 'listTap', row: 0, head: true });
    act(s, find(10, 30)!.action, e);
    expect(s.dir).toBe('fat:/');
  });
});
