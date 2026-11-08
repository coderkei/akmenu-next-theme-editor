// Draws both DS screens the way AKMenu-Next does, from a theme's files and settings
// and the menu's current state (navigator.ts). Each block follows the menu code it's
// named after (paths under arm9/source/). Covers, ROM icons and the username come
// from the SD card and console, not the theme, so the preview uses stand-ins for those.

import { BANNER_SIZE, NEXT_ONLY_PATHS, THEME_BITMAPS, THEME_ICONS, type Flavour, type ThemeFile } from '../schema';
import type { Theme } from '../theme';
import { breakLine, FONT_HEIGHT, stringWidth, textOut, textOutRect, type PreviewFont } from './font';
import { bannerLanguage, formatString, LANG } from './lang';
import { loadMenuBitmap, type MenuBitmap } from './menubmp';
import {
  LANGUAGE_LIST, LANGUAGE_WINDOW, LANGUAGES, LIST, MB_CANCEL, MB_NO, MB_OK, MB_YES, newMenuState, ROW_HEIGHT, SETTINGS, setting, settingValue, tabsFor,
  THEME_LIST, THEMES, themeRows, viewMode, listRows,
  type Action, type Env, type MenuState, type Row, type ViewMode, type Win,
} from './navigator';
import { ThemeSettings } from './settings';
import { SCREEN_H, SCREEN_W, Surface } from './surface';

export interface PreviewOptions {
  cardActivity: boolean;
  userName: string;
  now: Date;
  /**
   * The menu's own icons (arm9/data/*_banner.bin), keyed like THEME_ICONS. Used when the
   * theme has none: always for classic themes, and when Icon source isn't Theme Icons.
   */
  stockIcons?: Map<string, Uint8Array>;
  /**
   * Whether the clock colon is in its "on" half of the blink (cBigClock::_colonShow).
   * Shown if left out.
   */
  colonShow?: boolean;
}

export const DEFAULT_OPTIONS: PreviewOptions = {
  cardActivity: false,
  userName: 'Player',
  now: new Date(),
};

/** A tappable area of the bottom screen and what tapping it does. */
export interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  action: Action;
}

/**
 * Something drawn at an INI x/y that can be dragged around: the section it comes
 * from, its current x/y, and the box it covers on screen.
 */
export interface Placed {
  screen: 'top' | 'bottom';
  file: ThemeFile;
  section: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set when INI keys decide the drawn size, so it can be resized too. */
  size?: Sizing;
}

/**
 * Which INI keys size an element, their current values, and how many screen pixels
 * one step of each covers (the calendar grid is 7 cells wide, so 1 of dw is 7 px).
 */
export interface Sizing {
  wKey: string;
  hKey: string;
  w: number;
  h: number;
  perW: number;
  perH: number;
}

export interface PreviewResult {
  /** Movable elements as drawn, topmost last. */
  elements: Placed[];
  top: Surface;
  bottom: Surface;
  /** Things the user should know, e.g. files the DS won't load. */
  notes: string[];
  /** Tap targets of the window in front, topmost last. */
  hits: Hit[];
  env: Env;
}

/** cMainList::setViewMode: column widths (icon, show name, internal name). */
const VIEW_COLUMNS: Record<ViewMode, [number, number, number]> = {
  list: [0, 250, 0],
  smallIcon: [21, 232, 0],
  icon: [36, 214, 0],
  internal: [36, 0, 214],
};

class Assets {
  private files = new Map<string, Uint8Array>();
  private cache = new Map<string, MenuBitmap | null>();
  readonly notes: string[] = [];
  readonly missingIcons = new Set<string>();

  constructor(theme: Theme, flavour: Flavour) {
    for (const [path, data] of theme.files) {
      if (flavour === 'classic' && NEXT_ONLY_PATHS.some((r) => r.test(path))) continue;
      // FAT is case-insensitive.
      this.files.set(path.toLowerCase(), data);
    }
  }

  file(path: string): Uint8Array | undefined {
    return this.files.get(path.toLowerCase());
  }

  bitmap(path: string): MenuBitmap | null {
    const key = path.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key)!;
    const data = this.files.get(key);
    let bmp: MenuBitmap | null = null;
    if (data) {
      const res = loadMenuBitmap(data);
      if (res.ok) bmp = res.bitmap;
      else this.note(`${path} won’t load on the DS: ${res.reason}.`);
    }
    this.cache.set(key, bmp);
    return bmp;
  }

  note(message: string) {
    if (!this.notes.includes(message)) this.notes.push(message);
  }
}

export function renderTheme(
  theme: Theme,
  flavour: Flavour,
  font: PreviewFont,
  state: MenuState = newMenuState(),
  options: PreviewOptions = DEFAULT_OPTIONS,
): PreviewResult {
  const assets = new Assets(theme, flavour);
  const ini = new ThemeSettings(theme);
  const env: Env = { themeName: theme.name, coverTheme: ini.has('uisettings.ini', 'cover') };
  const ctx: Ctx = {
    assets, ini, font, options, state, env, hits: [], elements: [],
    next: flavour === 'next',
    clock12h: setting(state, 'clock12h') === 1,
  };
  const rows = listRows(state);
  const bottom = drawBottom(ctx, rows);
  const top = drawTop(ctx, rows[state.selected]);
  if (assets.missingIcons.size) {
    const names = [...assets.missingIcons].map((p) => p.replace('icons/', '')).join(', ');
    assets.note(`No ${names} in icons/, so the menu shows its own icons there.`);
  }
  return { top, bottom, notes: assets.notes, hits: ctx.hits, env, elements: ctx.elements };
}

interface Ctx {
  assets: Assets;
  ini: ThemeSettings;
  font: PreviewFont;
  options: PreviewOptions;
  state: MenuState;
  env: Env;
  hits: Hit[];
  elements: Placed[];
  next: boolean;
  clock12h: boolean;
}

function place(
  ctx: Ctx, screen: Placed['screen'], file: ThemeFile, section: string,
  originX: number, originY: number, x: number, y: number, w: number, h: number, size?: Sizing,
) {
  // Something sized from the INI stays grabbable even at 0×0, so it can be made bigger again.
  if (size) {
    w = Math.max(w, 4);
    h = Math.max(h, 4);
  }
  if (w > 0 && h > 0) ctx.elements.push({ screen, file, section, originX, originY, x, y, w, h, size });
}

const sized = (w: number, h: number, wKey = 'w', hKey = 'h', perW = 1, perH = 1): Sizing => ({ wKey, hKey, w, h, perW, perH });

function hit(ctx: Ctx, active: boolean, x: number, y: number, w: number, h: number, action: Action) {
  if (active) ctx.hits.push({ x, y, w, h, action });
}

// ---------------------------------------------------------------- top screen

/** irqs.cpp cIRQ::redrawTopScreen */
function drawTop(ctx: Ctx, selected: Row | undefined): Surface {
  // gdi present() refills the sub buffer with 0xffff (white) every frame.
  const s = new Surface(0xffff);
  const upper = ctx.assets.bitmap(THEME_BITMAPS.upperScreen);
  if (upper) {
    s.bitBlt(upper, 0, 0, SCREEN_W, SCREEN_H); // calendarwnd.cpp: no size check
    if (upper.width !== SCREEN_W || upper.height !== SCREEN_H) {
      ctx.assets.note(`${THEME_BITMAPS.upperScreen} is ${upper.width}×${upper.height}; it needs to be 256×192.`);
    }
  } else if (!ctx.assets.file(THEME_BITMAPS.upperScreen)) {
    ctx.assets.note(`There’s no ${THEME_BITMAPS.upperScreen}, so the top screen is blank.`);
  }
  drawCalendar(ctx, s);
  drawBigClock(ctx, s);
  if (ctx.next) {
    drawUserWindow(ctx, s);
    const covers = setting(ctx.state, 'showCovers') === 1;
    if (covers && ctx.env.coverTheme && selected?.isRom) drawCover(ctx, s);
  }
  return s;
}

