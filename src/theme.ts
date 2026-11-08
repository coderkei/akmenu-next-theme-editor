// The in-memory theme: every file as raw bytes, plus parsed INIs.
// Files the editor doesn't touch are written back byte-for-byte.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { IniDocument } from './formats/ini';
import { CUSTOM_PICTURE, NEXT_ONLY_PATHS, SCHEMA, type Flavour } from './schema';

export interface Theme {
  name: string;
  files: Map<string, Uint8Array>;
  uisettings: IniDocument;
  custom: IniDocument;
}

export function newTheme(name = 'My Theme'): Theme {
  return {
    name,
    files: new Map(),
    uisettings: IniDocument.parse('[global settings]\r\n'),
    custom: IniDocument.parse(''),
  };
}

/**
 * Loads a theme zip. Finds uisettings.ini wherever it is, so archives with
 * the theme nested a folder (or two) deep still import cleanly.
 */
export function importThemeZip(bytes: Uint8Array): Theme {
  const entries = unzipSync(bytes);
  const paths = Object.keys(entries).filter((p) => !p.endsWith('/'));
  const settings = paths
    .filter((p) => /(^|\/)uisettings\.ini$/i.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!settings) throw new Error('No uisettings.ini found in this zip.');

  const root = settings.slice(0, settings.length - 'uisettings.ini'.length);
  const name = root.replace(/\/$/, '').split('/').pop() || 'Imported Theme';

  const files = new Map<string, Uint8Array>();
  for (const p of paths) {
    if (p.startsWith(root)) files.set(p.slice(root.length), entries[p]);
  }
  const text = (path: string) => {
    const key = [...files.keys()].find((k) => k.toLowerCase() === path);
    return key ? strFromU8(files.get(key)!) : '';
  };
  return {
    name,
    files,
    uisettings: IniDocument.parse(text('uisettings.ini')),
    custom: IniDocument.parse(text('custom.ini')),
  };
}

/** The folder a theme exports into, which is its name in the menu's theme list. */
export function themeFolder(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Theme';
}

/** The full SD path the menu needs in custom.ini for a picture inside this theme. */
export function customPicturePath(themeName: string, file = CUSTOM_PICTURE): string {
  return `/_nds/akmenunext/ui/${themeFolder(themeName)}/${file}`;
}

/**
 * If [custom picture] points at a file inside a theme folder and this theme has that
 * file, makes the path use this theme's folder (e.g. after a rename). Returns true if
 * it changed anything.
 */
export function syncCustomPicturePath(theme: Theme): boolean {
  const current = theme.custom.get('custom picture', 'file');
  if (!current) return false;
  const m = /^(?:[a-z]+:)?\/?_nds\/akmenunext\/ui\/[^/]+\/(.+)$/i.exec(current.replace(/\\/g, '/'));
  if (!m || ![...theme.files.keys()].some((p) => p.toLowerCase() === m[1].toLowerCase())) return false;
  const wanted = customPicturePath(theme.name, m[1]);
  if (wanted === current) return false;
  theme.custom.set('custom picture', 'file', wanted);
  return true;
}

export interface ExportResult {
  zip: Uint8Array;
  dropped: string[];
}

/** Builds a zip with the theme in a single top-level folder. */
export function exportThemeZip(theme: Theme, flavour: Flavour): ExportResult {
  const dropped: string[] = [];
  const out: Record<string, Uint8Array> = {};
  const folder = themeFolder(theme.name);

  const ui = IniDocument.parse(theme.uisettings.toString());
  if (flavour === 'classic') {
    for (const s of SCHEMA) {
      if (s.file === 'uisettings.ini' && !s.flavours.includes('classic') && ui.hasSection(s.section)) {
        ui.deleteSection(s.section);
        dropped.push(`[${s.section}] in uisettings.ini`);
      }
    }
  }
  out[`${folder}/uisettings.ini`] = strToU8(ui.toString());

  // Point the custom picture at this folder, in case the theme was renamed.
  const custom = { ...theme, custom: IniDocument.parse(theme.custom.toString()) };
  syncCustomPicturePath(custom);
  const customText = custom.custom.toString();
  if (customText.trim() !== '') {
    if (flavour === 'classic') dropped.push('custom.ini');
    else out[`${folder}/custom.ini`] = strToU8(customText);
  }

  for (const [path, data] of theme.files) {
    if (/^(uisettings|custom)\.ini$/i.test(path)) continue;
    if (flavour === 'classic' && NEXT_ONLY_PATHS.some((r) => r.test(path))) {
      dropped.push(path);
      continue;
    }
    out[`${folder}/${path}`] = data;
  }
  return { zip: zipSync(out), dropped };
}
