// Reads theme settings the way the menu does (arm9/source/inifile.cpp CIniFile),
// with defaults from the schema. Asking for a key that isn't in the schema throws,
// so the preview can never quietly use a key the editor doesn't know about.

import { SCHEMA, type ThemeFile } from '../schema';
import type { Theme } from '../theme';

function keyDef(file: ThemeFile, section: string, key: string) {
  const def = SCHEMA.find((s) => s.file === file && s.section === section)?.keys.find((k) => k.key === key);
  if (!def) throw new Error(`[${section}] ${key} in ${file} isn't in the schema`);
  return def;
}

/** strtol: optional sign then digits, stopping at the first other character. */
function strtol(value: string, base: 10 | 16): number {
  const m = (base === 16 ? /^\s*([+-]?)(?:0[xX])?([0-9a-fA-F]+)/ : /^\s*([+-]?)([0-9]+)/).exec(value);
  if (!m) return 0;
  const n = parseInt(m[2], base);
  return (m[1] === '-' ? -n : n) | 0;
}

/** CIniFile::GetInt: "0x…" is hex, anything else decimal; a blank value reads as 0. */
export function parseIniInt(value: string): number {
  if (value.length > 2 && value[0] === '0' && (value[1] === 'x' || value[1] === 'X')) return strtol(value, 16);
  return strtol(value, 10);
}

export class ThemeSettings {
  constructor(private theme: Theme) {}

  private doc(file: ThemeFile) {
    return file === 'custom.ini' ? this.theme.custom : this.theme.uisettings;
  }

  has(file: ThemeFile, section: string): boolean {
    return this.doc(file).hasSection(section);
  }

  int(file: ThemeFile, section: string, key: string, fallback?: number): number {
    const def = keyDef(file, section, key);
    const raw = this.doc(file).get(section, key);
    if (raw !== undefined) return parseIniInt(raw);
    if (fallback !== undefined) return fallback;
    return typeof def.default === 'number' ? def.default : 0;
  }

  str(file: ThemeFile, section: string, key: string): string {
    const def = keyDef(file, section, key);
    return this.doc(file).get(section, key) ?? String(def.default ?? '');
  }

  ui(section: string, key: string, fallback?: number) {
    return this.int('uisettings.ini', section, key, fallback);
  }

  custom(section: string, key: string, fallback?: number) {
    return this.int('custom.ini', section, key, fallback);
  }
}