/** calendar.cpp cCalendar::draw */
function drawCalendar(ctx: Ctx, s: Surface) {
  const { assets, ini, options } = ctx;
  const now = options.now;
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const weekday = now.getDay();
  const u8 = (n: number) => n & 0xff;

  if (ini.ui('calendar day', 'show')) {
    const days = assets.bitmap(THEME_BITMAPS.dayNumbers);
    const dx = ini.ui('calendar day', 'x');
    const dy = ini.ui('calendar day', 'y');
    const dw = ini.ui('calendar day', 'dw');
    const dh = ini.ui('calendar day', 'dh');
    const highlight = ini.ui('calendar day', 'highlightColor');
    const w = days ? u8(days.width) : 0;
    const h = days ? u8(Math.trunc(days.height / 10)) : 0;
    const pitch = days ? u8(days.pitch) : 0;
    const firstWeekday = (weekday + 7 - ((today - 1) % 7)) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const x = u8((((day - 1) % 7 + firstWeekday) % 7) * dw + dx);
      const y = u8(Math.trunc((day - 1 + firstWeekday) / 7) * dh + dy);
      if (day === today) {
        s.fillRect(highlight, highlight, x - (Math.trunc(dw / 2) - w), y - Math.trunc((dh - h) / 2), dw - 1, dh - 1);
      }
      if (days) {
        s.maskBlt(days, x, y, w, h, Math.trunc(day / 10) * pitch * h);
        s.maskBlt(days, x + w, y, w, h, (day % 10) * pitch * h);
      }
    }
    const weeks = Math.ceil((daysInMonth + firstWeekday) / 7);
    place(ctx, 'top', 'uisettings.ini', 'calendar day', dx, dy, dx, dy, 7 * dw, weeks * dh, sized(dw, dh, 'dw', 'dh', 7, weeks));
  }

  const numbers = assets.bitmap(THEME_BITMAPS.yearNumbers);
  const drawValue = (section: string, value: number, factor: number) => {
    if (!ini.ui(section, 'show') || !numbers) return;
    const w = u8(numbers.width);
    const h = u8(Math.trunc(numbers.height / 10));
    const pitch = u8(numbers.pitch);
    const px = ini.ui(section, 'x');
    const py = ini.ui(section, 'y');
    place(ctx, 'top', 'uisettings.ini', section, px, py, px, py, String(factor).length * w, h);
    for (let i = 0; factor > 0; i++, factor = Math.trunc(factor / 10)) {
      const digit = u8(Math.trunc(value / factor));
      value %= factor;
      s.maskBlt(numbers, u8(px + i * w), u8(py), w, h, digit * pitch * h);
    }
  };
  drawValue('calendar dayx', today, 10);
  drawValue('calendar month', month, 10);
  drawValue('calendar year', year, 1000);
}

/** bigclock.cpp cBigClock::draw */
function drawBigClock(ctx: Ctx, s: Surface) {
  const { assets, ini, font, options, clock12h } = ctx;
  if (!ini.ui('big clock', 'show')) return;
  const numbers = assets.bitmap(THEME_BITMAPS.clockNumbers);
  const colon = assets.bitmap(THEME_BITMAPS.clockColon);
  const bx = ini.ui('big clock', 'x');
  const by = ini.ui('big clock', 'y');
  let hours = options.now.getHours();
  const minutes = options.now.getMinutes();
  const ampm = hours < 12 ? 'AM' : 'PM';
  if (clock12h) {
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;
  }
  const nw = numbers?.width ?? 0;
  const digit = (id: number, n: number) => {
    let x = (bx + id * (nw + 2)) & 0xff;
    if (id > 2) x = (x - 8) & 0xff;
    if (!numbers) return;
    const h = Math.trunc(numbers.height / 10) & 0xff;
    s.maskBlt(numbers, x, by & 0xff, nw & 0xff, h, n * (numbers.pitch & 0xff) * h);
  };
  digit(0, Math.trunc(hours / 10));
  digit(1, hours % 10);
  digit(3, Math.trunc(minutes / 10));
  digit(4, minutes % 10);
  // irqs.cpp flips the colon every 32 frames. It's drawn at clock_colon.bmp's full size,
  // so some themes use a big colon picture as a two-frame animation.
  if (colon && (options.colonShow ?? true)) s.maskBlt(colon, (bx + 2 * nw) & 0xff, by & 0xff, colon.width, colon.height);
  const digitH = numbers ? Math.trunc(numbers.height / 10) : 0;
  place(ctx, 'top', 'uisettings.ini', 'big clock', bx, by, bx, by, numbers ? 4 * (nw + 2) - 8 + nw : (colon ? 2 * nw + colon.width : 0), Math.max(digitH, colon?.height ?? 0));
  if (clock12h && ini.ui('am pm', 'show')) {
    const ax = ini.ui('am pm', 'x'), ay = ini.ui('am pm', 'y');
    textOut(s, font, ax, ay, ampm, ini.ui('am pm', 'color'));
    place(ctx, 'top', 'uisettings.ini', 'am pm', ax, ay, ax, ay, stringWidth(font, ampm), FONT_HEIGHT);
  }
}

/** Finds a custom picture's full SD path inside the theme, if it points there. */
function themePathFor(sdPath: string): string | null {
  const m = /_nds\/akmenunext\/ui\/[^/]+\/(.+)$/i.exec(sdPath.replace(/\\/g, '/'));
  return m ? m[1] : null;
}

/** userwnd.cpp cUserWindow::draw */
function drawUserWindow(ctx: Ctx, s: Surface) {
  const { assets, ini, font, options, clock12h } = ctx;
  const c = (section: string, key: string, fallback?: number) => ini.custom(section, key, fallback);

  if (c('custom picture', 'show')) {
    const sdPath = ini.str('custom.ini', 'custom picture', 'file');
    const inTheme = sdPath ? themePathFor(sdPath) : null;
    const data = inTheme ? assets.file(inTheme) : undefined;
    if (data && data.length <= 1024 * 10) {
      const pic = assets.bitmap(inTheme!);
      const px = c('custom picture', 'x'), py = c('custom picture', 'y');
      if (pic) s.maskBlt(pic, px, py, pic.width, pic.height);
      if (pic) place(ctx, 'top', 'custom.ini', 'custom picture', px, py, px, py, pic.width, pic.height);
    } else if (data) {
      assets.note(`The custom picture is over 10KB, so the menu won’t show it.`);
    } else if (sdPath) {
      assets.note(`The custom picture (${sdPath}) isn’t in this theme, so the preview can’t show it.`);
    }
  }

  const text = ini.str('custom.ini', 'custom text', 'text');
  if (c('custom text', 'show') && text !== '') {
    const tx = c('custom text', 'x'), ty = c('custom text', 'y'), tw = c('custom text', 'w');
    textOutRect(s, font, tx, ty, tw, c('custom text', 'h'), text, c('custom text', 'color'));
    const th = c('custom text', 'h');
    place(ctx, 'top', 'custom.ini', 'custom text', tx, ty, tx, ty, tw, Math.max(FONT_HEIGHT, th), sized(tw, th));
  }

  if (c('user name', 'show') && options.userName !== '') {
    const ux = c('user name', 'x'), uy = c('user name', 'y');
    textOut(s, font, ux, uy, options.userName, c('user name', 'color', 0xffff));
    place(ctx, 'top', 'custom.ini', 'user name', ux, uy, ux, uy, stringWidth(font, options.userName), FONT_HEIGHT);
  }

  if (c('date', 'show')) {
    const now = options.now;
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear()).padStart(4, '0');
    const format = ini.str('custom.ini', 'date', 'format');
    const fields = format === 'MM/DD/YYYY' ? [mm, dd, yyyy] : format === 'YYYY/MM/DD' ? [yyyy, mm, dd] : [dd, mm, yyyy];
    const dx = c('date', 'x');
    const dy = c('date', 'y');
    if (c('date', 'font') !== 0) {
      // drawBitmapDate: 9×14 digits, 12px between fields.
      const digits = assets.bitmap(THEME_BITMAPS.dateNumbers);
      if (!digits || digits.width !== 9 || digits.height < 140) {
        if (digits) assets.note(`${THEME_BITMAPS.dateNumbers} needs to be 9 pixels wide and at least 140 tall.`);
        else if (!assets.file(THEME_BITMAPS.dateNumbers)) assets.note(`The date uses ${THEME_BITMAPS.dateNumbers}, but the theme doesn’t have it.`);
        return;
      }
      let x = dx;
      fields.forEach((field, i) => {
        if (i) x += 12;
        for (const ch of field) {
          s.maskBlt(digits, x, dy, 9, 14, Number(ch) * digits.pitch * 14);
          x += 9;
        }
      });
      place(ctx, 'top', 'custom.ini', 'date', dx, dy, dx, dy, x - dx, 14);
    } else {
      let out = fields.join('/');
      if (c('date', 'showTime')) {
        let hours = now.getHours();
        const mins = String(now.getMinutes()).padStart(2, '0');
        if (clock12h) {
          const ampm = hours < 12 ? 'AM' : 'PM';
          if (hours > 12) hours -= 12;
          if (hours === 0) hours = 12;
          out += ` ${hours}:${mins} ${ampm}`;
        } else {
          out += ` ${String(hours).padStart(2, '0')}:${mins}`;
        }
      }
      textOut(s, font, dx, dy, out, c('date', 'color', 0xffff));
      place(ctx, 'top', 'custom.ini', 'date', dx, dy, dx, dy, stringWidth(font, out), FONT_HEIGHT);
    }
  }
}

