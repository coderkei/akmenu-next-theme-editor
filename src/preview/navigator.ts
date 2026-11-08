// The menu's behaviour, so the preview can be driven like the real thing: the file
// list, folders, the start menu and the windows it opens. Each part follows the menu
// code it's named after (paths under arm9/source/). The SD card is a small made-up one.

import { LANG, LANGUAGES } from './lang';

export type ViewMode = 'list' | 'icon' | 'internal' | 'smallIcon';
/** globalsettings.h TViewMode order: Old school, Modern, Internal, Small Icons. */
export const VIEW_MODES: ViewMode[] = ['list', 'icon', 'internal', 'smallIcon'];

export type Key = 'A' | 'B' | 'X' | 'Y' | 'L' | 'R' | 'START' | 'SELECT' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type IconName =
  | 'microSd' | 'slot1' | 'slot2' | 'favourites' | 'recent' | 'folder'
  | 'ndsRom' | 'unknownNds' | 'gbaRom' | 'save' | 'unknown';

export interface Row {
  showName: string;
  /** What VM_INTERNAL shows: the ROM banner title, or the show name. */
  internalName: string;
  realName: string;
  icon: IconName;
  isRom: boolean;
}

interface Entry {
  name: string;
  title?: string;
  icon: IconName;
  isRom?: boolean;
}

// A made-up SD card. Folders end in '/'.
const SD: Record<string, Entry[]> = {
  'fat:/': [
    { name: '_nds/', icon: 'folder' },
    { name: 'Games/', icon: 'folder' },
    { name: 'Homebrew/', icon: 'folder' },
  ],
  'fat:/_nds/': [{ name: 'akmenunext/', icon: 'folder' }],
  'fat:/_nds/akmenunext/': [],
  'fat:/Games/': [
    { name: 'Bubble Garden.nds', title: 'Bubble Garden\nPuzzle Edition\nAKTheme Studio', icon: 'ndsRom', isRom: true },
    { name: 'Castle Climber.nds', title: 'Castle Climber\nAKTheme Studio', icon: 'ndsRom', isRom: true },
    { name: 'Desert Drift.nds', title: 'Desert Drift\nAKTheme Studio', icon: 'ndsRom', isRom: true },
    { name: 'Moon Miner.nds', title: 'Moon Miner\nAKTheme Studio', icon: 'ndsRom', isRom: true },
    { name: 'Pocket Racer.gba', icon: 'gbaRom' },
    { name: 'Sky Courier.nds', title: 'Sky Courier\nAKTheme Studio', icon: 'ndsRom', isRom: true },
    { name: 'Tiny Tactics.nds', title: 'Tiny Tactics\nAKTheme Studio', icon: 'ndsRom', isRom: true },
  ],
  'fat:/Homebrew/': [
    { name: 'Paint Pad.nds', title: 'Paint Pad\nHomebrew', icon: 'ndsRom', isRom: true },
    { name: 'Tile Viewer.nds', title: 'Tile Viewer\nHomebrew', icon: 'ndsRom', isRom: true },
  ],
};

