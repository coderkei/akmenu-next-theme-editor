// How the settings are laid out in the editor: tabs by where things are on the DS,
// and cards for each thing you can see. A card can take keys from more than one INI
// section (e.g. the start menu's colours live in [global settings]). Every schema key
// appears in exactly one card; layout.test.ts checks that.

import type { ThemeFile } from './index';

export type TabId = 'backgrounds' | 'clock' | 'text' | 'cover' | 'list' | 'buttons' | 'startmenu' | 'windows' | 'music';

export interface TabDef {
  id: TabId;
  label: string;
  intro: string;
}

export const TABS: TabDef[] = [
  { id: 'backgrounds', label: 'Backgrounds', intro: 'Start here: pick a picture for each screen. Any picture works; it’s resized to fit the DS for you.' },
  { id: 'clock', label: 'Clock & calendar', intro: 'The big clock and the calendar on the top screen.' },
  { id: 'text', label: 'Name & text', intro: 'Extra things you can add to the top screen: your DS name, the date, your own text and a small picture.' },
  { id: 'cover', label: 'Game cover', intro: 'Box art for the selected game, on the top screen.' },
  { id: 'list', label: 'Game list', intro: 'The list of games and folders on the bottom screen.' },
  { id: 'buttons', label: 'Buttons', intro: 'The buttons around the bottom screen.' },
  { id: 'startmenu', label: 'Start menu', intro: 'The menu that opens from the START button.' },
  { id: 'windows', label: 'Windows', intro: 'Messages and the windows that open from the start menu, like Settings and Help.' },
  { id: 'music', label: 'Music', intro: 'Background music that plays while the menu is open.' },
];

export interface CardPart {
  file: ThemeFile;
  section: string;
  /** Only these keys; all of the section's keys if left out. */
  keys?: string[];
  /** A small heading when a card has more than one part. */
  heading?: string;
}

export interface CardDef {
  id: string;
  tab: TabId;
  label: string;
  description: string;
  parts: CardPart[];
  /** Image slots (IMAGE_SLOTS paths) shown in this card. */
  images?: string[];
  /** The theme music list (AKMenu-Next themes only). */
  music?: boolean;
  /** The file list icon grid (AKMenu-Next themes only). */
  icons?: boolean;
  /** The custom picture upload (custom.ini [custom picture]). */
  customPicture?: boolean;
}

const ui = (section: string, keys?: string[], heading?: string): CardPart => ({ file: 'uisettings.ini', section, keys, heading });
const custom = (section: string): CardPart => ({ file: 'custom.ini', section });