/** A stand-in box-art cover, 128×115 like the usual DS cover files. */
function placeholderCover(): MenuBitmap {
  const width = 128, height = 115;
  const pixels = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const band = y > 80 && y < 96;
      const r = edge ? 31 : band ? 30 : 6 + Math.trunc((x * 10) / width);
      const g = edge ? 31 : band ? 30 : 10 + Math.trunc((y * 12) / height);
      const b = edge ? 31 : band ? 30 : 22;
      pixels[y * width + x] = r | (g << 5) | (b << 10) | 0x8000;
    }
  }
  return { width, height, pitch: width, pixels };
}

/** coverwnd.cpp cCoverWnd::drawBackdrop and draw */
function drawCover(ctx: Ctx, s: Surface) {
  const { ini } = ctx;
  const cover = placeholderCover();
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const darken = clamp(ini.ui('cover', 'darken'));
  if (darken) s.fillRectBlend(0, 0, 0, 0, SCREEN_W, SCREEN_H, darken);

  const UNSET = -32768;
  let x = ini.ui('cover', 'x', UNSET);
  let y = ini.ui('cover', 'y', UNSET);
  if (x === UNSET) x = Math.trunc((SCREEN_W - cover.width) / 2);
  if (y === UNSET) y = Math.trunc((SCREEN_H - cover.height) / 2);
  const [originX, originY] = [x, y];
  let sx = 0, sy = 0, w = cover.width, h = cover.height;
  if (x < 0) { sx = -x; w -= sx; x = 0; }
  if (y < 0) { sy = -y; h -= sy; y = 0; }
  if (x + w > SCREEN_W) w = SCREEN_W - x;
  if (y + h > SCREEN_H) h = SCREEN_H - y;
  if (w <= 0 || h <= 0) return;
  place(ctx, 'top', 'uisettings.ini', 'cover', originX, originY, x, y, w, h);
  const offset = sy * cover.width + sx;
  const fade = clamp(ini.ui('cover', 'fade'));
  if (fade) s.blendBlt(cover, offset, cover.width, x, y, w, h, 100 - fade);
  else s.maskBltFrom(cover, offset, cover.width, cover.height, x, y, w, h);
}

// ------------------------------------------------------------- bottom screen

function drawBottom(ctx: Ctx, rows: Row[]): Surface {
  const { assets, options, state } = ctx;
  const lower = assets.bitmap(THEME_BITMAPS.lowerScreen);
  // gdi.cpp initBg: the background becomes sprites only if it's exactly 256×192.
  const bgOk = lower && lower.width === SCREEN_W && lower.height === SCREEN_H;
  if (lower && !bgOk) assets.note(`${THEME_BITMAPS.lowerScreen} is ${lower.width}×${lower.height}; it needs to be 256×192.`);
  if (!lower) {
    assets.note(
      assets.file(THEME_BITMAPS.lowerScreen)
        ? `Without a working ${THEME_BITMAPS.lowerScreen} the menu says system files are missing.`
        : `There’s no ${THEME_BITMAPS.lowerScreen}; the menu needs one and says system files are missing.`,
    );
  }

  // Layers, bottom to top: background sprites, the card icon sprite, then the UI layers
  // (windows behind the current one are on BG3, the current one on BG2).
  const out = new Surface(0);
  if (bgOk) out.pixels.set(lower.pixels);
  if (options.cardActivity) drawDiskIcon(ctx, out);

  // fillRectBlend on the main screen mixes with the background bitmap, not the UI.
  const background = lower && lower.pitch === SCREEN_W ? lower.pixels : new Uint16Array(SCREEN_W * SCREEN_H);
  const ui = new Surface(0);
  drawMainWindow(ctx, ui, background, rows, state.windows.length === 0);
  state.windows.forEach((win, i) => drawWindow(ctx, ui, win, i === state.windows.length - 1));
  out.overlay(ui);
  return out;
}

/** diskicon.cpp: a 32×32 sprite, normally only shown while the card is busy. */
function drawDiskIcon(ctx: Ctx, s: Surface) {
  const { assets, ini } = ctx;
  const icon = assets.bitmap(THEME_BITMAPS.cardIcon);
  if (!icon) return;
  const sprite = new Uint16Array(32 * 32);
  for (let i = 0; i < icon.height; i++) {
    for (let j = 0; j < icon.width; j++) {
      const idx = i * 32 + j;
      if (idx < sprite.length) sprite[idx] = icon.pixels[i * icon.pitch + j];
    }
  }
  const x = ini.ui('disk icon', 'x');
  const y = ini.ui('disk icon', 'y');
  if (ctx.state.windows.length === 0) place(ctx, 'bottom', 'uisettings.ini', 'disk icon', x, y, x, y, Math.min(32, icon.width), Math.min(32, icon.height));
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      const px = sprite[i * 32 + j];
      if (px & 0x8000 && x + j < SCREEN_W && y + i < SCREEN_H) s.pixels[(y + i) * SCREEN_W + x + j] = px;
    }
  }
}