/** The made-up card is the same whether it's fat:/ (flashcart) or sd:/ (DSi). */
const sdDir = (dir: string) => dir.replace(/^sd:\//, 'fat:/');

function entryFor(path: string): Entry | undefined {
  const cut = path.lastIndexOf('/', path.length - 2);
  return SD[sdDir(path.slice(0, cut + 1))]?.find((e) => e.name === path.slice(cut + 1));
}

function rowFor(dir: string, e: Entry): Row {
  const isRom = !!e.isRom;
  return { showName: e.name, internalName: isRom && e.title ? e.title : e.name, realName: dir + e.name, icon: e.icon, isRom };
}

/** stringComp in language.cpp: case-insensitive. */
const stringComp = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en');

// ------------------------------------------------------------- settings data

/** What the preview runs on: a DS-mode flashcart, or a DSi from its SD card. */
export type Console = 'ds' | 'dsi';

export interface SettingDef {
  /** Stable name (as in globalsettings.ini where there is one); values are stored by it. */
  key: string;
  label: string;
  values: string[];
  /** Index into values the menu starts with (globalsettings.cpp defaults). */
  def: number;
  /** A button (Language) rather than a spin box. */
  button?: boolean;
}

/** Settings the preview acts on. */
export type PreviewSetting = 'viewMode' | 'iconSource' | 'clock12h' | 'showCovers';

export interface SettingTab {
  title: string;
  items: SettingDef[];
}

const onOff = () => [LANG('switches', 'Disable'), LANG('switches', 'Enable')];

/** cMainWnd::setParam. Some loader settings only appear on a flashcart, some only on DSi. */
export function settingTabs(console: Console, language: string): SettingTab[] {
  const flashcart = console === 'ds';
  const dsi = console === 'dsi';
  const loader: SettingDef[] = [
    ...(flashcart ? [{ key: 'pico', label: LANG('nds bootstrap', 'loader'), values: ['nds-bootstrap', 'Pico-Loader'], def: 0 }] : []),
    { key: 'nightly', label: LANG('nds bootstrap', 'text'), values: [LANG('nds bootstrap', 'release'), LANG('nds bootstrap', 'nightly')], def: 0 },
    { key: 'dsonly', label: LANG('nds bootstrap', 'dsmode'), values: onOff(), def: 0 },
    { key: 'boostcpu', label: LANG('nds bootstrap', 'boostcpu'), values: onOff(), def: 0 },
    { key: 'cardReadDma', label: LANG('nds bootstrap', 'carddma'), values: [LANG('switches', 'Auto'), LANG('switches', 'Enable'), LANG('switches', 'Disable')], def: 0 },
    { key: 'languageOverride', label: LANG('override', 'text'), values: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => LANG('override', String(i))), def: 0 },
    ...(dsi
      ? [
          { key: 'phatCol', label: LANG('nds bootstrap', 'phatCol'), values: onOff(), def: 0 },
          { key: 'dsiWareUnlaunch', label: LANG('nds bootstrap', 'dsiware booter'), values: [LANG('nds bootstrap', 'nds-bootstrap'), LANG('nds bootstrap', 'Unlaunch')], def: 0 },
        ]
      : []),
    { key: 'hbstrap', label: LANG('patches', 'hbstrap'), values: [LANG('patches', 'default'), LANG('patches', 'ndshb'), 'Pico-Loader'], def: 0 },
  ];
  return [
    {
      title: LANG('system setting', 'title'),
      items: [
        { key: 'langDirectory', label: LANG('language', 'text'), values: [language], def: 0, button: true },
        { key: 'resethotkey', label: LANG('resethotkey', 'text'), values: [0, 1, 2, 3, 4, 5, 6].map((i) => LANG('resethotkey', String(i))), def: 0 },
        { key: 'slot2mode', label: LANG('gba settings', 'mode'), values: ['modeask', 'modegba', 'modends'].map((k) => LANG('gba settings', k)), def: 0 },
      ],
    },
    {
      title: LANG('interface settings', 'title'),
      items: [
        { key: 'viewMode', label: LANG('interface settings', 'filelist style'), values: ['oldschool', 'modern', 'internal', 'small'].map((k) => LANG('interface settings', k)), def: 2 },
        { key: 'scrollSpeed', label: LANG('interface settings', 'scrolling speed'), values: ['fast', 'medium', 'slow'].map((k) => LANG('scrolling', k)), def: 0 },
        { key: 'iconSource', label: LANG('interface settings', 'icon source'), values: ['theme icons', 'global icons', 'built in icons'].map((k) => LANG('interface settings', k)), def: 0 },
        { key: 'Animation', label: LANG('interface settings', 'animation'), values: onOff(), def: 1 },
        { key: 'clock12h', label: LANG('interface settings', '12 hour'), values: onOff(), def: 0 },
        { key: 'showCovers', label: LANG('interface settings', 'covers'), values: onOff(), def: 1 },
        { key: 'playThemeMusic', label: LANG('interface settings', 'theme music'), values: onOff(), def: 1 },
      ],
    },
    {
      title: LANG('file settings', 'title'),
      items: [
        { key: 'fileListType', label: LANG('filelist type', 'text'), values: [0, 1, 2].map((i) => LANG('filelist type', `item${i}`)), def: 0 },
        { key: 'showHiddenFiles', label: LANG('file settings', 'show hidden files'), values: onOff(), def: 0 },
        { key: 'saveext', label: LANG('file settings', 'save extension'), values: ['.nds.sav', '.sav'], def: 1 },
        { key: 'savedir', label: LANG('file settings', 'use saves folder'), values: [LANG('message box', 'no'), LANG('message box', 'yes')], def: 0 },
        { key: 'fileSortMode', label: LANG('file settings', 'sort by'), values: ['sort name', 'sort game title', 'sort date asc', 'sort date desc'].map((k) => LANG('file settings', k)), def: 0 },
      ],
    },
    { title: LANG('setting window', 'game loader'), items: loader },
    {
      title: LANG('gba settings', 'title'),
      items: [
        { key: 'ignorecrc16', label: LANG('nds bootstrap', 'ignorecrc16'), values: onOff(), def: 0 },
        { key: 'cheats', label: LANG('patches', 'cheating system'), values: onOff(), def: 0 },
        { key: 'saveSlotOverride', label: LANG('gba settings', 'save slot'), values: [LANG('switches', 'Disable'), '0', '1', '2', '3'], def: 0 },
        { key: 'autorunWithLastRom', label: LANG('autorun', 'text'), values: onOff(), def: 0 },
        { key: 'overridePluginDefaults', label: LANG('gba settings', 'override plugin defaults'), values: onOff(), def: 0 },
      ],
    },
  ];
}

