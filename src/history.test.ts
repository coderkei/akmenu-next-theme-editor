import { describe, expect, it } from 'vitest';
import { History } from './history';
import { newTheme } from './theme';

describe('undo history', () => {
  it('undoes and redoes changes, with quick runs of edits as one step', () => {
    let theme = newTheme('A');
    const h = new History(theme);
    theme.uisettings.set('main list', 'textColor', '0x0001');
    h.record(theme, 1000);
    theme.uisettings.set('main list', 'textColor', '0x0002');
    h.record(theme, 1200); // within the merge window: same step
    theme.name = 'B';
    h.record(theme, 5000);

    theme = h.undo()!;
    expect(theme.name).toBe('A');
    expect(theme.uisettings.get('main list', 'textColor')).toBe('0x0002');
    theme = h.undo()!;
    expect(theme.uisettings.get('main list', 'textColor')).toBeUndefined();
    expect(h.undo()).toBeNull();

    theme = h.redo()!;
    theme = h.redo()!;
    expect(theme.name).toBe('B');
    expect(h.canRedo).toBe(false);
  });

  it('ignores changes that change nothing, and a new change clears redo', () => {
    let theme = newTheme('A');
    const h = new History(theme);
    h.record(theme, 0, true);
    expect(h.canUndo).toBe(false);
    theme.files.set('x.bmp', new Uint8Array([1]));
    h.record(theme, 0, true);
    theme = h.undo()!;
    expect(theme.files.has('x.bmp')).toBe(false);
    theme.name = 'C';
    h.record(theme, 0, true);
    expect(h.canRedo).toBe(false);
  });
});