/** mainwnd.cpp cMainWnd::init and draw: children in the order they're added. */
function drawMainWindow(ctx: Ctx, s: Surface, background: Uint16Array, rows: Row[], active: boolean) {
  const { assets, ini, font, state } = ctx;
  const menuOpen = state.startMenu !== null;
  // Elements can only be moved while the main window is in front.
  const main = state.windows.length === 0;
  // With the start menu open, a tap anywhere else closes it (cPopMenu::processTouchMessage).
  if (menuOpen) hit(ctx, active, 0, 0, SCREEN_W, SCREEN_H, { type: 'closeStartMenu' });
  drawMainList(ctx, s, background, rows, active && !menuOpen);

  // Start button (cButton, press style: top half of the image is the "up" state).
  if (ini.ui('start button', 'show')) {
    const bx = ini.ui('start button', 'x');
    const by = ini.ui('start button', 'y');
    let w = ini.ui('start button', 'w');
    let h = ini.ui('start button', 'h');
    const file = ini.str('uisettings.ini', 'start button', 'file');
    let text = ini.str('uisettings.ini', 'start button', 'text');
    if (text === 'ini') text = LANG('start menu', 'START');
    let fromImage = false;
    if (file !== 'none') {
      const img = assets.bitmap(file);
      if (img) {
        fromImage = true;
        w = img.width;
        h = Math.trunc(img.height / 2);
        s.maskBlt(img, bx, by, img.width, h);
      } else if (!assets.file(file)) {
        assets.note(`The start button uses ${file}, but the theme doesn’t have it.`);
      }
    }
    drawButtonText(s, font, bx, by, w, h, text, ini.ui('start button', 'textColor'));
    hit(ctx, active, bx, by, w, h, { type: 'key', key: 'START' });
    // With a picture the button takes the picture's size, so w and h do nothing.
    if (main) place(ctx, 'bottom', 'uisettings.ini', 'start button', bx, by, bx, by, w, h, fromImage ? undefined : sized(w, h));
  }

  // Brightness and folder-up buttons: single-style cButtons, drawn at the image's size.
  const brightness = assets.bitmap(THEME_BITMAPS.brightness);
  const bx = ini.ui('brightness btn', 'x'), by = ini.ui('brightness btn', 'y');
  if (brightness) s.maskBlt(brightness, bx, by, brightness.width, brightness.height);
  if (main && brightness) place(ctx, 'bottom', 'uisettings.ini', 'brightness btn', bx, by, bx, by, brightness.width, brightness.height);
  hit(ctx, active && !menuOpen, bx, by, brightness?.width ?? ini.ui('brightness btn', 'w'), brightness?.height ?? ini.ui('brightness btn', 'h'), { type: 'key', key: 'R' });

  const folderUp = assets.bitmap(THEME_BITMAPS.folderUp);
  const fx = ini.ui('folderup btn', 'x'), fy = ini.ui('folderup btn', 'y');
  if (folderUp) s.maskBlt(folderUp, fx, fy, folderUp.width, folderUp.height);
  if (main) {
    const uw = ini.ui('folderup btn', 'w'), uh = ini.ui('folderup btn', 'h');
    // folder_up.bmp is drawn at its own size; w and h only set the box without one.
    place(ctx, 'bottom', 'uisettings.ini', 'folderup btn', fx, fy, fx, fy, folderUp?.width ?? uw, folderUp?.height ?? uh, folderUp ? undefined : sized(uw, uh));
  }
  // Its touch area is setSize(w, h) from the ini, whatever the image size.
  hit(ctx, active && !menuOpen, fx, fy, ini.ui('folderup btn', 'w'), ini.ui('folderup btn', 'h'), { type: 'key', key: 'B' });

  // Folder name (cStaticText).
  const tx = ini.ui('folder text', 'x'), ty = ini.ui('folder text', 'y');
  textOutRect(s, font, tx, ty, ini.ui('folder text', 'w'), ini.ui('folder text', 'h'), state.dir, ini.ui('folder text', 'color'));
  if (main) {
    const fw = ini.ui('folder text', 'w'), fh = ini.ui('folder text', 'h');
    place(ctx, 'bottom', 'uisettings.ini', 'folder text', tx, ty, tx, ty, fw, fh, sized(fw, fh));
  }

  if (menuOpen) drawStartMenu(ctx, s, active);
}

/** cButtonDesc::draw: centred text, nudged down a pixel. */
function drawButtonText(s: Surface, font: PreviewFont, x: number, y: number, w: number, h: number, text: string, colour: number) {
  const tx = x + Math.floor((w - stringWidth(font, text)) / 2);
  const ty = y + Math.floor((h - FONT_HEIGHT) / 2) + 1;
  textOutRect(s, font, tx, ty, w, h, text, colour);
}

/** The size a press-style cButton takes: half the image's height, or its defaults. */
function buttonSize(ctx: Ctx, path: string, w: number, h: number) {
  const img = ctx.assets.bitmap(path);
  return img ? { w: img.width, h: Math.trunc(img.height / 2) } : { w, h };
}

/** A press-style cButton in its "up" state. */
function drawPressButton(ctx: Ctx, s: Surface, path: string, x: number, y: number, size: { w: number; h: number }, text: string) {
  const img = ctx.assets.bitmap(path);
  if (img) s.maskBlt(img, x, y, img.width, size.h);
  drawButtonText(s, ctx.font, x, y, size.w, size.h, text, ctx.ini.ui('global settings', 'buttonTextColor'));
}

/** mainlist.cpp cMainList::draw, via listview.cpp cListView::draw */
function drawMainList(ctx: Ctx, s: Surface, background: Uint16Array, rows: Row[], active: boolean) {
  const { ini, font, state } = ctx;
  const mode = viewMode(state);
  const cols = VIEW_COLUMNS[mode];
  const rowHeight = ROW_HEIGHT[mode];
  const visible = Math.trunc(LIST.h / rowHeight);
  const c1 = ini.ui('main list', 'selectionBarColor1');
  const c2 = ini.ui('main list', 'selectionBarColor2');
  const opacity = ini.ui('main list', 'selectionBarOpacity');

  // Selection bar (drawn even in an empty folder): alternate rows swap the two colours.
  const barY = LIST.y + (state.selected - state.first) * rowHeight - 1;
  for (let i = 0; i < rowHeight; i++) {
    if (i & 1) s.fillRectBlend(c1, c2, LIST.x - 2, barY + i, LIST.w + 4, 1, opacity, background);
    else s.fillRectBlend(c2, c1, LIST.x - 2, barY + i, LIST.w + 4, 1, opacity, background);
  }

  // Columns: icon, show name, internal name (real name, save type and size are 0 wide).
  const shown = rows.slice(state.first, state.first + visible);
  const offsets = [0, cols[0], cols[0] + cols[1]];
  shown.forEach((row, i) => {
    const texts = ['', row.showName, mode === 'internal' ? row.internalName : ''];
    const colour = state.first + i === state.selected ? ini.ui('main list', 'textColorHilight') : ini.ui('main list', 'textColor');
    const itemY = LIST.y + i * rowHeight;
    for (let j = 0; j < 3; j++) {
      const height = texts[j].split('\n').length * FONT_HEIGHT;
      const textY = itemY + ((rowHeight - height - 1) >> 1);
      if (textY + height > LIST.y + LIST.h) break;
      textOutRect(s, font, LIST.x + offsets[j], textY, cols[j], height, texts[j], colour);
    }
    // Tapping selects; tapping the first 32 px (the icon) also opens it.
    hit(ctx, active, LIST.x, itemY, LIST.w, rowHeight, { type: 'listTap', row: state.first + i, head: false });
    hit(ctx, active, LIST.x + 1, itemY, 31, rowHeight, { type: 'listTap', row: state.first + i, head: true });
  });

  if (mode === 'list') return;
  const small = mode === 'smallIcon';
  const iconH = small ? 16 : 32;
  // Classic themes can't have an icons folder, so there's nothing to look for or report.
  const useTheme = ctx.next && setting(state, 'iconSource') === 0;
  shown.forEach((row, i) => {
    const x = LIST.x + 1;
    const y = LIST.y + i * rowHeight + ((rowHeight - iconH) >> 1) - 1;
    drawIcon(ctx.assets, s, THEME_ICONS[row.icon], x, y, small, useTheme, ctx.options.stockIcons);
  });
}

/** dsrom.cpp DSRomInfo::drawDSRomIcon: a 32×32 4bpp tiled icon; index 0 is clear. */
function drawIcon(
  assets: Assets, s: Surface, path: string, x: number, y: number, small: boolean, useTheme: boolean,
  stock?: Map<string, Uint8Array>,
) {
  // iconassets.cpp loadIconAsset: the theme's icon, else the menu's own (the global
  // icons folder ships the same files as the built-in set).
  let data = useTheme ? assets.file(path) : undefined;
  if (data && data.length < BANNER_SIZE) {
    assets.note(`${path} is too short to be an icon (it needs ${BANNER_SIZE} bytes).`);
    data = undefined;
  } else if (!data && useTheme) {
    assets.missingIcons.add(path);
  }
  data ??= stock?.get(path);
  if (!data || data.length < BANNER_SIZE) {
    // Only while the stock icons are still loading.
    const size = small ? 16 : 32;
    s.frameRect(0x4210, x, y, size, size);
    return;
  }
  const palette = (i: number) => data[0x220 + i * 2] | (data[0x221 + i * 2] << 8);
  for (let tile = 0; tile < 16; tile++) {
    for (let p = 0; p < 32; p++) {
      const byte = data[0x20 + (tile << 5) + p];
      let px = ((tile & 3) << 3) + ((p << 1) & 7);
      let py = ((tile >> 2) << 3) + (p >> 2);
      if (small) {
        px = Math.trunc(px / 2);
        py = Math.trunc(py / 2);
      }
      const hi = byte >> 4;
      const lo = byte & 0x0f;
      if (hi) s.pixel(px + 1 + x, py + y, palette(hi));
      if (lo) s.pixel(px + x, py + y, palette(lo));
    }
  }
}