/** The Settings window's tabs for this state's console and language. */
export function tabsFor(s: MenuState): SettingTab[] {
  return settingTabs(s.console, s.language);
}

/** A setting's value: what the user picked, or the menu's default. */
export function settingValue(s: MenuState, def: SettingDef, values: Record<string, number> = s.settings): number {
  return values[def.key] ?? def.def;
}

/** settingwnd.h */
export const SETTINGS = { maxVisible: 5, itemPitch: 20, height: 165, width: 252, scrollY: 124 };

/** The languages the menu could have installed (languagewnd.cpp lists language/*). */
export { LANGUAGES };

// --------------------------------------------------------------------- state

export const MB_OK = 1, MB_CANCEL = 2, MB_YES = 4, MB_NO = 8;

export type Win =
  | { kind: 'message'; title: string; text: string; style: number; onOk?: 'applySettings' | 'applyLanguage' }
  | { kind: 'settings'; tab: number; focus: number[]; first: number[]; values: Record<string, number> }
  | { kind: 'themes'; standardOpen: boolean; coverOpen: boolean; selected: number; first: number; chosen: string }
  | { kind: 'text'; which: 'help' | 'about'; firstLine: number; lineCount: number; visible: number }
  | { kind: 'progress'; tip: string; path: string }
  | { kind: 'fileinfo'; row: Row }
  | { kind: 'tools' }
  | { kind: 'language'; selected: number; first: number; chosen: string };

export interface MenuState {
  /** The user's menu settings (globalsettings.ini) by key; missing ones are the defaults. */
  settings: Record<string, number>;
  console: Console;
  /** The menu's language (a language/ folder name). */
  language: string;
  dir: string;
  selected: number;
  first: number;
  favourites: string[];
  recent: string[];
  /** Selected start menu item while it's open. */
  startMenu: number | null;
  /** Open windows, topmost last. */
  windows: Win[];
}

export function newMenuState(console: Console = 'ds', language = 'English'): MenuState {
  return {
    settings: {},
    console,
    language,
    dir: '',
    selected: 0,
    first: 0,
    favourites: [],
    recent: [],
    startMenu: null,
    windows: [],
  };
}

/** A setting the preview uses. */
export function setting(state: MenuState, key: PreviewSetting): number {
  for (const tab of tabsFor(state)) {
    const def = tab.items.find((d) => d.key === key);
    if (def) return settingValue(state, def);
  }
  return 0;
}

