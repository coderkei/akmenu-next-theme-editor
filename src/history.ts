// Undo and redo for the theme being edited, by snapshots. File bytes are never changed
// in place (they're replaced), so a snapshot can share them and stays cheap; the INI
// files are kept as text, which IniDocument turns back into exactly the same documents.

import { IniDocument } from './formats/ini';
import type { Theme } from './theme';

export interface Snapshot {
  name: string;
  files: [string, Uint8Array][];
  uisettings: string;
  custom: string;
}

export function snapshot(theme: Theme): Snapshot {
  return { name: theme.name, files: [...theme.files], uisettings: theme.uisettings.toString(), custom: theme.custom.toString() };
}

export function restoreSnapshot(s: Snapshot): Theme {
  return { name: s.name, files: new Map(s.files), uisettings: IniDocument.parse(s.uisettings), custom: IniDocument.parse(s.custom) };
}

function same(a: Snapshot, b: Snapshot) {
  return (
    a.name === b.name &&
    a.uisettings === b.uisettings &&
    a.custom === b.custom &&
    a.files.length === b.files.length &&
    a.files.every(([p, d], i) => b.files[i][0] === p && b.files[i][1] === d)
  );
}

/** Changes closer together than this count as one step, e.g. dragging a colour picker. */
const MERGE_MS = 800;
const LIMIT = 100;

export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private current: Snapshot;
  private lastChange = -Infinity;

  constructor(theme: Theme) {
    this.current = snapshot(theme);
  }

  /** Starts afresh from this theme, with nothing to undo. */
  reset(theme: Theme) {
    this.undoStack = [];
    this.redoStack = [];
    this.current = snapshot(theme);
    this.lastChange = -Infinity;
  }

  /** Records the theme after a change. `separate` stops it merging with the last one. */
  record(theme: Theme, now = performance.now(), separate = false) {
    const next = snapshot(theme);
    if (same(next, this.current)) return; // e.g. a move that ended where it started
    if (separate || now - this.lastChange > MERGE_MS) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
    }
    this.current = next;
    this.redoStack = [];
    this.lastChange = separate ? -Infinity : now;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** The theme as it was one step back, or null if there's nothing to undo. */
  undo(): Theme | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(this.current);
    this.current = previous;
    this.lastChange = -Infinity;
    return restoreSnapshot(previous);
  }

  redo(): Theme | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(this.current);
    this.current = next;
    this.lastChange = -Infinity;
    return restoreSnapshot(next);
  }
}