const START_MENU_ITEMS = ['Set favorite', 'Unset favorite', 'Info', 'Themes', 'Tools', 'Setting', 'Help', 'About'];

/** startmenu.cpp loadAppearance + popmenu.cpp cPopMenu::draw */
function drawStartMenu(ctx: Ctx, s: Surface, active: boolean) {
  const { assets, ini, font, state } = ctx;
  const bg = assets.bitmap(THEME_BITMAPS.startMenu);
  const x = ini.ui('start menu', 'x');
  const y = ini.ui('start menu', 'y');
  const width = bg?.width ?? 0;
  if (bg) s.maskBlt(bg, x, y, bg.width, bg.height);
  if (active && bg) place(ctx, 'bottom', 'uisettings.ini', 'start menu', x, y, x, y, bg.width, bg.height);
  const itemX = ini.ui('start menu', 'itemX');
  const itemY = ini.ui('start menu', 'itemY');
  const itemH = ini.ui('start menu', 'itemHeight');
  const itemW = ini.ui('start menu', 'itemWidth');
  let barLeft = ini.ui('start menu', 'barLeft');
  if (itemW === 0 && barLeft * 2 > width) barLeft = 0;
  const barW = itemW || width - 2 * barLeft;
  const bar = ini.ui('global settings', 'popMenuBarColor');
  START_MENU_ITEMS.forEach((key, i) => {
    const ix = x + itemX;
    const iy = y + i * itemH + itemY;
    const selected = i === state.startMenu;
    if (selected) s.fillRect(bar, bar, x + barLeft, iy - 2, barW, itemH);
    textOut(s, font, ix, iy, LANG('start menu', key), ini.ui('global settings', selected ? 'popMenuTextHighLightColor' : 'popMenuTextColor'));
    hit(ctx, active, x + barLeft, iy - 2, barW, itemH, { type: 'startMenuItem', index: i });
  });
}

// ------------------------------------------------------------------- windows

function drawWindow(ctx: Ctx, s: Surface, win: Win, active: boolean) {
  switch (win.kind) {
    case 'message': return drawMessageBox(ctx, s, win, active);
    case 'settings': return drawSettings(ctx, s, win, active);
    case 'themes': return drawThemes(ctx, s, win, active);
    case 'text': return drawTextWindow(ctx, s, win, active);
    case 'progress': return drawProgress(ctx, s, win, active);
    case 'fileinfo': return drawFileInfo(ctx, s, win, active);
    case 'tools': return drawTools(ctx, s, active);
    case 'language': return drawLanguages(ctx, s, win, active);
  }
}

/** formdesc.cpp cFormDesc::draw: title bar from three bitmaps, then the body and frame. */
function drawForm(ctx: Ctx, s: Surface, x: number, y: number, w: number, h: number, title: string, titleBitmaps = true) {
  const { assets, ini, font } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const left = titleBitmaps ? assets.bitmap(THEME_BITMAPS.titleLeft) : null;
  const middle = titleBitmaps ? assets.bitmap(THEME_BITMAPS.titleMiddle) : null;
  const right = titleBitmaps ? assets.bitmap(THEME_BITMAPS.titleRight) : null;
  const lw = left?.width ?? 0, lh = left?.height ?? 0, rw = right?.width ?? 0;
  if (left) s.maskBlt(left, x, y, left.width, left.height);
  if (middle) {
    for (let i = 0; i < middle.height; i++) {
      // The menu reads buffer()[i] from a u32 pointer: the (2i)th pixel of the bitmap.
      const colour = middle.pixels[2 * i] ?? 0;
      s.fillRect(colour, colour, x + lw, y + i, w - lw - rw, 1);
    }
  }
  if (right) s.maskBlt(right, x + w - rw, y, right.width, right.height);
  if (title) textOut(s, font, x + 8, y + Math.floor((lh - FONT_HEIGHT) / 2) + 1, title, g('formTitleTextColor'));
  s.fillRect(g('formBodyColor'), g('formBodyColor'), x, y + lh, w, h - lh);
  s.frameRect(g('formFrameColor'), x, y + lh, w, h - lh, g('thickness'));
}

/** msgbox.cpp cMessageBox */
function drawMessageBox(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'message' }>, active: boolean) {
  const { ini, font } = ctx;
  const msg = breakLine(font, win.text, 192);
  const lines = msg.split('\n').slice(0, -1);
  const widest = Math.max(0, ...lines.map((l) => stringWidth(font, l)));
  let w = Math.min(256, Math.max(192, widest + 48));
  if (w & 1) w--;
  const h = lines.length * FONT_HEIGHT + 60;
  let x = Math.trunc((SCREEN_W - w) / 2);
  if (x & 1) x--;
  const y = Math.trunc((SCREEN_H - h) / 2);
  drawForm(ctx, s, x, y, w, h, win.title);

  // Buttons line up from the right: No, Yes, Cancel, OK; all btn3.bmp.
  const size = buttonSize(ctx, THEME_BITMAPS.button3, 46, 18);
  const btnY = y + h - size.h - 4;
  let nextX = w;
  const buttons: [number, string, 'A' | 'B'][] = [
    [MB_NO, '\x02 ' + LANG('message box', 'no'), 'B'],
    [MB_YES, '\x01 ' + LANG('message box', 'yes'), 'A'],
    [MB_CANCEL, '\x02 ' + LANG('message box', 'cancel'), 'B'],
    [MB_OK, '\x01 ' + LANG('message box', 'ok'), 'A'],
  ];
  for (const [flag, label, key] of buttons) {
    if (!(win.style & flag)) continue;
    nextX -= size.w + 8;
    drawPressButton(ctx, s, THEME_BITMAPS.button3, x + nextX, btnY, size, label);
    hit(ctx, active, x + nextX, btnY, size.w, size.h, { type: 'key', key });
  }
  textOut(s, font, x + Math.trunc((w - widest) / 2), y + 24, msg, ini.ui('global settings', 'formTextColor'));
}

/** settingwnd.cpp / spinbox.cpp drawScrollChevron */
function drawChevron(s: Surface, x: number, y: number, up: boolean, colour: number) {
  if (up) {
    s.drawLine(colour, x, y + 4, x + 4, y);
    s.drawLine(colour, x + 4, y, x + 8, y + 4);
  } else {
    s.drawLine(colour, x, y, x + 4, y + 4);
    s.drawLine(colour, x + 4, y + 4, x + 8, y);
  }
}

/** The scroll arrows and track the settings and theme windows draw. */
function drawScrollIndicator(ctx: Ctx, s: Surface, x: number, y: number, first: number, maxFirst: number) {
  const g = (key: string) => ctx.ini.ui('global settings', key);
  const activeColour = g('spinBoxTextColor');
  const inactiveColour = g('spinBoxNormalColor');
  drawChevron(s, x, y, true, first > 0 ? activeColour : inactiveColour);
  drawChevron(s, x, y + 8, false, first < maxFirst ? activeColour : inactiveColour);
  s.frameRect(g('spinBoxFrameColor'), x + 12, y, 5, 12);
  const thumbY = y + Math.trunc((first * (12 - 4)) / maxFirst);
  s.fillRect(activeColour, activeColour, x + 12, thumbY, 5, 4);
}

