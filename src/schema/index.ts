// Every theme INI key the editor knows about. UI panels, validation and export
// are driven from this list, so adding a key should only mean adding it here.
//
// Each entry cites where akmenu-next reads it (paths under arm9/source/).
// `flavours` says which theme types understand it:
//   classic = Wood R4 / Acekard / AKAIO, next = AKMenu-Next.
// TODO: confirm the classic list against real Wood R4 / Acekard theme packs.

export type Flavour = 'classic' | 'next';
export type ThemeFile = 'uisettings.ini' | 'custom.ini';
export type KeyType = 'colour' | 'int' | 'bool' | 'string';

export interface KeyDef {
  key: string;
  type: KeyType;
  label: string;
  default?: number | string;
  min?: number;
  max?: number;
  help?: string;
  /** Fixed choices for a string key, shown as a dropdown. */
  options?: string[];
}

export interface SectionDef {
  file: ThemeFile;
  section: string;
  label: string;
  flavours: Flavour[];
  source: string;
  keys: KeyDef[];
}

const BOTH: Flavour[] = ['classic', 'next'];
const NEXT: Flavour[] = ['next'];

const rgb15 = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);

const pos = (x: number, y: number): KeyDef[] => [
  { key: 'x', type: 'int', label: 'X', default: x, min: 0, max: 255 },
  { key: 'y', type: 'int', label: 'Y', default: y, min: 0, max: 191 },
];