export function setSetting(state: MenuState, key: PreviewSetting, value: number) {
  state.settings[key] = value;
}

export const viewMode = (s: MenuState): ViewMode => VIEW_MODES[setting(s, 'viewMode')];

/** cMainList::setViewMode row heights. */
export const ROW_HEIGHT: Record<ViewMode, number> = { list: 15, smallIcon: 18, icon: 38, internal: 38 };
export const LIST = { x: 4, y: 20, w: 248, h: 152 };

export function visibleRows(s: MenuState): number {
  return Math.trunc(LIST.h / ROW_HEIGHT[viewMode(s)]);
}

// ----------------------------------------------------------------- file list

/** cMainList::enterDir */
export function listRows(s: MenuState): Row[] {
  if (s.dir === '') {
    // cMainList's constructor: a DS-mode flashcart lists its card, favourites, recent and
    // Slot-2; a DSi on its own SD card lists that card ("DSi SD"), then Slot-1 last.
    const home: [string, string, IconName][] =
      s.console === 'dsi'
        ? [
            ['DSi SD', 'sd:/', 'microSd'],
            [LANG('mainlist', 'favorites'), 'favorites:/', 'favourites'],
            [LANG('mainlist', 'recent'), 'recent:/', 'recent'],
            [LANG('mainlist', 'slot1 card'), 'slot1:/', 'slot1'],
          ]
        : [
            [LANG('mainlist', 'microsd card'), 'fat:/', 'microSd'],
            [LANG('mainlist', 'favorites'), 'favorites:/', 'favourites'],
            [LANG('mainlist', 'recent'), 'recent:/', 'recent'],
            [LANG('mainlist', 'slot2 card'), 'slot2:/', 'slot2'],
          ];
    return home.map(([name, real, icon]) => ({ showName: name, internalName: name, realName: real, icon, isRom: false }));
  }
  if (s.dir === 'favorites:/' || s.dir === 'recent:/') {
    const list = s.dir === 'favorites:/' ? s.favourites : s.recent;
    const rows = list.map((real): Row => {
      const cut = real.lastIndexOf('/', real.length - 2);
      const e = entryFor(real);
      const showName = cut < 0 ? real : real.slice(cut + 1);
      const isRom = !!e?.isRom;
      return { showName, internalName: isRom && e?.title ? e.title : showName, realName: real, icon: e?.icon ?? 'folder', isRom };
    });
    return s.dir === 'recent:/' ? rows : sortRows(rows);
  }
  return sortRows((SD[sdDir(s.dir)] ?? []).map((e) => rowFor(s.dir, e)));
}

function sortRows(rows: Row[]): Row[] {
  const isDir = (r: Row) => r.showName.endsWith('/');
  return rows.sort((a, b) => (isDir(a) !== isDir(b) ? (isDir(a) ? -1 : 1) : stringComp(a.showName, b.showName)));
}

/** cListView::scrollTo */
function scrollTo(s: MenuState, id: number) {
  const n = listRows(s).length;
  if (!n) return;
  const visible = visibleRows(s);
  if (id > n - 1) id = n - 1;
  if (id > n - visible) id = n - visible;
  if (id < 0) id = 0;
  s.first = id;
}

/** cListView::selectRow */
export function selectRow(s: MenuState, id: number) {
  const n = listRows(s).length;
  if (!n) return;
  if (id > n - 1) id = n - 1;
  if (id < 0) id = 0;
  const last = Math.min(s.first + visibleRows(s) - 1, n - 1);
  if (id < s.first || id > last) scrollTo(s, id - (s.selected - s.first));
  s.selected = id;
}

function enterDir(s: MenuState, dir: string) {
  if (dir === '...') dir = '';
  if (dir === 'slot1:/') return; // the DS would start the game card; the preview stays put
  if (dir === 'slot2:/') {
    // onFolderChanged: no GBA cartridge in the preview's Slot-2.
    s.windows.push({ kind: 'message', title: LANG('no gba card', 'title'), text: LANG('no gba card', 'text'), style: MB_OK });
    return;
  }
  s.dir = dir;
  s.selected = 0;
  s.first = 0;
}