/** spinbox.cpp cSpinBox::draw. Returns the widths of its two arrow buttons. */
function drawSpinBox(ctx: Ctx, s: Surface, x: number, y: number, w: number, text: string, focused: boolean) {
  const { assets, ini, font } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const h = 18;
  const prev = assets.bitmap(THEME_BITMAPS.spinLeft);
  const next = assets.bitmap(THEME_BITMAPS.spinRight);
  const prevW = prev?.width ?? 18;
  const nextW = next?.width ?? 18;
  const bar = focused ? g('spinBoxFocusColor') : g('spinBoxNormalColor');
  const bodyX = (x + prevW) & 0xff;
  const fillW = (w - nextW - prevW) & 0xff;
  s.fillRect(bar, bar, bodyX, y, fillW, h);
  s.frameRect(g('spinBoxFrameColor'), bodyX, y, fillW, h, g('thickness'));
  if (prev) s.maskBlt(prev, x, y, prev.width, prev.height);
  const tw = Math.min(stringWidth(font, text), w - 36);
  textOutRect(s, font, x + ((w - tw) >> 1), y + ((h - FONT_HEIGHT) >> 1), w - 36, h, text, focused ? g('spinBoxTextHiLightColor') : g('spinBoxTextColor'));
  if (next) s.maskBlt(next, x + w - nextW, y, next.width, next.height);
  return { prevW, nextW };
}

/** settingwnd.cpp cSettingWnd (as opened by cMainWnd::setParam) */
function drawSettings(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'settings' }>, active: boolean) {
  const { ini, font } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const W = SETTINGS.width, H = SETTINGS.height;
  const x = Math.trunc((SCREEN_W - W) / 2), y = Math.trunc((SCREEN_H - H) / 2);
  const spinW = ini.ui('setting window', 'spinBoxWidth');
  // With more than one tab the title text goes, and simpleTabs drops the title bitmaps too.
  drawForm(ctx, s, x, y, W, H, '', !ini.ui('setting window', 'simpleTabs'));

  // Tab switcher: a full-width spin box over the title bar that never takes focus.
  const tabDefs = tabsFor(ctx.state);
  const tabs = drawSpinBox(ctx, s, x, y, W, tabDefs[win.tab].title, false);
  hit(ctx, active, x, y, tabs.prevW, 18, { type: 'settingsTab', delta: -1 });
  hit(ctx, active, x + W - tabs.nextW, y, tabs.nextW, 18, { type: 'settingsTab', delta: 1 });

  const cancel = buttonSize(ctx, THEME_BITMAPS.button3, 48, 18);
  const ok = buttonSize(ctx, THEME_BITMAPS.button3, 46, 18);
  const btnY = y + H - cancel.h - 4;
  const cancelX = x + W - (cancel.w + 8);
  const okX = cancelX - (ok.w + 8);
  drawPressButton(ctx, s, THEME_BITMAPS.button3, cancelX, btnY, cancel, '\x02 ' + LANG('setting window', 'cancel'));
  drawPressButton(ctx, s, THEME_BITMAPS.button3, okX, btnY, ok, '\x01 ' + LANG('setting window', 'ok'));
  hit(ctx, active, cancelX, btnY, cancel.w, cancel.h, { type: 'key', key: 'B' });
  hit(ctx, active, okX, btnY, ok.w, ok.h, { type: 'settingsOk' });

  const items = tabDefs[win.tab].items;
  const first = win.first[win.tab];
  items.slice(first, first + SETTINGS.maxVisible).forEach((item, i) => {
    const id = first + i;
    const itemY = y + i * SETTINGS.itemPitch + 18 + 4;
    const cx = x + W - spinW - 4;
    const focused = win.focus[win.tab] === id;
    const value = item.values[settingValue(ctx.state, item, win.values)] ?? '';
    if (item.button) {
      // cSettingButton::draw
      const fill = focused ? g('spinBoxFocusColor') : g('spinBoxNormalColor');
      s.fillRect(fill, fill, cx, itemY, spinW, 18);
      s.frameRect(g('spinBoxFrameColor'), cx, itemY, spinW, 18, g('thickness'));
      const area = spinW - 6;
      const tw = Math.min(stringWidth(font, value), area);
      textOutRect(s, font, cx + 3 + Math.trunc((area - tw) / 2), itemY + Math.trunc((18 - FONT_HEIGHT) / 2), area, FONT_HEIGHT, value, focused ? g('spinBoxTextHiLightColor') : g('spinBoxTextColor'));
      hit(ctx, active, cx, itemY, spinW, 18, { type: 'settingsItem', item: id, delta: 0, tap: true });
    } else {
      const arrows = drawSpinBox(ctx, s, cx, itemY, spinW, value, focused);
      hit(ctx, active, cx, itemY, spinW, 18, { type: 'settingsItem', item: id, delta: 0 });
      hit(ctx, active, cx, itemY, arrows.prevW, 18, { type: 'settingsItem', item: id, delta: -1 });
      hit(ctx, active, cx + spinW - arrows.nextW, itemY, arrows.nextW, 18, { type: 'settingsItem', item: id, delta: 1 });
    }
    textOutRect(s, font, x + 8, itemY + 3, Math.trunc(W / 2) + 8, 12, item.label, g('formTextColor'));
  });

  if (items.length > SETTINGS.maxVisible) {
    const maxFirst = items.length - SETTINGS.maxVisible;
    drawScrollIndicator(ctx, s, x + Math.trunc(W / 2) - 8, y + SETTINGS.scrollY, Math.min(first, maxFirst), maxFirst);
  }
}

/** themewnd.cpp cThemeWnd */
function drawThemes(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'themes' }>, active: boolean) {
  const { ini, font, env } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const W = THEMES.w, H = THEMES.h;
  const x = Math.trunc((SCREEN_W - W) / 2), y = Math.trunc((SCREEN_H - H) / 2);
  drawForm(ctx, s, x, y, W, H, LANG('theme selector', 'Themes'));

  const ok = buttonSize(ctx, THEME_BITMAPS.button2, 46, 18);
  const cancel = buttonSize(ctx, THEME_BITMAPS.button3, 54, 18);
  const cancelX = x + W - cancel.w - 4, cancelY = y + H - cancel.h - 4;
  const okX = x + W - cancel.w - ok.w - 8, okY = y + H - ok.h - 4;
  drawPressButton(ctx, s, THEME_BITMAPS.button2, okX, okY, ok, '\x03 ' + LANG('setting window', 'ok'));
  drawPressButton(ctx, s, THEME_BITMAPS.button3, cancelX, cancelY, cancel, '\x02 ' + LANG('setting window', 'cancel'));
  hit(ctx, active, okX, okY, ok.w, ok.h, { type: 'key', key: 'X' });
  hit(ctx, active, cancelX, cancelY, cancel.w, cancel.h, { type: 'key', key: 'B' });

  textOutRect(s, font, x + 8, y + 22, W - 16, 14, `${LANG('theme selector', 'Current theme:')} ${env.themeName}`, g('formTextColor'));

  // A plain cListView: colours from [global settings], drawn by cThemeWnd::onDraw.
  const lx = x + THEME_LIST.x, ly = y + THEME_LIST.y;
  const rh = THEME_LIST.rowHeight;
  const visible = Math.trunc(THEME_LIST.h / rh);
  const rows = themeRows(win, env.themeName, env.coverTheme);
  const b1 = g('listViewBarColor1'), b2 = g('listViewBarColor2');
  const barY = ly + (win.selected - win.first) * rh - 1;
  for (let i = 0; i < rh; i++) {
    if (i & 1) s.fillRect(b1, b2, lx - 2, barY + i, THEME_LIST.w + 4, 1);
    else s.fillRect(b2, b1, lx - 2, barY + i, THEME_LIST.w + 4, 1);
  }
  const iconW = 15, folderW = 11;
  rows.slice(win.first, win.first + visible).forEach((row, i) => {
    const id = win.first + i;
    const colour = id === win.selected ? g('listTextHighLightColor') : g('listTextColor');
    const itemY = ly + i * rh;
    const textY = itemY + ((rh - FONT_HEIGHT - 1) >> 1);
    const top = itemY - 1;
    if (textY + FONT_HEIGHT > ly + THEME_LIST.h) return;
    if (row.folder) {
      const size = rh - 3 * 2;
      const x1 = lx + ((iconW - size) >> 1) - 1;
      const y1 = top + 3;
      const x2 = x1 + (size >> 1), y2 = y1 + (size >> 1);
      s.frameRect(colour, x1, y1, size, size);
      s.drawLine(colour, x1, y2, x1 + size, y2);
      if (!(row.cover ? win.coverOpen : win.standardOpen)) s.drawLine(colour, x2, y1, x2, y1 + size);
      textOutRect(s, font, lx + iconW, textY, THEME_LIST.w + 2 - iconW, FONT_HEIGHT, row.text, colour);
    } else {
      if (row.text === win.chosen) {
        const size = rh - 4 * 2;
        s.fillRect(colour, colour, lx + iconW + ((folderW - size) >> 1) - 1, top + 4, size, size);
      }
      textOutRect(s, font, lx + iconW + folderW, textY, THEME_LIST.w + 2 - iconW - folderW, FONT_HEIGHT, row.text, colour);
    }
    hit(ctx, active, lx, itemY, THEME_LIST.w, rh, { type: 'themeRow', row: id });
  });
  if (rows.length > visible) {
    const maxFirst = rows.length - visible;
    drawScrollIndicator(ctx, s, x + W - 25, ly + THEME_LIST.h - 18, Math.min(win.first, maxFirst), maxFirst);
  }
}

