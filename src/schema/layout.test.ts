import { describe, expect, it } from 'vitest';
import { ICON_LABELS, IMAGE_SLOTS, SCHEMA, THEME_BITMAPS, THEME_ICONS } from './index';
import { CARDS, TABS } from './layout';

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