/** cMainList::backParentDir */
function backParentDir(s: MenuState) {
  if (s.dir === '') return;
  const old = s.dir;
  if (old === 'fat:/' || old === 'sd:/' || old === 'favorites:/' || old === 'recent:/') {
    enterDir(s, '');
    selectRow(s, old === 'favorites:/' ? 1 : old === 'recent:/' ? 2 : 0);
    return;
  }
  const parent = old.slice(0, old.lastIndexOf('/', old.length - 2) + 1);
  enterDir(s, parent);
  const i = listRows(s).findIndex((r) => parent + r.showName === old);
  if (i >= 0) selectRow(s, i);
}

export function selectedRow(s: MenuState): Row | undefined {
  return listRows(s)[s.selected];
}

/** cMainWnd::launchSelected */
function launchSelected(s: MenuState) {
  const row = selectedRow(s);
  if (!row) return;
  if (row.realName.endsWith('/')) return enterDir(s, row.realName);
  if (!row.isRom) return;
  s.windows.push({ kind: 'progress', tip: `Loading ${row.showName}...`, path: row.realName });
}

/** cRecent::AddToRecent */
function addToRecent(s: MenuState, path: string) {
  s.recent = [path, ...s.recent.filter((p) => p !== path)].slice(0, 10);
}

// --------------------------------------------------------------- themes list

export interface ThemeRow {
  folder: boolean;
  cover: boolean;
  text: string;
}

/** cThemeWnd::generateList, with the theme being edited as the one installed theme. */
export function themeRows(w: Extract<Win, { kind: 'themes' }>, themeName: string, coverTheme: boolean): ThemeRow[] {
  const rows: ThemeRow[] = [{ folder: true, cover: false, text: LANG('theme selector', 'Standard Themes') }];
  if (w.standardOpen && !coverTheme) rows.push({ folder: false, cover: false, text: themeName });
  rows.push({ folder: true, cover: true, text: LANG('theme selector', 'Game Cover Themes') });
  if (w.coverOpen && coverTheme) rows.push({ folder: false, cover: true, text: themeName });
  return rows;
}
/** themewnd.cpp: the window is 256×179; the list sits at (4, 38) inside it. */
export const THEMES = { w: 256, h: 179 };
export const THEME_LIST = { x: 4, y: 38, w: THEMES.w - 32, h: THEMES.h - 67, rowHeight: 15 };

// -------------------------------------------------------------------- input

/** What a tap on the bottom screen hits, found while drawing. */
export type Action =
  | { type: 'key'; key: Key }
  | { type: 'listTap'; row: number; head: boolean }
  | { type: 'startMenuItem'; index: number }
  | { type: 'closeStartMenu' }
  | { type: 'settingsItem'; item: number; delta: number; tap?: boolean }
  | { type: 'languageRow'; row: number }
  | { type: 'settingsTab'; delta: number }
  | { type: 'settingsOk' }
  | { type: 'themeRow'; row: number }
  | { type: 'none' };

export interface Env {
  themeName: string;
  coverTheme: boolean;
}