/** helpwnd.cpp / aboutwnd.cpp wrapText */
function wrapText(font: PreviewFont, text: string, width: number): string {
  let out = '';
  let start = 0;
  while (start <= text.length) {
    const end = text.indexOf('\n', start);
    const line = end < 0 ? text.slice(start) : text.slice(start, end);
    out += line.length === 0 ? '\n' : breakLine(font, line, width);
    if (end < 0) break;
    start = end + 1;
    if (start === text.length) out += '\n';
  }
  return out;
}

function helpText(): string {
  const items = Array.from({ length: 9 }, (_, i) => LANG('help window', `item${i}`)).join('\n') + '\n';
  return formatString(items, 7, 1, 2, 4, 3, 5, 6, 'START', 'SELECT');
}

function aboutText(dsi: boolean): string {
  const notAvailable = LANG('about window', 'not available');
  return [
    formatString(LANG('about window', 'app version'), '3.1.0'),
    formatString(LANG('about window', 'mode'), LANG('about window', dsi ? 'dsi mode' : 'ds mode'), LANG('about window', dsi ? 'sd card' : 'flashcart')),
    '',
    LANG('about window', 'installed loaders'),
    formatString(LANG('about window', 'nds-bootstrap'), LANG('message box', 'yes'), notAvailable),
    formatString(LANG('about window', 'pico-loader'), LANG('message box', 'no'), notAvailable),
    '',
    formatString(LANG('about window', 'help'), 'https://coderkei.github.io/akmenu-next-docs/'),
    formatString(LANG('about window', 'source'), 'https://github.com/coderkei/akmenu-next'),
    LANG('about window', 'license'),
    LANG('about window', 'license details'),
    '',
    LANG('about window', 'credits'),
  ].join('\n');
}

/** helpwnd.cpp cHelpWnd and aboutwnd.cpp cAboutWnd: scrolling text and an OK button. */
function drawTextWindow(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'text' }>, active: boolean) {
  const { ini, font } = ctx;
  const about = win.which === 'about';
  // mainwnd.cpp: both read [help window]; About defaults to 250×188 and is never smaller.
  let w = ini.ui('help window', 'w', about ? 250 : undefined);
  let h = ini.ui('help window', 'h', about ? 188 : undefined);
  if (about) {
    w = Math.max(w, 250);
    h = Math.max(h, 188);
  }
  const x = Math.trunc((SCREEN_W - w) / 2), y = Math.trunc((SCREEN_H - h) / 2);
  drawForm(ctx, s, x, y, w, h, LANG(about ? 'about window' : 'help window', 'title'));

  const ok = buttonSize(ctx, THEME_BITMAPS.button3, 46, 18);
  const okX = x + w - ok.w - 8, okY = y + h - ok.h - 4;

  const textW = w > 28 ? w - 28 : 1;
  const text = wrapText(font, about ? aboutText(ctx.state.console === 'dsi') : helpText(), textW);
  const lineCount = text.length ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
  const textX = x + 8;
  const textY = y + 17 + ini.ui('global settings', 'thickness');
  const textH = Math.max(0, okY - 2 - textY);
  const visible = Math.trunc(textH / FONT_HEIGHT);
  win.lineCount = lineCount;
  win.visible = visible;
  const maxFirst = Math.max(0, lineCount - visible);
  win.firstLine = Math.min(win.firstLine, maxFirst);
  const shown = text.split('\n').slice(win.firstLine, win.firstLine + visible).join('\n');
  textOutRect(s, font, textX, textY, textW, textH, shown, ini.ui('global settings', 'formTextColor'));
  if (lineCount > visible) {
    const g = (key: string) => ini.ui('global settings', key);
    const ix = x + w - 16, iy = textY + Math.trunc((textH - 12) / 2);
    drawChevron(s, ix, iy, true, win.firstLine > 0 ? g('spinBoxTextColor') : g('spinBoxNormalColor'));
    drawChevron(s, ix, iy + 8, false, win.firstLine < maxFirst ? g('spinBoxTextColor') : g('spinBoxNormalColor'));
  }
  drawPressButton(ctx, s, THEME_BITMAPS.button3, okX, okY, ok, '\x01 ' + LANG('setting window', 'ok'));
  hit(ctx, active, okX, okY, ok.w, ok.h, { type: 'key', key: 'A' });
}

/** progresswnd.cpp / progressbar.cpp: shown while a game loads (at 100% just before it starts). */
function drawProgress(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'progress' }>, active: boolean) {
  const { assets, ini, font } = ctx;
  const x = 14, y = 64, w = 226, h = 62;
  const bg = assets.bitmap(THEME_BITMAPS.progressWindow);
  if (bg) s.maskBlt(bg, x, y, bg.width, bg.height);
  const bar = assets.bitmap(THEME_BITMAPS.progressBar);
  if (bar) s.maskBltFrom(bar, 0, bar.pitch, bar.height, x + 4, y + 9, (100 * bar.width / 100) & 0xff, bar.height);
  textOutRect(s, font, x + 4, y + h - 24, w - 8, 12, win.tip, ini.ui('global settings', 'formTextColor'));
  // The DS would start the game here; any tap or button goes back.
  hit(ctx, active, 0, 0, SCREEN_W, SCREEN_H, { type: 'key', key: 'A' });
}

