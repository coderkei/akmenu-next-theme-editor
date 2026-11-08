// The menu's text (language/<name>/language.txt from akmenu-next, GPL-3.0), read the
// way the menu reads it: LANG(section, key) falls back to the key itself. English is
// built in; the others load when picked.

import { IniDocument } from '../formats/ini';
import english from './lang/English.txt?raw';

const files = import.meta.glob<string>('./lang/*.txt', { query: '?raw', import: 'default' });

/** Installed languages, sorted as languagewnd.cpp installedLanguages sorts them. */
export const LANGUAGES: string[] = Object.keys(files)
  .map((p) => p.replace(/^\.\/lang\//, '').replace(/\.txt$/, ''))
  .sort();

let doc = IniDocument.parse(english);
let current = 'English';

/** language.h LANG(i, t) */
export function LANG(section: string, key: string): string {
  return doc.get(section, key) ?? key;
}

export const currentLanguage = () => current;

/** The font the language asks for (fontfactory.cpp: [font] main, default liberation.pcf). */
export const languageFont = () => doc.get('font', 'main') ?? 'liberation.pcf';

/** Which of a banner's titles the menu shows ([font] language: 0 Japanese, 1 English…). */
export const bannerLanguage = () => Number(doc.get('font', 'language') ?? 1) || 0;

/** Switches every LANG() to another language's text. */
export async function setLanguage(name: string): Promise<void> {
  const load = files[`./lang/${name}.txt`];
  if (!load) throw new Error(`no language called ${name}`);
  const text = await load();
  doc = IniDocument.parse(text);
  current = name;
}

/** A small printf for the menu's formatString uses: %s, %c, %d, %02d and %u. */
export function formatString(format: string, ...args: (string | number)[]): string {
  let i = 0;
  return format.replace(/%(0?\d*)([scdu%])/g, (_, width: string, f: string) => {
    if (f === '%') return '%';
    const arg = args[i++];
    if (f === 'c') return String.fromCharCode(Number(arg));
    const text = String(arg ?? '');
    return width ? text.padStart(Number(width), width.startsWith('0') ? '0' : ' ') : text;
  });
}
