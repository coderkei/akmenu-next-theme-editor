// Moving theme elements around the preview: finds what's under a point and writes
// new x/y values into the theme's INI, kept within the schema's limits.

import { SCHEMA } from '../schema';
import type { Theme } from '../theme';
import type { Placed } from './menu';

/** The topmost movable element at a point on one screen. */
export function elementAt(elements: Placed[], screen: Placed['screen'], x: number, y: number): Placed | undefined {
  return [...elements].reverse().find((e) => e.screen === screen && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
}

/** The same element in a newer render, if it's still drawn. */
export function sameElement(elements: Placed[], el: Pick<Placed, 'file' | 'section'>): Placed | undefined {
  return elements.find((e) => e.file === el.file && e.section === el.section);
}

export function sectionLabel(el: Pick<Placed, 'file' | 'section'>): string {
  return SCHEMA.find((s) => s.file === el.file && s.section === el.section)?.label ?? el.section;
}

function limits(el: Pick<Placed, 'file' | 'section'>, key: string) {
  const def = SCHEMA.find((s) => s.file === el.file && s.section === el.section)?.keys.find((k) => k.key === key);
  return { min: def?.min ?? -Infinity, max: def?.max ?? Infinity };
}

/** Writes x/y for an element, clamped to the schema's range. Returns what was written. */
export function setPosition(theme: Theme, el: Pick<Placed, 'file' | 'section'>, x: number, y: number) {
  const doc = el.file === 'custom.ini' ? theme.custom : theme.uisettings;
  const lx = limits(el, 'x');
  const ly = limits(el, 'y');
  const nx = Math.round(Math.min(lx.max, Math.max(lx.min, x)));
  const ny = Math.round(Math.min(ly.max, Math.max(ly.min, y)));
  doc.set(el.section, 'x', String(nx));
  doc.set(el.section, 'y', String(ny));
  return { x: nx, y: ny };
}

/**
 * Writes a new width and height from a size in screen pixels, in the element's own
 * units (e.g. calendar cells), kept inside the schema's range and at least 1.
 */
export function setSize(theme: Theme, el: Pick<Placed, 'file' | 'section' | 'size'>, pixelsW: number, pixelsH: number) {
  const size = el.size;
  if (!size) return null;
  const doc = el.file === 'custom.ini' ? theme.custom : theme.uisettings;
  const fit = (key: string, value: number) => {
    const l = limits(el, key);
    return Math.round(Math.min(l.max, Math.max(Math.max(l.min, 1), value)));
  };
  const w = fit(size.wKey, pixelsW / size.perW);
  const h = fit(size.hKey, pixelsH / size.perH);
  doc.set(el.section, size.wKey, String(w));
  doc.set(el.section, size.hKey, String(h));
  return { w, h };
}

/**
 * The raw x/y (and size) strings, so a cancelled move can put back exactly what was
 * there, including leaving out keys that weren't set.
 */
export function savePosition(theme: Theme, el: Pick<Placed, 'file' | 'section' | 'size'>) {
  const doc = el.file === 'custom.ini' ? theme.custom : theme.uisettings;
  const keys = ['x', 'y', ...(el.size ? [el.size.wKey, el.size.hKey] : [])];
  const saved = keys.map((key) => [key, doc.get(el.section, key)] as const);
  return () => {
    for (const [key, v] of saved) {
      if (v === undefined) doc.delete(el.section, key);
      else doc.set(el.section, key, v);
    }
  };
}