/** A banner title (UTF-16, up to 128 characters) in the language the menu uses. */
function bannerTitle(banner: Uint8Array | undefined): string {
  if (!banner || banner.length < BANNER_SIZE) return '';
  const at = 0x240 + bannerLanguage() * 0x100;
  let out = '';
  for (let i = 0; i < 128; i++) {
    const c = banner[at + i * 2] | (banner[at + i * 2 + 1] << 8);
    if (!c) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** rominfownd.cpp getFriendlyFileSizeString */
function friendlySize(size: number): string {
  if (size < 1024) return `${size} Byte`;
  const [divider, unit] = size < 1024 ** 2 ? [1024, ' KB'] : size < 1024 ** 3 ? [1024 ** 2, ' MB'] : [1024 ** 3, ' GB'];
  const whole = Math.trunc(size / divider);
  const frac = Math.trunc((size * 100 + (divider >> 1)) / divider) % 100;
  return `${whole}.${String(frac).padStart(2, '0')}${unit}`;
}

/**
 * rominfownd.cpp cRomInfoWnd, as cMainWnd::showFileInfo opens it. The made-up files have
 * made-up sizes and dates; folders and the home list entries show what the menu shows.
 */
function drawFileInfo(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'fileinfo' }>, active: boolean) {
  const { assets, ini, font } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const row = win.row;
  const w = ini.ui('rom info window', 'w');
  const h = ini.ui('rom info window', 'h');
  const x = Math.trunc((SCREEN_W - w) / 2), y = Math.trunc((SCREEN_H - h) / 2);
  drawForm(ctx, s, x, y, w, h, LANG('rom info', 'title'));

  const useTheme = ctx.next && setting(ctx.state, 'iconSource') === 0;
  const iconPath = THEME_ICONS[row.icon];
  drawIcon(assets, s, iconPath, x + 8, y + 24, false, useTheme, ctx.options.stockIcons);

  const isGba = row.icon === 'gbaRom';
  const isFolder = row.realName.endsWith('/');
  const homebrew = /\/Homebrew\//i.test(row.realName);
  // setRomInfo: a game's banner title; for anything else, the title in its icon's banner.
  const iconBytes = (useTheme ? assets.file(iconPath) : undefined) ?? ctx.options.stockIcons?.get(iconPath);
  const romText = row.isRom ? row.internalName : bannerTitle(iconBytes);
  const colour = g('formTextColor');
  textOutRect(s, font, x + 48, y + 22, w - 40, 40, romText, colour);

  // setFileInfo stops early for the card roots and anything that isn't a real file.
  const realFile = /^(fat|sd):\/./.test(row.realName);
  let saveText = '';
  if (realFile) {
    const name = isFolder ? row.showName.slice(0, -1) : row.showName;
    const date = formatString(LANG('rom info', 'file date'), 2026, 9, 1, 12, 0, 0);
    const size = isFolder ? 0 : isGba ? 16 * 1024 ** 2 : 64 * 1024 ** 2;
    textOutRect(s, font, x + 8, y + 64, w - 8, 40, name, colour);
    textOutRect(s, font, x + 8, y + 78, w - 8, 40, date, colour);
    textOutRect(s, font, x + 8, y + 92, w - 8, 40, formatString(LANG('rom info', 'file size'), friendlySize(size)), colour);
    const code = formatString(LANG('rom info', 'game code'), 'AKTE');
    if (row.isRom && !homebrew) saveText = `${formatString(LANG('rom info', 'save type'), LANG('save type', 'Unknown'))}, ${code}`;
    else if (isGba) saveText = code;
    textOutRect(s, font, x + 8, y + 106, w - 8, 40, saveText, colour);
  }

  // Buttons from the right: OK, then Save Type (DS games) or "to NOR" (GBA games).
  const ok = buttonSize(ctx, THEME_BITMAPS.button3, 46, 18);
  const btnY = y + h - ok.h - 4;
  const okX = x + w - (ok.w + 8);
  drawPressButton(ctx, s, THEME_BITMAPS.button3, okX, btnY, ok, '\x01 ' + LANG('setting window', 'ok'));
  hit(ctx, active, okX, btnY, ok.w, ok.h, { type: 'key', key: 'A' });
  if (row.isRom && !homebrew) {
    const st = buttonSize(ctx, THEME_BITMAPS.button4, 76, 18);
    drawPressButton(ctx, s, THEME_BITMAPS.button4, okX - (st.w + 8), btnY, st, '\x04 ' + LANG('setting window', 'savetype'));
  } else if (isGba) {
    const fl = buttonSize(ctx, THEME_BITMAPS.button3, 46, 18);
    drawPressButton(ctx, s, THEME_BITMAPS.button3, okX - (fl.w + 8), btnY, fl, '\x03 ' + LANG('exp window', 'flash to nor'));
  }
}

/** expwnd.cpp cExpWnd: the 3in1 expansion pack settings (Tools in the start menu). */
function drawTools(ctx: Ctx, s: Surface, active: boolean) {
  const { ini, font } = ctx;
  const w = 250, h = 130;
  const x = Math.trunc((SCREEN_W - w) / 2), y = Math.trunc((SCREEN_H - h) / 2);
  drawForm(ctx, s, x, y, w, h, LANG('exp window', 'title'));

  // Buttons from the right, 4 apart: Cancel, OK, RAM, SRAM.
  const cancel = buttonSize(ctx, THEME_BITMAPS.button3, 48, 18);
  const btnY = y + h - cancel.h - 4;
  let nextX = w;
  const buttons: [string, 'A' | 'B' | 'X' | 'Y', number][] = [
    ['\x02 ' + LANG('setting window', 'cancel'), 'B', 48],
    ['\x01 ' + LANG('setting window', 'ok'), 'A', 46],
    ['\x03 ' + LANG('exp window', 'ram'), 'X', 46],
    ['\x04 ' + LANG('exp window', 'sram'), 'Y', 46],
  ];
  for (const [label, key, defW] of buttons) {
    const size = buttonSize(ctx, THEME_BITMAPS.button3, defW, 18);
    nextX -= size.w + 4;
    drawPressButton(ctx, s, THEME_BITMAPS.button3, x + nextX, btnY, size, label);
    if (key === 'A' || key === 'B') hit(ctx, active, x + nextX, btnY, size.w, size.h, { type: 'key', key });
  }
  const spinW = ini.ui('setting window', 'spinBoxWidth');
  drawSpinBox(ctx, s, x + w - spinW - 4, y + 32, spinW, LANG('exp window', 'off'), false);
  textOutRect(s, font, x + 8, y + 32 + 3, Math.trunc(w / 2) + 8, 12, LANG('exp window', 'strength'), ini.ui('global settings', 'formTextColor'));
}

/** languagewnd.cpp cLanguageWnd, from the Language button in Settings. */
function drawLanguages(ctx: Ctx, s: Surface, win: Extract<Win, { kind: 'language' }>, active: boolean) {
  const { ini, font } = ctx;
  const g = (key: string) => ini.ui('global settings', key);
  const W = LANGUAGE_WINDOW.w, H = LANGUAGE_WINDOW.h;
  const x = Math.trunc((SCREEN_W - W) / 2), y = Math.trunc((SCREEN_H - H) / 2);
  drawForm(ctx, s, x, y, W, H, LANG('language', 'text'));

  const ok = buttonSize(ctx, THEME_BITMAPS.button2, 46, 18);
  const cancel = buttonSize(ctx, THEME_BITMAPS.button3, 54, 18);
  const cancelX = x + W - cancel.w - 4, cancelY = y + H - cancel.h - 4;
  const okX = x + W - cancel.w - ok.w - 8, okY = y + H - ok.h - 4;
  drawPressButton(ctx, s, THEME_BITMAPS.button2, okX, okY, ok, '\x03 ' + LANG('setting window', 'ok'));
  drawPressButton(ctx, s, THEME_BITMAPS.button3, cancelX, cancelY, cancel, '\x02 ' + LANG('setting window', 'cancel'));
  hit(ctx, active, okX, okY, ok.w, ok.h, { type: 'key', key: 'X' });
  hit(ctx, active, cancelX, cancelY, cancel.w, cancel.h, { type: 'key', key: 'B' });

  const L = LANGUAGE_LIST;
  const lx = x + L.x, ly = y + L.y;
  const b1 = g('listViewBarColor1'), b2 = g('listViewBarColor2');
  const barY = ly + (win.selected - win.first) * L.rowHeight - 1;
  for (let i = 0; i < L.rowHeight; i++) {
    if (i & 1) s.fillRect(b1, b2, lx - 2, barY + i, L.w + 4, 1);
    else s.fillRect(b2, b1, lx - 2, barY + i, L.w + 4, 1);
  }
  LANGUAGES.slice(win.first, win.first + L.visible).forEach((name, i) => {
    const id = win.first + i;
    const colour = id === win.selected ? g('listTextHighLightColor') : g('listTextColor');
    const itemY = ly + i * L.rowHeight;
    const textY = itemY + ((L.rowHeight - FONT_HEIGHT - 1) >> 1);
    // The chosen language gets a small square in the first column.
    if (name === win.chosen) {
      const mark = L.rowHeight - 8;
      s.fillRect(colour, colour, lx + ((15 - mark) >> 1), itemY - 1 + 4, mark, mark);
    }
    textOutRect(s, font, lx + 15, textY, L.w - 15, FONT_HEIGHT, name, colour);
    hit(ctx, active, lx, itemY, L.w, L.rowHeight, { type: 'languageRow', row: id });
  });
  if (LANGUAGES.length > L.visible) {
    const maxFirst = LANGUAGES.length - L.visible;
    drawScrollIndicator(ctx, s, x + W - 25, ly + L.h - 18, Math.min(win.first, maxFirst), maxFirst);
  }
}