/** Applies a button press or tap. Returns true if anything changed. */
export function act(s: MenuState, action: Action, env: Env): boolean {
  lastEnv = env;
  const win = s.windows[s.windows.length - 1];
  if (action.type === 'none') return false;
  if (action.type === 'key') return win ? windowKey(s, win, action.key, env) : mainKey(s, action.key);

  switch (action.type) {
    case 'listTap':
      selectRow(s, action.row);
      // cMainList::onSelectedRowClicked: only the icon area (first 32 px) opens it.
      if (action.head) launchSelected(s);
      return true;
    case 'startMenuItem':
      s.startMenu = action.index;
      startMenuItemClicked(s, action.index);
      return true;
    case 'closeStartMenu':
      s.startMenu = null;
      return true;
    case 'settingsItem':
      if (win?.kind === 'settings') {
        win.focus[win.tab] = action.item;
        const def = tabsFor(s)[win.tab].items[action.item];
        // Tapping the Language button opens the language selector.
        if (def.button) {
          if (action.delta === 0 && action.tap) openLanguages(s);
          return true;
        }
        win.values[def.key] = Math.min(def.values.length - 1, Math.max(0, settingValue(s, def, win.values) + action.delta));
      }
      return true;
    case 'languageRow':
      if (win?.kind === 'language') {
        const already = win.selected === action.row;
        win.selected = action.row;
        if (already) win.chosen = LANGUAGES[action.row];
      }
      return true;
    case 'settingsTab':
      if (win?.kind === 'settings') switchTab(win, win.tab + action.delta);
      return true;
    case 'settingsOk':
      // cSettingWnd::onOK, from its OK button.
      if (win?.kind === 'settings') s.windows.push(confirmSettings());
      return true;
    case 'themeRow':
      if (win?.kind === 'themes') {
        const already = win.selected === action.row;
        themeSelect(win, action.row, env);
        if (already) themeOnSelect(win, env);
      }
      return true;
  }
}

/** cMainWnd::processKeyMessage, and cStartMenu / cPopMenu while it's open. */
function mainKey(s: MenuState, key: Key): boolean {
  if (s.startMenu !== null) {
    const n = 8;
    switch (key) {
      case 'DOWN': s.startMenu = (s.startMenu + 1) % n; return true;
      case 'UP': s.startMenu = (s.startMenu + n - 1) % n; return true;
      case 'A': {
        const i = s.startMenu;
        s.startMenu = null;
        startMenuItemClicked(s, i);
        return true;
      }
      case 'B': case 'START': s.startMenu = null; return true;
      default: return false;
    }
  }
  const visible = visibleRows(s);
  switch (key) {
    case 'DOWN': selectRow(s, s.selected + 1); return true;
    case 'UP': selectRow(s, s.selected - 1); return true;
    case 'LEFT': selectRow(s, s.selected - visible); return true;
    case 'RIGHT': selectRow(s, s.selected + visible); return true;
    case 'A': launchSelected(s); return true;
    case 'B': case 'L': backParentDir(s); return true;
    case 'X': enterDir(s, 'favorites:/'); return true;
    case 'START': s.startMenu = 0; return true;
    case 'Y':
      // cMainWnd::onKeyYPressed shows File Info.
      openFileInfo(s);
      return true;
    case 'SELECT': {
      setSetting(s, 'viewMode', (setting(s, 'viewMode') + 1) % 4);
      scrollTo(s, s.selected - visibleRows(s) + 1);
      return true;
    }
    default: return false;
  }
}

/** cMainWnd::startMenuItemClicked; items in startmenu.cpp order. */
function startMenuItemClicked(s: MenuState, index: number) {
  s.startMenu = null;
  const path = selectedRow(s)?.realName ?? '';
  switch (index) {
    case 0: // Set favourite
      if (path && !s.favourites.includes(path)) s.favourites.push(path);
      break;
    case 1: // Remove favourite
      if (s.favourites.includes(path)) {
        s.favourites = s.favourites.filter((p) => p !== path);
        if (s.dir === 'favorites:/') enterDir(s, s.dir);
      }
      break;
    case 2: // File Info
      openFileInfo(s);
      break;
    case 3: // Themes
      s.windows.push(openThemes(lastEnv));
      break;
    case 4: // Tools (3in1 expansion pack settings)
      s.windows.push({ kind: 'tools' });
      break;
    case 5: // Settings
      s.windows.push({ kind: 'settings', tab: 0, focus: [0, 0, 0, 0, 0], first: [0, 0, 0, 0, 0], values: { ...s.settings } });
      break;
    case 6:
      s.windows.push({ kind: 'text', which: 'help', firstLine: 0, lineCount: 0, visible: 0 });
      break;
    case 7:
      s.windows.push({ kind: 'text', which: 'about', firstLine: 0, lineCount: 0, visible: 0 });
      break;
  }
}