export const SCHEMA: SectionDef[] = [
  {
    file: 'uisettings.ini',
    section: 'global settings',
    label: 'Windows and menus',
    flavours: BOTH,
    source: 'ui/uisettings.cpp cUISettings::loadSettings',
    keys: [
      { key: 'formFrameColor', type: 'colour', label: 'Border', default: rgb15(23, 25, 4) },
      { key: 'formBodyColor', type: 'colour', label: 'Background', default: rgb15(30, 29, 22) },
      { key: 'formTextColor', type: 'colour', label: 'Text', default: rgb15(17, 12, 0) },
      { key: 'formTitleTextColor', type: 'colour', label: 'Title text', default: rgb15(11, 11, 11) },
      { key: 'buttonTextColor', type: 'colour', label: 'Button text', default: rgb15(17, 12, 0) },
      { key: 'spinBoxNormalColor', type: 'colour', label: 'Option box', help: 'Also the scroll arrows when you can’t scroll further.', default: rgb15(0, 0, 31) },
      { key: 'spinBoxFocusColor', type: 'colour', label: 'Selected option box', default: rgb15(0, 31, 0) },
      { key: 'spinBoxTextColor', type: 'colour', label: 'Option text', help: 'Also the scroll arrows and scroll bar.', default: rgb15(31, 31, 31) },
      { key: 'spinBoxTextHiLightColor', type: 'colour', label: 'Selected option text', default: rgb15(31, 31, 31) },
      { key: 'spinBoxFrameColor', type: 'colour', label: 'Option box border', help: 'Also the scroll bar’s outline.', default: rgb15(11, 11, 11) },
      { key: 'listViewBarColor1', type: 'colour', label: 'Selection bar 1', default: rgb15(0, 11, 19) },
      { key: 'listViewBarColor2', type: 'colour', label: 'Selection bar 2', default: rgb15(0, 5, 9) },
      { key: 'listTextColor', type: 'colour', label: 'Text', default: 0 },
      { key: 'listTextHighLightColor', type: 'colour', label: 'Selected text', default: 0 },
      { key: 'popMenuTextColor', type: 'colour', label: 'Text', default: 0 },
      { key: 'popMenuTextHighLightColor', type: 'colour', label: 'Selected text', default: rgb15(31, 31, 31) },
      { key: 'popMenuBarColor', type: 'colour', label: 'Selection bar', default: rgb15(0, 11, 19) },
      { key: 'thickness', type: 'int', label: 'Border thickness', help: 'In pixels. Option boxes use it too.', default: 1, min: 0, max: 8 },
      { key: 'showCalendar', type: 'bool', label: 'Show calendar (legacy)', default: 1, help: 'AKMenu-Next reads this but doesn’t use it; use each part’s own Show instead.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'main list',
    label: 'File list',
    flavours: BOTH,
    source: 'mainlist.cpp cMainList',
    keys: [
      { key: 'textColor', type: 'colour', label: 'Text', default: rgb15(7, 7, 7) },
      { key: 'textColorHilight', type: 'colour', label: 'Selected text', default: rgb15(31, 0, 31) },
      { key: 'selectionBarColor1', type: 'colour', label: 'Selection bar 1', default: rgb15(16, 20, 24) },
      { key: 'selectionBarColor2', type: 'colour', label: 'Selection bar 2', default: rgb15(20, 25, 0) },
      { key: 'selectionBarOpacity', type: 'int', label: 'Selection bar opacity (%)', default: 100, min: 0, max: 100 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'big clock',
    label: 'Big clock',
    flavours: BOTH,
    source: 'bigclock.cpp cBigClock::loadAppearance',
    keys: [
      ...pos(8, 80),
      { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Digits come from calendar/clock_numbers.bmp and clock_colon.bmp.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'am pm',
    label: 'AM/PM marker',
    flavours: BOTH,
    source: 'bigclock.cpp cBigClock::loadAppearance',
    keys: [
      ...pos(8, 80),
      { key: 'color', type: 'colour', label: 'Colour', default: rgb15(17, 12, 0) },
      { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Only appears when the 12-hour clock is on in the menu settings.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'calendar day',
    label: 'Calendar days',
    flavours: BOTH,
    source: 'calendar.cpp cCalendar::loadAppearance',
    keys: [
      ...pos(134, 34),
      { key: 'dw', type: 'int', label: 'Cell width', default: 16, min: 1, max: 255 },
      { key: 'dh', type: 'int', label: 'Cell height', default: 14, min: 1, max: 191 },
      { key: 'highlightColor', type: 'colour', label: 'Today highlight', default: 0xfc00 },
      { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Digits come from calendar/day_numbers.bmp.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'calendar dayx',
    label: 'Calendar date',
    flavours: BOTH,
    source: 'calendar.cpp cCalendar::loadAppearance',
    keys: [...pos(0, 28), { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Digits come from calendar/year_numbers.bmp.' }],
  },
  {
    file: 'uisettings.ini',
    section: 'calendar month',
    label: 'Calendar month',
    flavours: BOTH,
    source: 'calendar.cpp cCalendar::loadAppearance',
    keys: [...pos(12, 28), { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Digits come from calendar/year_numbers.bmp.' }],
  },
  {
    file: 'uisettings.ini',
    section: 'calendar year',
    label: 'Calendar year',
    flavours: BOTH,
    source: 'calendar.cpp cCalendar::loadAppearance',
    keys: [...pos(52, 28), { key: 'show', type: 'bool', label: 'Show', default: 0, help: 'Digits come from calendar/year_numbers.bmp.' }],
  },
  {
    file: 'uisettings.ini',
    section: 'start button',
    label: 'Start button',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::init',
    keys: [
      ...pos(0, 172),
      { key: 'w', type: 'int', label: 'Width', default: 48, min: 0, max: 256, help: 'Ignored when the button has an image.' },
      { key: 'h', type: 'int', label: 'Height', default: 10, min: 0, max: 192, help: 'Ignored when the button has an image.' },
      { key: 'textColor', type: 'colour', label: 'Text colour', default: 0x7fff },
      { key: 'file', type: 'string', label: 'Image file', default: 'none', help: 'A BMP in the theme folder: top half normal, bottom half pressed. “none” for no image.' },
      { key: 'text', type: 'string', label: 'Text', default: 'START', help: '“ini” uses the START text from the language file.' },
      { key: 'show', type: 'bool', label: 'Show', default: 1 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'start menu',
    label: 'Start menu',
    flavours: BOTH,
    source: 'startmenu.cpp cStartMenu::loadAppearance',
    keys: [
      ...pos(4, 4),
      { key: 'itemX', type: 'int', label: 'Item X', default: 4 },
      { key: 'itemY', type: 'int', label: 'Item Y', default: 12 },
      { key: 'itemHeight', type: 'int', label: 'Item height', default: 16, min: 1 },
      { key: 'itemWidth', type: 'int', label: 'Bar width', default: 0, min: 0, help: '0 makes the bar fill the menu, less the inset on each side.' },
      { key: 'barLeft', type: 'int', label: 'Bar inset', default: 2, min: 0 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'brightness btn',
    label: 'Brightness button',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::init',
    keys: [
      ...pos(240, 1),
      { key: 'w', type: 'int', label: 'Width', default: 16, min: 0, max: 256, help: 'Replaced by the size of brightness.bmp when it exists.' },
      { key: 'h', type: 'int', label: 'Height', default: 16, min: 0, max: 192, help: 'Replaced by the size of brightness.bmp when it exists.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'folderup btn',
    label: 'Folder up button',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::init',
    keys: [
      ...pos(0, 2),
      { key: 'w', type: 'int', label: 'Width', default: 32, min: 0, max: 256, help: 'Touch area. folder_up.bmp is drawn at its own size.' },
      { key: 'h', type: 'int', label: 'Height', default: 16, min: 0, max: 192, help: 'Touch area. folder_up.bmp is drawn at its own size.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'folder text',
    label: 'Folder name',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::init',
    keys: [
      ...pos(20, 2),
      { key: 'w', type: 'int', label: 'Width', default: 160, min: 0, max: 256 },
      { key: 'h', type: 'int', label: 'Height', default: 16, min: 0, max: 192 },
      { key: 'color', type: 'colour', label: 'Colour', default: 0 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'setting window',
    label: 'Settings window',
    flavours: BOTH,
    source: 'settingwnd.cpp cSettingWnd::cSettingWnd',
    keys: [
      { key: 'spinBoxWidth', type: 'int', label: 'Option box width', default: 108, min: 36, max: 252 },
      { key: 'simpleTabs', type: 'bool', label: 'Hide title bar images when there are tabs', default: 0 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'rom info window',
    label: 'File Info window',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::showFileInfo',
    keys: [
      { key: 'w', type: 'int', label: 'Width', default: 240, min: 1, max: 256 },
      { key: 'h', type: 'int', label: 'Height', default: 144, min: 1, max: 192 },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'help window',
    label: 'Help and About windows',
    flavours: BOTH,
    source: 'mainwnd.cpp cMainWnd::startMenuItemClicked',
    keys: [
      { key: 'w', type: 'int', label: 'Width', default: 200, min: 1, max: 256, help: 'The About window is at least 250 wide.' },
      { key: 'h', type: 'int', label: 'Height', default: 160, min: 1, max: 192, help: 'The About window is at least 188 tall.' },
    ],
  },
  {
    file: 'uisettings.ini',
    section: 'disk icon',
    label: 'Card activity icon',
    flavours: BOTH,
    source: 'diskicon.cpp cDiskIcon::loadAppearance',
    keys: [...pos(238, 172)],
  },
  {
    file: 'uisettings.ini',
    section: 'cover',
    label: 'Game cover',
    flavours: NEXT,
    source: 'ui/uisettings.cpp cUISettings::loadSettings',
    keys: [
      { key: 'x', type: 'int', label: 'X', min: 0, max: 255, help: 'Leave empty to centre.' },
      { key: 'y', type: 'int', label: 'Y', min: 0, max: 191, help: 'Leave empty to centre.' },
      { key: 'darken', type: 'int', label: 'Darken background (%)', default: 0, min: 0, max: 100 },
      { key: 'fade', type: 'int', label: 'Fade the cover (%)', default: 0, min: 0, max: 100 },
    ],
  },
  {
    file: 'custom.ini',
    section: 'user name',
    label: 'Username',
    flavours: NEXT,
    source: 'userwnd.cpp cUserWindow::init',
    keys: [
      ...pos(0, 0),
      { key: 'color', type: 'colour', label: 'Colour', default: 0x7fff },
      { key: 'show', type: 'bool', label: 'Show', default: 0 },
    ],
  },
  {
    file: 'custom.ini',
    section: 'date',
    label: 'Date and time',
    flavours: NEXT,
    source: 'userwnd.cpp cUserWindow::init',
    keys: [
      ...pos(0, 0),
      { key: 'color', type: 'colour', label: 'Colour', default: 0x7fff },
      { key: 'show', type: 'bool', label: 'Show', default: 0 },
      { key: 'format', type: 'string', label: 'Format', default: 'DD/MM/YYYY', options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY/MM/DD'] },
      { key: 'showTime', type: 'bool', label: 'Show time', default: 1 },
      { key: 'font', type: 'bool', label: 'Use number pictures', default: 0, help: 'Draws the date with calendar/date_numbers.bmp (9×14 digits) instead of text. The time isn’t shown then.' },
    ],
  },
  {
    file: 'custom.ini',
    section: 'custom text',
    label: 'Custom text',
    flavours: NEXT,
    source: 'userwnd.cpp cUserWindow::init',
    keys: [
      { key: 'text', type: 'string', label: 'Text', default: '' },
      ...pos(0, 0),
      { key: 'w', type: 'int', label: 'Width', default: 0, min: 0, max: 256 },
      { key: 'h', type: 'int', label: 'Height', default: 0, min: 0, max: 192 },
      { key: 'color', type: 'colour', label: 'Colour', default: 0 },
      { key: 'show', type: 'bool', label: 'Show', default: 0 },
    ],
  },
  {
    file: 'custom.ini',
    section: 'custom picture',
    label: 'Custom picture',
    flavours: NEXT,
    source: 'userwnd.cpp cUserWindow::init',
    keys: [
      { key: 'file', type: 'string', label: 'File (full SD path)', default: '', help: 'e.g. /_nds/akmenunext/ui/My Theme/me.bmp. Max 10KB, roughly 64×64. The preview finds it if it’s in the theme.' },
      ...pos(0, 0),
      { key: 'show', type: 'bool', label: 'Show', default: 0 },
    ],
  },
];

/** Theme files that only AKMenu-Next understands, dropped from Classic exports. */
export const NEXT_ONLY_PATHS: RegExp[] = [
  /^custom\.ini$/i,
  /^icons\//i,
  /^bgm\d?\.(wav|bcstm)$/i,
  /^calendar\/date_numbers\.bmp$/i,
  /^custom_picture\.bmp$/i,
];

/**
 * Where an uploaded custom picture goes in the theme. custom.ini needs its full SD path
 * (userwnd.cpp reads it with fopen), which is the theme's folder plus this name.
 */
export const CUSTOM_PICTURE = 'custom_picture.bmp';
/** userwnd.cpp: pictures over 10KB are ignored. */
export const CUSTOM_PICTURE_MAX_BYTES = 10 * 1024;

export interface ImageSlot {
  path: string;
  label: string;
  /** What the menu expects, in plain words. */
  help: string;
  /**
   * How an uploaded picture is fitted: 'cover' scales and crops to width × height,
   * 'stretch' squashes it to exactly that, 'none' keeps the picture's own size.
   */
  fit: 'cover' | 'stretch' | 'none';
  width?: number;
  height?: number;
  /** A full-screen picture: shown larger, and pure black is flagged. */
  screen?: boolean;
  /** A strip of the digits 0–9 stacked top to bottom (calendar.cpp, bigclock.cpp). */
  digits?: boolean;
  /**
   * The menu won't use a theme without it (theme.cpp kRequiredThemeAssets): it must load
   * and fit within maxWidth × maxHeight, or the menu switches to another theme.
   */
  required?: { maxWidth: number; maxHeight: number };
}

const REQ = { maxWidth: 256, maxHeight: 192 };
const REQ_DIGITS = { maxWidth: 256, maxHeight: 1920 };

/** Every bitmap a theme can have (systemfilenames.h), with how the menu uses it. */
export const IMAGE_SLOTS: ImageSlot[] = [
  { path: 'upper_screen.bmp', label: 'Top screen', help: '256×192.', fit: 'cover', width: 256, height: 192, screen: true, required: REQ },
  { path: 'lower_screen.bmp', label: 'Bottom screen', help: '256×192.', fit: 'cover', width: 256, height: 192, screen: true, required: REQ },
  { path: 'gbaframe.bmp', label: 'GBA game border', help: '256×192. Shown on the other screen while a GBA game plays (gbaloader.cpp).', fit: 'cover', width: 256, height: 192, screen: true },
  { path: 'calendar/clock_numbers.bmp', label: 'Clock digits', help: 'The digits 0 to 9 stacked top to bottom, all the same height.', fit: 'none', digits: true, required: REQ_DIGITS },
  { path: 'calendar/clock_colon.bmp', label: 'Clock colon', help: 'Blinks twice a second, drawn at its own size.', fit: 'none', required: REQ },
  { path: 'calendar/day_numbers.bmp', label: 'Day digits', help: 'For the days of the month: 0 to 9 stacked top to bottom.', fit: 'none', digits: true, required: REQ_DIGITS },
  { path: 'calendar/year_numbers.bmp', label: 'Date, month and year digits', help: '0 to 9 stacked top to bottom.', fit: 'none', digits: true, required: REQ_DIGITS },
  { path: 'calendar/date_numbers.bmp', label: 'Date digits', help: 'Exactly 9 wide with 14-tall digits: 9×140, 0 to 9 top to bottom.', fit: 'stretch', width: 9, height: 140, digits: true },
  { path: 'brightness.bmp', label: 'Brightness button picture', help: 'Drawn at its own size.', fit: 'none', required: REQ },
  { path: 'folder_up.bmp', label: 'Folder up picture', help: 'Drawn at its own size.', fit: 'none', required: REQ },
  { path: 'card_icon_blue.bmp', label: 'Card activity picture', help: 'Up to 32×32.', fit: 'none', required: { maxWidth: 32, maxHeight: 32 } },
  { path: 'menu_bg.bmp', label: 'Start menu background', help: 'Its size is the menu’s size.', fit: 'none', required: REQ },
  { path: 'title_left.bmp', label: 'Title bar, left end', help: 'Its height sets the title bar’s height.', fit: 'none', required: REQ },
  { path: 'title_bg.bmp', label: 'Title bar, middle', help: '1 or 2 pixels wide: each row’s colour fills that row of the bar.', fit: 'none', required: REQ },
  { path: 'title_right.bmp', label: 'Title bar, right end', help: 'As tall as the left end.', fit: 'none', required: REQ },
  { path: 'btn2.bmp', label: 'Small button', help: 'Top half normal, bottom half pressed. Used for OK in Themes.', fit: 'none', required: REQ },
  { path: 'btn3.bmp', label: 'Button', help: 'Top half normal, bottom half pressed. Most OK, Cancel, Yes and No buttons.', fit: 'none', required: REQ },
  { path: 'btn4.bmp', label: 'Wide button', help: 'Top half normal, bottom half pressed.', fit: 'none', required: REQ },
  { path: 'spin_btn_left.bmp', label: 'Left arrow', help: 'Drawn at its own size; about 18×18.', fit: 'none', required: REQ },
  { path: 'spin_btn_right.bmp', label: 'Right arrow', help: 'Drawn at its own size; about 18×18.', fit: 'none', required: REQ },
  { path: 'progress_wnd.bmp', label: 'Loading window', help: 'Drawn at its own size from (14, 64); about 226×62.', fit: 'none', required: REQ },
  { path: 'progress_bar.bmp', label: 'Loading bar', help: 'Drawn at its own size inside the loading window, filling left to right.', fit: 'none', required: REQ },
];

/** File list icon names, as shown in the editor. */
export const ICON_LABELS: Record<string, string> = {
  'icons/microsd_banner.bin': 'microSD card',
  'icons/favourites_banner.bin': 'Favourites',
  'icons/recents_banner.bin': 'Recently played',
  'icons/gba_banner.bin': 'Slot-2 card',
  'icons/nand_banner.bin': 'Slot-1 card',
  'icons/folder_banner.bin': 'Folder',
  'icons/nds_banner.bin': 'DS game',
  'icons/unknown_nds_banner.bin': 'Unreadable DS game',
  'icons/gbarom_banner.bin': 'GBA game',
  'icons/nds_save_banner.bin': 'Save file',
  'icons/unknown_banner.bin': 'Other file',
};

/** Bitmaps the menu loads from the theme folder (systemfilenames.h SFN_*). */
export const THEME_BITMAPS = {
  upperScreen: 'upper_screen.bmp',
  lowerScreen: 'lower_screen.bmp',
  titleLeft: 'title_left.bmp',
  titleMiddle: 'title_bg.bmp',
  titleRight: 'title_right.bmp',
  button2: 'btn2.bmp',
  button3: 'btn3.bmp',
  button4: 'btn4.bmp',
  spinLeft: 'spin_btn_left.bmp',
  spinRight: 'spin_btn_right.bmp',
  brightness: 'brightness.bmp',
  folderUp: 'folder_up.bmp',
  startMenu: 'menu_bg.bmp',
  clockNumbers: 'calendar/clock_numbers.bmp',
  clockColon: 'calendar/clock_colon.bmp',
  dayNumbers: 'calendar/day_numbers.bmp',
  yearNumbers: 'calendar/year_numbers.bmp',
  dateNumbers: 'calendar/date_numbers.bmp',
  cardIcon: 'card_icon_blue.bmp',
  progressWindow: 'progress_wnd.bmp',
  progressBar: 'progress_bar.bmp',
  gbaFrame: 'gbaframe.bmp',
} as const;

/**
 * File list icons a theme can supply in icons/ (iconassets.cpp loadIconAsset, used by
 * mainlist.cpp and dsrom.cpp). Each is a 0x840-byte NDS banner; only the icon is used.
 * Without one the menu falls back to _nds/akmenunext/icons/, then its built-in icon.
 */
export const THEME_ICONS = {
  microSd: 'icons/microsd_banner.bin',
  slot1: 'icons/nand_banner.bin',
  slot2: 'icons/gba_banner.bin',
  favourites: 'icons/favourites_banner.bin',
  recent: 'icons/recents_banner.bin',
  folder: 'icons/folder_banner.bin',
  ndsRom: 'icons/nds_banner.bin',
  unknownNds: 'icons/unknown_nds_banner.bin',
  gbaRom: 'icons/gbarom_banner.bin',
  save: 'icons/nds_save_banner.bin',
  unknown: 'icons/unknown_banner.bin',
} as const;

/**
 * Theme music (thememusic.cpp cThemeMusic::start): bgm, bgm1 … bgm9 in the theme folder,
 * each as .bcstm and/or .wav, so up to 20 files. One is picked at random each time the
 * menu starts. Sample rates outside 1024–48000 Hz are ignored (openSource).
 */
export const MUSIC = {
  stems: ['bgm', 'bgm1', 'bgm2', 'bgm3', 'bgm4', 'bgm5', 'bgm6', 'bgm7', 'bgm8', 'bgm9'],
  extensions: ['.bcstm', '.wav'],
  minSampleRate: 1024,
  maxSampleRate: 48000,
} as const;

/** sizeof(tNDSBanner): shorter icon files are ignored by loadIconAsset. */
export const BANNER_SIZE = 0x840;

export function sectionsFor(flavour: Flavour): SectionDef[] {
  return SCHEMA.filter((s) => s.flavours.includes(flavour));
}
