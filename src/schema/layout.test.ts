import { describe, expect, it } from 'vitest';
import { ICON_LABELS, IMAGE_SLOTS, SCHEMA, THEME_BITMAPS, THEME_ICONS } from './index';
import { CARDS, SIMPLE_CARDS, SIMPLE_TABS, TABS } from './layout';

describe('settings layout', () => {
  it('shows every schema key in exactly one card', () => {
    const seen = new Map<string, number>();
    for (const card of CARDS) {
      for (const part of card.parts) {
        const section = SCHEMA.find((s) => s.file === part.file && s.section === part.section);
        expect(section, `${part.file} [${part.section}]`).toBeDefined();
        for (const key of part.keys ?? section!.keys.map((k) => k.key)) {
          expect(section!.keys.some((k) => k.key === key), `${part.section} ${key}`).toBe(true);
          const id = `${part.file} [${part.section}] ${key}`;
          seen.set(id, (seen.get(id) ?? 0) + 1);
        }
      }
    }
    const all = SCHEMA.flatMap((s) => s.keys.map((k) => `${s.file} [${s.section}] ${k.key}`));
    expect([...seen.keys()].sort()).toEqual([...all].sort());
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it('offers every theme picture and every icon somewhere', () => {
    expect(IMAGE_SLOTS.map((s) => s.path).sort()).toEqual(Object.values(THEME_BITMAPS).sort());
    expect(Object.keys(ICON_LABELS).sort()).toEqual(Object.values(THEME_ICONS).sort());
    expect(CARDS.some((c) => c.icons)).toBe(true);
  });

  it('puts every card in a real tab and every image slot in a card', () => {
    for (const card of CARDS) expect(TABS.map((t) => t.id)).toContain(card.tab);
    expect(CARDS.flatMap((c) => c.images ?? []).sort()).toEqual(IMAGE_SLOTS.map((s) => s.path).sort());
  });
});

describe('simple layout', () => {
  it('only uses real keys and pictures, each once', () => {
    const seen = new Set<string>();
    for (const card of SIMPLE_CARDS) {
      for (const part of card.parts) {
        const section = SCHEMA.find((s) => s.file === part.file && s.section === part.section);
        expect(section, `${part.file} [${part.section}]`).toBeDefined();
        for (const key of part.keys ?? section!.keys.map((k) => k.key)) {
          expect(section!.keys.some((k) => k.key === key), `${part.section} ${key}`).toBe(true);
          const id = `${part.file} [${part.section}] ${key}`;
          expect(seen.has(id), id).toBe(false);
          seen.add(id);
        }
        for (const key of Object.keys(part.labels ?? {})) expect(part.keys ?? section!.keys.map((k) => k.key)).toContain(key);
      }
      for (const img of card.images ?? []) expect(IMAGE_SLOTS.some((s) => s.path === img), img).toBe(true);
    }
  });

  it('only shows what the advanced layout also has, so nothing is simple-only', () => {
    const advanced = new Set(CARDS.flatMap((c) => c.parts.flatMap((p) => (p.keys ?? SCHEMA.find((s) => s.file === p.file && s.section === p.section)!.keys.map((k) => k.key)).map((k) => `${p.file} [${p.section}] ${k}`))));
    for (const card of SIMPLE_CARDS) {
      for (const part of card.parts) for (const key of part.keys ?? []) expect(advanced.has(`${part.file} [${part.section}] ${key}`)).toBe(true);
    }
  });

  it('puts every card in a real simple tab, and every tab has a card', () => {
    for (const card of SIMPLE_CARDS) expect(SIMPLE_TABS.map((t) => t.id)).toContain(card.tab);
    for (const tab of SIMPLE_TABS) expect(SIMPLE_CARDS.some((c) => c.tab === tab.id), tab.id).toBe(true);
  });

  it('includes both required screen pictures', () => {
    const images = SIMPLE_CARDS.flatMap((c) => c.images ?? []);
    expect(images).toContain('upper_screen.bmp');
    expect(images).toContain('lower_screen.bmp');
  });
});