let lastEnv: Env = { themeName: '', coverTheme: false };
function openThemes(e: Env): Win {
  const w: Extract<Win, { kind: 'themes' }> = {
    kind: 'themes',
    standardOpen: !e.coverTheme,
    coverOpen: e.coverTheme,
    selected: 0,
    first: 0,
    chosen: e.themeName,
  };
  const rows = themeRows(w, e.themeName, e.coverTheme);
  w.selected = Math.max(0, rows.findIndex((r) => !r.folder));
  return w;
}

function themeSelect(w: Extract<Win, { kind: 'themes' }>, id: number, env: Env) {
  const n = themeRows(w, env.themeName, env.coverTheme).length;
  const visible = Math.trunc(THEME_LIST.h / THEME_LIST.rowHeight);
  id = Math.min(n - 1, Math.max(0, id));
  const last = Math.min(w.first + visible - 1, n - 1);
  if (id < w.first || id > last) {
    let f = id - (w.selected - w.first);
    f = Math.max(0, Math.min(f, n - 1, n - visible));
    w.first = f;
  }
  w.selected = id;
}

/** cThemeWnd::onSelect */
function themeOnSelect(w: Extract<Win, { kind: 'themes' }>, env: Env) {
  const rows = themeRows(w, env.themeName, env.coverTheme);
  const row = rows[w.selected];
  if (!row) return;
  if (!row.folder) {
    w.chosen = row.text;
    return;
  }
  if (row.cover) w.coverOpen = !w.coverOpen;
  else w.standardOpen = !w.standardOpen;
  const again = themeRows(w, env.themeName, env.coverTheme);
  themeSelect(w, again.findIndex((r) => r.folder && r.cover === row.cover), env);
}

function confirmSettings(): Win {
  return {
    kind: 'message',
    title: LANG('setting window', 'confirm'),
    text: LANG('setting window', 'confirm text'),
    style: MB_OK | MB_CANCEL,
    onOk: 'applySettings',
  };
}

/** cMainWnd::showFileInfo, for the selected row. */
function openFileInfo(s: MenuState) {
  const row = selectedRow(s);
  if (row) s.windows.push({ kind: 'fileinfo', row });
}

/** cMainWnd::chooseLanguage: the current language starts selected and marked. */
function openLanguages(s: MenuState) {
  const at = Math.max(0, LANGUAGES.indexOf(s.language));
  s.windows.push({ kind: 'language', selected: at, first: Math.max(0, at - LANGUAGE_LIST.visible + 1), chosen: s.language });
}

/** languagewnd.cpp: 224×179, the list at (4, 22), 15-pixel rows. */
export const LANGUAGE_WINDOW = { w: 224, h: 179 };
export const LANGUAGE_LIST = { x: 4, y: 22, w: 224 - 32, h: 179 - 48, rowHeight: 15, visible: Math.trunc((179 - 48) / 15) };

/** The tab spin box doesn't wrap; ShowTab focuses the tab's first visible item. */
function switchTab(win: Extract<Win, { kind: 'settings' }>, tab: number) {
  win.tab = Math.min(4, Math.max(0, tab));
  win.focus[win.tab] = win.first[win.tab];
}