export const CARDS: CardDef[] = [
  {
    id: 'screens',
    tab: 'backgrounds',
    label: 'Screen pictures',
    description: 'Pure black turns see-through on the DS, so you’ll be offered a fix if your picture has any.',
    parts: [],
    images: ['upper_screen.bmp', 'lower_screen.bmp', 'gbaframe.bmp'],
  },

  {
    id: 'clock',
    tab: 'clock',
    label: 'Clock',
    description: 'A big digital clock. Its digits are pictures: calendar/clock_numbers.bmp (0 to 9, top to bottom) and calendar/clock_colon.bmp.',
    parts: [ui('big clock'), ui('am pm', undefined, 'AM/PM marker')],
    images: ['calendar/clock_numbers.bmp', 'calendar/clock_colon.bmp'],
  },
  {
    id: 'calendar',
    tab: 'clock',
    label: 'Calendar',
    description: 'A grid of this month’s days plus today’s date, month and year, all drawn with number pictures from the calendar folder.',
    parts: [
      ui('calendar day', undefined, 'Days of the month'),
      ui('calendar dayx', undefined, 'Today’s date'),
      ui('calendar month', undefined, 'Month'),
      ui('calendar year', undefined, 'Year'),
      ui('global settings', ['showCalendar'], 'Other'),
    ],
    images: ['calendar/day_numbers.bmp', 'calendar/year_numbers.bmp'],
  },
  { id: 'username', tab: 'text', label: 'Username', description: 'The name set on the DS, as text.', parts: [custom('user name')] },
  { id: 'date', tab: 'text', label: 'Date and time', description: 'Today’s date (and the time, if you like) as text or number pictures.', parts: [custom('date')], images: ['calendar/date_numbers.bmp'] },
  { id: 'custom-text', tab: 'text', label: 'Your own text', description: 'Any words you like, in a box. Set a width, or the text won’t show.', parts: [custom('custom text')] },
  { id: 'custom-picture', tab: 'text', label: 'Your own picture', description: 'A small extra picture. Add one here and the file path is filled in for you.', parts: [custom('custom picture')], customPicture: true },
  {
    id: 'cover',
    tab: 'cover',
    label: 'Game cover',
    description: 'Shows the selected game’s box art. Setting anything here makes this a Game Cover theme.',
    parts: [ui('cover')],
  },

  {
    id: 'file-list',
    tab: 'list',
    label: 'Game list',
    description: 'The selected row gets a bar striped from two colours. The icons come from the icons folder in the theme.',
    parts: [ui('main list')],
  },
  {
    id: 'icons',
    tab: 'list',
    label: 'Icons',
    description: 'Click an icon to use your own picture; it’s turned into a 32×32, 16-colour DS icon. Ones you don’t set use the menu’s own.',
    parts: [],
    icons: true,
  },
  { id: 'folder-name', tab: 'list', label: 'Folder name', description: 'Shows which folder you’re in, above the list.', parts: [ui('folder text')] },

  { id: 'start-button', tab: 'buttons', label: 'Start button', description: 'Opens the start menu. It can be text, a picture, or both.', parts: [ui('start button')] },
  { id: 'brightness', tab: 'buttons', label: 'Brightness button', description: 'Changes the screen brightness.', parts: [ui('brightness btn')], images: ['brightness.bmp'] },
  { id: 'folder-up', tab: 'buttons', label: 'Folder up button', description: 'Goes back a folder.', parts: [ui('folderup btn')], images: ['folder_up.bmp'] },
  { id: 'card-icon', tab: 'buttons', label: 'Card activity icon', description: 'Flashes while the game card is busy.', parts: [ui('disk icon')], images: ['card_icon_blue.bmp'] },

  {
    id: 'start-menu',
    tab: 'startmenu',
    label: 'Start menu',
    description: 'The list of options that opens from START.',
    parts: [ui('start menu'), ui('global settings', ['popMenuTextColor', 'popMenuTextHighLightColor', 'popMenuBarColor'], 'Colours')],
    images: ['menu_bg.bmp'],
  },
  {
    id: 'windows',
    tab: 'windows',
    label: 'Windows',
    description: 'Messages, Settings, Help and so on.',
    parts: [ui('global settings', ['formBodyColor', 'formFrameColor', 'thickness', 'formTitleTextColor', 'formTextColor', 'buttonTextColor'])],
    images: ['title_left.bmp', 'title_bg.bmp', 'title_right.bmp', 'btn2.bmp', 'btn3.bmp', 'btn4.bmp'],
  },
  {
    id: 'settings-window',
    tab: 'windows',
    label: 'Option boxes',
    description: 'The boxes you change settings with, in the Settings window.',
    parts: [
      ui('global settings', ['spinBoxNormalColor', 'spinBoxFocusColor', 'spinBoxTextColor', 'spinBoxTextHiLightColor', 'spinBoxFrameColor']),
      ui('setting window', undefined, 'Settings window'),
    ],
    images: ['spin_btn_left.bmp', 'spin_btn_right.bmp'],
  },
  {
    id: 'window-lists',
    tab: 'windows',
    label: 'Lists in windows',
    description: 'Lists inside windows, like the one in Themes.',
    parts: [ui('global settings', ['listViewBarColor1', 'listViewBarColor2', 'listTextColor', 'listTextHighLightColor'])],
  },
  {
    id: 'music',
    tab: 'music',
    label: 'Theme music',
    description: 'Add WAV or BCSTM files. Each time the menu starts it picks one at random to play. Players can turn music off under Settings › Interface › Theme music.',
    parts: [],
    music: true,
  },
  {
    id: 'loading',
    tab: 'windows',
    label: 'Loading window',
    description: 'Shown while a game starts.',
    parts: [],
    images: ['progress_wnd.bmp', 'progress_bar.bmp'],
  },
  { id: 'help-window', tab: 'windows', label: 'Window sizes', description: 'How big some windows are.', parts: [ui('help window', undefined, 'Help and About'), ui('rom info window', undefined, 'File Info')] },
];