function windowKey(s: MenuState, win: Win, key: Key, env: Env): boolean {
  const close = () => s.windows.pop();
  switch (win.kind) {
    case 'message':
      // cMessageBox: A is OK/Yes, B is Cancel/No.
      if (key === 'A') {
        close();
        if (win.onOk === 'applySettings') {
          const settings = s.windows[s.windows.length - 1];
          if (settings?.kind === 'settings') {
            s.settings = { ...settings.values };
            close();
            scrollTo(s, s.selected - visibleRows(s) + 1);
          }
        }
        if (win.onOk === 'applyLanguage') {
          const picker = s.windows[s.windows.length - 1];
          // The menu saves the language and restarts: back to the home list.
          if (picker?.kind === 'language') restartWith(s, picker.chosen);
        }
        return true;
      }
      if (key === 'B') {
        close();
        return true;
      }
      return false;
    case 'fileinfo':
    case 'tools':
      // OK / Cancel (A / B). Save Type, Cheats, RAM and SRAM need a real card; not previewed.
      if (key === 'A' || key === 'B') {
        close();
        return true;
      }
      return false;
    case 'language': {
      const n = LANGUAGES.length;
      const select = (id: number) => {
        win.selected = Math.min(n - 1, Math.max(0, id));
        if (win.selected < win.first) win.first = win.selected;
        if (win.selected >= win.first + LANGUAGE_LIST.visible) win.first = win.selected - LANGUAGE_LIST.visible + 1;
      };
      switch (key) {
        case 'DOWN': select(win.selected + 1); return true;
        case 'UP': select(win.selected - 1); return true;
        case 'A': win.chosen = LANGUAGES[win.selected]; return true;
        case 'X': {
          // onOK: picks the selected one, then asks before restarting in it.
          win.chosen = LANGUAGES[win.selected];
          if (win.chosen === s.language) close();
          else s.windows.push({ kind: 'message', title: LANG('language changed', 'title'), text: LANG('language changed', 'text'), style: MB_YES | MB_NO, onOk: 'applyLanguage' });
          return true;
        }
        case 'B': close(); return true;
        default: return false;
      }
    }
    case 'progress':
      // The DS would start the game now; the preview just remembers it.
      close();
      addToRecent(s, win.path);
      return true;
    case 'text':
      if (key === 'A' || key === 'B') close();
      else if (key === 'UP' && win.firstLine > 0) win.firstLine--;
      else if (key === 'DOWN' && win.firstLine + Math.max(1, win.visible) < win.lineCount) win.firstLine++;
      else return false;
      return true;
    case 'themes': {
      const rows = themeRows(win, env.themeName, env.coverTheme);
      switch (key) {
        case 'DOWN': themeSelect(win, win.selected + 1, env); return true;
        case 'UP': themeSelect(win, win.selected - 1, env); return true;
        case 'LEFT':
        case 'RIGHT': {
          const row = rows[win.selected];
          if (row?.folder) {
            if (row.cover) win.coverOpen = key === 'RIGHT';
            else win.standardOpen = key === 'RIGHT';
            const again = themeRows(win, env.themeName, env.coverTheme);
            themeSelect(win, again.findIndex((r) => r.folder && r.cover === row.cover), env);
          }
          return true;
        }
        case 'A': themeOnSelect(win, env); return true;
        case 'B': case 'X': close(); return true;
        default: return false;
      }
    }
    case 'settings': {
      const items = tabsFor(s)[win.tab].items;
      const f = win.focus[win.tab];
      const focusItem = (i: number) => {
        win.focus[win.tab] = i;
        const first = win.first[win.tab];
        if (i < first) win.first[win.tab] = i;
        else if (i >= first + SETTINGS.maxVisible) win.first[win.tab] = i - SETTINGS.maxVisible + 1;
      };
      switch (key) {
        case 'UP': focusItem(f === 0 ? items.length - 1 : f - 1); return true;
        case 'DOWN': focusItem(f + 1 >= items.length ? 0 : f + 1); return true;
        case 'LEFT':
        case 'RIGHT':
          if (!items[f].button) {
            win.values[items[f].key] = Math.min(items[f].values.length - 1, Math.max(0, settingValue(s, items[f], win.values) + (key === 'RIGHT' ? 1 : -1)));
          }
          return true;
        case 'L': switchTab(win, win.tab - 1); return true;
        case 'R': switchTab(win, win.tab + 1); return true;
        case 'A':
          // A focused button (Language) opens its own selector.
          if (items[f].button) openLanguages(s);
          else s.windows.push(confirmSettings());
          return true;
        case 'B': close(); return true;
        default: return false;
      }
    }
  }
}

/** The menu restarted in another language: everything closes, back to the home list. */
export function restartWith(s: MenuState, language: string) {
  s.language = language;
  s.windows = [];
  s.startMenu = null;
  s.dir = '';
  s.selected = 0;
  s.first = 0;
}

/** Switches between DS (flashcart) and DSi (SD card), starting again from the home list. */
export function setConsole(s: MenuState, console: Console) {
  s.console = console;
  restartWith(s, s.language);
}
