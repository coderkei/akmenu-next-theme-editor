import './style.css';
import type { PreviewFont } from './preview/font';
import { currentLanguage, languageFont, setLanguage } from './preview/lang';
import { act, LANGUAGES, newMenuState, setConsole, setSetting, setting, VIEW_MODES, type Console, type Key, type MenuState, type ViewMode } from './preview/navigator';
import { loadMenuFont, loadStockIcons, renderPreview, SCREEN_H, SCREEN_W, type PreviewResult } from './preview/render';
import type { Placed } from './preview/menu';
import { elementAt, sameElement, savePosition, sectionLabel, setPosition, setSize } from './preview/move';
import { loadWork, saveWorkSoon } from './autosave';
import { History, restoreSnapshot, snapshot } from './history';
import { createPanels } from './panels';
import type { EditorMode } from './schema/layout';
import type { Flavour, ThemeFile } from './schema';
import { checkTheme, type Issue } from './checks';
import { exportThemeZip, importThemeZip, newTheme, syncCustomPicturePath, themeFolder, type Theme } from './theme';

let theme: Theme = newTheme();
let flavour: Flavour = 'next';

// ------------------------------------------------------------- editor mode

const MODE_STORE = 'aktheme.editorMode';
const editorModeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="editor-mode"]')];

/**
 * Simple for newcomers. People who used the editor before there was a choice (they have
 * a remembered settings tab) keep the full editor they know.
 */
function storedEditorMode(): EditorMode {
  try {
    const m = localStorage.getItem(MODE_STORE);
    if (m === 'simple' || m === 'advanced') return m;
    if (localStorage.getItem('aktheme.settingsTab')) return 'advanced';
  } catch {
    // Storage blocked: start simple.
  }
  return 'simple';
}

let editorMode: EditorMode = storedEditorMode();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const topCtx = $<HTMLCanvasElement>('#screen-top').getContext('2d')!;
const bottomCanvas = $<HTMLCanvasElement>('#screen-bottom');
const bottomCtx = bottomCanvas.getContext('2d')!;
const status = $<HTMLParagraphElement>('#status');

function say(message: string) {
  status.textContent = message;
}

const panels = createPanels($<HTMLDivElement>('#panels'), {
  theme: () => theme,
  flavour: () => flavour,
  changed: (separate) => {
    redraw();
    themeChanged(separate);
  },
  say,
  stockIcon: (path) => stockIcons?.get(path),
  mode: () => editorMode,
  switchMode: (mode) => setEditorMode(mode),
});

function applyEditorMode() {
  document.body.classList.toggle('simple', editorMode === 'simple');
  for (const i of editorModeInputs) i.checked = i.value === editorMode;
}

function setEditorMode(mode: EditorMode) {
  editorMode = mode;
  try {
    localStorage.setItem(MODE_STORE, mode);
  } catch {
    // Not remembered; that's fine.
  }
  applyEditorMode();
  panels.build();
  say(mode === 'simple' ? 'Simple mode: just the main things. Switch to Advanced any time for every setting.' : 'Advanced mode: every setting, size and picture.');
}

for (const i of editorModeInputs) i.addEventListener('change', () => i.checked && setEditorMode(i.value as EditorMode));
applyEditorMode();

// ------------------------------------------------------------------ preview

const notesList = $<HTMLUListElement>('#preview-notes');
const viewModeSelect = $<HTMLSelectElement>('#view-mode');
const clockBox = $<HTMLInputElement>('#clock-12h');
const coversBox = $<HTMLInputElement>('#covers');
const cardBox = $<HTMLInputElement>('#card-activity');

let font: PreviewFont | null = null;
let shownNotes = '';
/** The clock colon starts hidden, as cBigClock does. */
let colonShow = false;
/** The menu's own icons, for classic themes and anything a theme doesn't include. */
let stockIcons: Map<string, Uint8Array> | undefined;
let menu: MenuState = newMenuState();
let last: PreviewResult | null = null;

function redraw() {
  if (!font) return;
  last = renderPreview(topCtx, bottomCtx, theme, flavour, font, menu, {
    cardActivity: cardBox.checked,
    userName: 'Player',
    now: new Date(),
    stockIcons,
    colonShow,
  });
  // The clock blink redraws twice a second, so only touch the notes when they change.
  const notes = last.notes.join('\n');
  if (notes !== shownNotes) {
    shownNotes = notes;
    notesList.replaceChildren(
      ...last.notes.map((n) => {
        const li = document.createElement('li');
        li.textContent = n;
        return li;
      }),
    );
  }
  drawMoveOverlay();
  // The menu's own Settings window can change these too.
  viewModeSelect.value = VIEW_MODES[setting(menu, 'viewMode')];
  clockBox.checked = setting(menu, 'clock12h') === 1;
  coversBox.checked = setting(menu, 'showCovers') === 1;
  languageSelect.value = menu.language;
  consoleSelect.value = menu.console;
  syncLanguage();
}

function press(key: Key) {
  if (last && act(menu, { type: 'key', key }, last.env)) redraw();
}

/** Starts the menu again from the top, keeping its settings. */
function resetMenu() {
  const settings = menu.settings;
  menu = newMenuState(menu.console, menu.language);
  menu.settings = settings;
}

// --------------------------------------------------------- language and console

const languageSelect = $<HTMLSelectElement>('#language');
const consoleSelect = $<HTMLSelectElement>('#console');
languageSelect.append(...LANGUAGES.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })));
const fonts = new Map<string, PreviewFont>();
let switchingTo = '';

/**
 * Brings the menu text (and font, for languages that use another one) in line with
 * the menu's language, which the language selector or Preview options can change.
 */
function syncLanguage() {
  if (menu.language === currentLanguage() || menu.language === switchingTo) return;
  const target = (switchingTo = menu.language);
  setLanguage(target)
    .then(async () => {
      const name = languageFont();
      if (!fonts.has(name)) fonts.set(name, await loadMenuFont(name));
      font = fonts.get(name)!;
    })
    .catch(() => say(`The ${target} text couldn’t be loaded, so the preview stays as it was.`))
    .finally(() => {
      if (switchingTo === target) switchingTo = '';
      redraw();
    });
}

languageSelect.addEventListener('change', () => {
  menu.language = languageSelect.value;
  saveView();
  redraw();
});
consoleSelect.addEventListener('change', () => {
  setConsole(menu, consoleSelect.value as Console);
  saveView();
  redraw();
});

// ------------------------------------------------------- tapping and moving

/** An element being moved: click it to start, drag the handle, tick to finish. */
interface Moving {
  file: ThemeFile;
  section: string;
  screen: Placed['screen'];
  /** Puts the x/y back as they were, for Esc. */
  restore: () => void;
}
let moving: Moving | null = null;

const layers = {
  top: $<HTMLDivElement>('.move-layer[data-screen="top"]'),
  bottom: $<HTMLDivElement>('.move-layer[data-screen="bottom"]'),
};

/** Where a pointer event lands, in DS pixels. */
function dsPoint(canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.floor(((e.clientX - r.left) / r.width) * SCREEN_W),
    y: Math.floor(((e.clientY - r.top) / r.height) * SCREEN_H),
  };
}

/** The outline, handle and tick for the current move; built once, then repositioned. */
let overlay: { for: Moving; box: HTMLDivElement; bar: HTMLDivElement; tag: HTMLSpanElement } | null = null;

/** Draws the outline, move handle and tick over the element being moved. */
function drawMoveOverlay() {
  if (!moving || !last) {
    overlay?.box.remove();
    overlay = null;
    return;
  }
  if (overlay?.for !== moving) {
    overlay?.box.remove();
    overlay = buildOverlay(moving);
  }
  const { box, bar, tag } = overlay;
  const el = sameElement(last.elements, moving);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  box.hidden = !el;
  if (el) Object.assign(box.style, { left: pct(el.x, SCREEN_W), top: pct(el.y, SCREEN_H), width: pct(el.w, SCREEN_W), height: pct(el.h, SCREEN_H) });
  // Keep the tick and label on screen: below the element near the top, left of it near the right.
  bar.classList.toggle('below', !!el && el.y < SCREEN_H / 3);
  bar.classList.toggle('right', !!el && el.x + el.w / 2 > SCREEN_W / 2);
  const doc = moving.file === 'custom.ini' ? theme.custom : theme.uisettings;
  const size = el?.size ? ` · ${el.size.w}×${el.size.h}` : '';
  tag.textContent = `${sectionLabel(moving)} ${doc.get(moving.section, 'x') ?? el?.originX}, ${doc.get(moving.section, 'y') ?? el?.originY}${size}`;
}

/** Calls onDrag with how far the pointer has moved, in DS pixels, while a handle is dragged. */
function dragHandle(handle: HTMLButtonElement, onStart: () => boolean, onDrag: (dx: number, dy: number) => void) {
  handle.addEventListener('pointerdown', (e) => {
    if (!moving || !last || !onStart()) return;
    e.preventDefault();
    const canvas = moving.screen === 'top' ? topCtx.canvas : bottomCanvas;
    const from = dsPoint(canvas, e);
    try {
      // Keeps the drag going when the pointer leaves the handle.
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured; the drag still works over the handle.
    }
    handle.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      if (!moving) return;
      const to = dsPoint(canvas, ev);
      onDrag(to.x - from.x, to.y - from.y);
      redraw();
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.focus();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

function buildOverlay(m: Moving) {
  const layer = layers[m.screen];
  const box = document.createElement('div');
  box.className = 'move-box';

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'move-handle';
  handle.textContent = '✥';
  handle.setAttribute('aria-label', `Move ${sectionLabel(m)}. Drag, or use the arrow keys.`);

  const bar = document.createElement('div');
  bar.className = 'move-bar';
  const tag = document.createElement('span');
  tag.className = 'move-tag';
  const tick = document.createElement('button');
  tick.type = 'button';
  tick.className = 'move-tick';
  tick.textContent = '✓';
  tick.setAttribute('aria-label', 'Done moving');
  tick.addEventListener('click', finishMove);
  bar.append(tag, tick);
  box.append(handle, bar);
  layer.append(box);

  // Dragging the handle moves the element by whole DS pixels from where the drag began.
  let from: Placed | undefined;
  dragHandle(
    handle,
    () => !!(from = last && moving ? sameElement(last.elements, moving) : undefined),
    (dx, dy) => from && moving && setPosition(theme, moving, from.originX + dx, from.originY + dy),
  );

  // Elements whose width and height set what's drawn get a corner handle to resize them.
  const sizing = last ? sameElement(last.elements, m)?.size : undefined;
  if (sizing) {
    const resize = document.createElement('button');
    resize.type = 'button';
    resize.className = 'move-resize';
    resize.setAttribute('aria-label', `Resize ${sectionLabel(m)}. Drag, or use the arrow keys.`);
    box.append(resize);
    let base: Placed | undefined;
    dragHandle(
      resize,
      () => !!(base = last && moving ? sameElement(last.elements, moving) : undefined),
      (dx, dy) => {
        const sz = base?.size;
        if (sz && moving) setSize(theme, { ...moving, size: sz }, sz.w * sz.perW + dx, sz.h * sz.perH + dy);
      },
    );
    resize.addEventListener('keydown', resizeKeys);
  }
  handle.addEventListener('keydown', moveKeys);
  return { for: m, box, bar, tag };
}

function startMove(el: Placed) {
  const theTheme = theme;
  moving = { file: el.file, section: el.section, screen: el.screen, restore: savePosition(theTheme, el) };
  redraw();
  layers[el.screen].querySelector<HTMLButtonElement>('.move-handle')?.focus();
  const resize = el.size ? ', or the corner to resize it' : '';
  say(`Moving ${sectionLabel(el)}: drag the handle${resize} or use the arrow keys, then press the tick or click something else (Esc cancels).`);
}

function finishMove() {
  if (!moving) return;
  const label = sectionLabel(moving);
  const doc = moving.file === 'custom.ini' ? theme.custom : theme.uisettings;
  const where = `${doc.get(moving.section, 'x')}, ${doc.get(moving.section, 'y')}`;
  const { file, section } = moving;
  moving = null;
  themeChanged(true);
  panels.build();
  panels.reveal(file, section);
  redraw();
  $('#screens').focus();
  say(`${label} is now at ${where}.`);
}

function cancelMove() {
  if (!moving) return;
  moving.restore();
  moving = null;
  panels.build();
  redraw();
  $('#screens').focus();
  say('Move cancelled.');
}

/** Arrow keys nudge by a pixel (8 with Shift); Enter finishes; Esc cancels. */
/** On the resize handle, arrow keys change the size a step at a time (Shift: 8 steps). */
function resizeKeys(e: KeyboardEvent) {
  if (!moving || !last) return;
  const el = sameElement(last.elements, moving);
  const step = e.shiftKey ? 8 : 1;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (!(e.key in d) || !el?.size) return moveKeys(e);
  const sz = el.size;
  setSize(theme, el, (sz.w + d[e.key][0]) * sz.perW, (sz.h + d[e.key][1]) * sz.perH);
  redraw();
  e.preventDefault();
  e.stopPropagation();
}

function moveKeys(e: KeyboardEvent) {
  if (!moving || !last) return;
  const step = e.shiftKey ? 8 : 1;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (e.key in d) {
    const el = sameElement(last.elements, moving);
    if (el) {
      setPosition(theme, moving, el.originX + d[e.key][0], el.originY + d[e.key][1]);
      redraw();
    }
  } else if (e.key === 'Enter') {
    finishMove();
  } else if (e.key === 'Escape') {
    cancelMove();
  } else {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
}

type ClickMode = 'move' | 'touch';
const modeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="click-mode"]')];
const clickMode = (): ClickMode => (modeInputs.find((i) => i.checked)?.value as ClickMode) ?? 'move';
const MODE_HINTS: Record<ClickMode, string> = {
  move: 'Click something on the screens to move it. To move the start menu, open it with the START button below the screens first.',
  touch: 'Tap the bottom screen to use the menu, just like the DS.',
};

/** Shows the current click mode on the screens and in the hint line. */
function applyMode() {
  const mode = clickMode();
  if (mode === 'touch' && moving) finishMove();
  $('#screens').classList.toggle('touch', mode === 'touch');
  say(MODE_HINTS[mode]);
}

// In Move things mode a click on anything movable picks it up, the open start menu
// included (open it with START). Anything else, like the game list, works the menu as
// a tap on the DS would.
function onTap(canvas: HTMLCanvasElement, screen: Placed['screen'], e: PointerEvent) {
  if (!last) return;
  const p = dsPoint(canvas, e);
  if (moving) {
    // No need for the tick: clicking something else keeps this move and picks that up;
    // clicking an empty spot just keeps it. Clicks on the item being moved do nothing.
    const other = elementAt(last.elements, screen, p.x, p.y);
    if (other && other.file === moving.file && other.section === moving.section) return;
    finishMove();
    if (other) startMove(other);
    return;
  }
  const target =
    screen === 'bottom' ? [...last.hits].reverse().find((h) => p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) : undefined;
  // In "Use the menu" mode the bottom screen is just a touchscreen.
  const el = clickMode() === 'move' ? elementAt(last.elements, screen, p.x, p.y) : undefined;
  if (el) return startMove(el);
  if (target && act(menu, target.action, last.env)) redraw();
}

for (const [canvas, screen] of [[bottomCanvas, 'bottom'], [topCtx.canvas, 'top']] as const) {
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    // A tap, not a drag or scroll.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) onTap(canvas, screen, e);
    down = null;
  });
}

// Keys, like an emulator: arrows, A = X/Enter, B = Z/Esc/Backspace, X = S, Y = A,
// L = Q, R = W, START = Space, SELECT = Shift. Only while the screens have focus.
const KEYS: Record<string, Key> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  x: 'A', Enter: 'A', z: 'B', Escape: 'B', Backspace: 'B', s: 'X', a: 'Y',
  q: 'L', w: 'R', ' ': 'START', Shift: 'SELECT',
};
$('#screens').addEventListener('keydown', (e) => {
  if (moving) return moveKeys(e);
  const key = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  press(key);
});
for (const b of document.querySelectorAll<HTMLButtonElement>('#ds-buttons button[data-key]')) {
  b.addEventListener('click', () => press(b.dataset.key as Key));
}
$('#menu-reset').addEventListener('click', () => {
  resetMenu();
  redraw();
});

viewModeSelect.addEventListener('change', () => {
  setSetting(menu, 'viewMode', VIEW_MODES.indexOf(viewModeSelect.value as ViewMode));
  redraw();
});
clockBox.addEventListener('change', () => {
  setSetting(menu, 'clock12h', clockBox.checked ? 1 : 0);
  redraw();
});
coversBox.addEventListener('change', () => {
  setSetting(menu, 'showCovers', coversBox.checked ? 1 : 0);
  redraw();
});
cardBox.addEventListener('change', redraw);

// ------------------------------------------------------------- preview size

const sizeSelect = $<HTMLSelectElement>('#preview-size');
const layoutSelect = $<HTMLSelectElement>('#preview-layout');
const stageScreens = $<HTMLDivElement>('.stage-screens');
const dsFrame = $<HTMLDivElement>('#screens');
const smoothBox = $<HTMLInputElement>('#smooth');
// Renamed from aktheme.previewView when Stacked became the default layout.
const VIEW_STORE = 'aktheme.preview';

try {
  const saved = JSON.parse(localStorage.getItem(VIEW_STORE) ?? '{}') as {
    size?: string; layout?: string; smooth?: boolean; mode?: string; language?: string; console?: string;
  };
  if (saved.language && LANGUAGES.includes(saved.language)) menu.language = saved.language;
  if (saved.console === 'dsi') menu.console = 'dsi';
  const has = (sel: HTMLSelectElement, v?: string) => !!v && [...sel.options].some((o) => o.value === v);
  if (has(sizeSelect, saved.size)) sizeSelect.value = saved.size!;
  if (has(layoutSelect, saved.layout)) layoutSelect.value = saved.layout!;
  smoothBox.checked = saved.smooth === true;
  for (const i of modeInputs) i.checked = i.value === (saved.mode === 'touch' ? 'touch' : 'move');
} catch {
  // Storage blocked or unreadable: use the defaults.
}

function saveView() {
  try {
    localStorage.setItem(
      VIEW_STORE,
      JSON.stringify({ size: sizeSelect.value, layout: layoutSelect.value, smooth: smoothBox.checked, mode: clickMode(), language: menu.language, console: menu.console }),
    );
  } catch {
    // Not remembered; that's fine.
  }
}

/**
 * Sizes both screens to the room the preview has. Fit fills it; Sharp keeps whole
 * device pixels per DS pixel so nothing is uneven; 1×–4× are exact zooms. Auto puts
 * the screens side by side when that makes them bigger.
 */
function applySize() {
  const dpr = window.devicePixelRatio || 1;
  const stacked = matchMedia('(max-width: 900px)').matches;
  const availW = stageScreens.clientWidth - 24;
  const availH = (stacked ? window.innerHeight * 0.8 : stageScreens.clientHeight) - 8;
  const frame = 20; // the DS frame's padding on both sides
  const gap = 10; // between the screens
  const fitFor = (side: boolean) =>
    side
      ? Math.min((availW - frame - gap) / (SCREEN_W * 2), (availH - frame) / SCREEN_H)
      : Math.min((availW - frame) / SCREEN_W, (availH - frame - gap) / (SCREEN_H * 2));
  const side = layoutSelect.value === 'side' || (layoutSelect.value === 'auto' && fitFor(true) > fitFor(false));
  const fit = Math.max(fitFor(side), 0.25);
  let scale: number;
  if (sizeSelect.value === 'fit') scale = fit;
  else if (sizeSelect.value === 'sharp') scale = Math.floor(fit * dpr) >= 1 ? Math.floor(fit * dpr) / dpr : fit;
  else scale = Math.max(1, Math.round(Number(sizeSelect.value) * dpr)) / dpr;
  dsFrame.classList.toggle('side', side);
  for (const c of [topCtx.canvas, bottomCanvas]) {
    c.style.width = `${SCREEN_W * scale}px`;
    c.style.height = `${SCREEN_H * scale}px`;
  }
}
for (const sel of [sizeSelect, layoutSelect]) {
  sel.addEventListener('change', () => {
    saveView();
    applySize();
  });
}

// Bilinear filtering: the browser smooths the scaled-up screens instead of keeping hard pixels.
function applySmooth() {
  dsFrame.classList.toggle('smooth', smoothBox.checked);
}
smoothBox.addEventListener('change', () => {
  saveView();
  applySmooth();
});
applySmooth();

for (const i of modeInputs) {
  i.addEventListener('change', () => {
    saveView();
    applyMode();
  });
}
applyMode();
new ResizeObserver(applySize).observe(stageScreens);
window.addEventListener('resize', applySize);
applySize();

loadStockIcons()
  .then((icons) => {
    stockIcons = icons;
    panels.build(); // the icon grid shows them
    redraw();
  })
  .catch(() => {
    // The list falls back to outlines.
  });

loadMenuFont()
  .then((f) => {
    fonts.set('liberation.pcf', f);
    font = f;
    redraw();
  })
  .catch((err) => say(`The preview couldn’t start: ${(err as Error).message}`));

// irqs.cpp cIRQ::vBlank: every 32 frames the colon flips and the top screen is redrawn
// (which also keeps the clock and calendar current). The DS runs at 59.8261 frames a second.
const DS_FPS = 59.8261;
setInterval(() => {
  colonShow = !colonShow;
  redraw();
}, (32 * 1000) / DS_FPS);


/** Saves a file through the browser's normal download. */
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$<HTMLInputElement>('#theme-name').addEventListener('input', (e) => {
  theme.name = (e.target as HTMLInputElement).value;
  // The custom picture's SD path includes the theme's folder name.
  if (syncCustomPicturePath(theme)) panels.build();
  redraw();
  themeChanged();
});

// ------------------------------------------------------- undo and autosave

const edits = new History(theme);
const undoButton = $<HTMLButtonElement>('#undo');
const redoButton = $<HTMLButtonElement>('#redo');

function saveSoon() {
  saveWorkSoon(
    () => ({ theme: snapshot(theme), flavour, savedAt: Date.now() }),
    () => say('This browser won’t let the editor save your work, so export it before you leave.'),
  );
}

/** Call after any change to the theme: it becomes an undo step and is saved. */
function themeChanged(separate = false) {
  edits.record(theme, performance.now(), separate);
  undoButton.disabled = !edits.canUndo;
  redoButton.disabled = !edits.canRedo;
  saveSoon();
}

/** Shows a theme from the undo history. */
function showTheme(next: Theme | null, done: string) {
  if (!next) return;
  moving = null;
  theme = next;
  $<HTMLInputElement>('#theme-name').value = theme.name;
  panels.build();
  redraw();
  undoButton.disabled = !edits.canUndo;
  redoButton.disabled = !edits.canRedo;
  saveSoon();
  say(done);
}

const undo = () => showTheme(edits.undo(), 'Undone.');
const redo = () => showTheme(edits.redo(), 'Redone.');
undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  // Text boxes keep their own undo.
  const t = e.target;
  if (t instanceof Element && t.matches('textarea, input:not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])')) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key === 'z' && e.shiftKey) || key === 'y') {
    e.preventDefault();
    redo();
  }
});

/** Swaps in a newly opened theme. `fresh` starts the undo history again. */
function openTheme(next: Theme, fresh = false) {
  moving = null;
  theme = next;
  $<HTMLInputElement>('#theme-name').value = theme.name;
  resetMenu();
  panels.build();
  redraw();
  if (fresh) {
    edits.reset(theme);
    undoButton.disabled = redoButton.disabled = true;
  } else {
    themeChanged(true);
  }
  say(`Opened “${theme.name}” (${theme.files.size} files).`);
}

$<HTMLSelectElement>('#flavour').addEventListener('change', (e) => {
  flavour = (e.target as HTMLSelectElement).value as Flavour;
  panels.build();
  redraw();
  saveSoon();
});

/**
 * The theme the editor starts from: Starlight, one of AKMenu-Next's own themes,
 * bundled at public/themes/Starlight.zip. Fetched once; each call gives a fresh copy.
 */
let starterZip: Promise<Uint8Array> | null = null;
function loadStarter(): Promise<Theme> {
  starterZip ??= fetch(`${import.meta.env.BASE_URL}themes/Starlight.zip`)
    .then((r) => {
      if (!r.ok) throw new Error(`couldn’t load it (${r.status})`);
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b));
  starterZip.catch(() => (starterZip = null)); // let a later try fetch it again
  return starterZip.then(importThemeZip);
}

$<HTMLButtonElement>('#new').addEventListener('click', async () => {
  if (!confirm('Start a new theme from Starlight? You can undo this.')) return;
  try {
    const t = await loadStarter();
    t.name = 'My Theme';
    openTheme(t);
    say('New theme started from Starlight. Change anything you like.');
  } catch {
    openTheme(newTheme());
    say('New, empty theme started.');
  }
});

$<HTMLButtonElement>('#import-button').addEventListener('click', () => $<HTMLInputElement>('#import').click());
$<HTMLInputElement>('#import').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    openTheme(importThemeZip(new Uint8Array(await file.arrayBuffer())));
  } catch (err) {
    say(`Couldn’t import that file: ${(err as Error).message}`);
  }
});

// ------------------------------------------------------------------ export

const exportDialog = $<HTMLDialogElement>('#export-check');

/** Shows what's wrong (and what a Classic export leaves out); resolves true to go ahead. */
function confirmExport(issues: Issue[], dropped: string[]): Promise<boolean> {
  const body = $<HTMLDivElement>('#export-check-body');
  body.replaceChildren();
  const section = (title: string, intro: string, items: string[], className: string) => {
    if (!items.length) return;
    const list = document.createElement('ul');
    list.className = className;
    list.append(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
    body.append(Object.assign(document.createElement('h3'), { textContent: title }), Object.assign(document.createElement('p'), { textContent: intro }), list);
  };
  section('The menu won’t use the theme', 'AKMenu-Next switches to another theme if any of these are wrong:', issues.filter((i) => i.level === 'problem').map((i) => i.message), 'problems');
  section('Won’t show', 'The theme works, but these parts won’t appear as you’d expect:', issues.filter((i) => i.level === 'warning').map((i) => i.message), 'warnings');
  section('Left out of a Classic theme', 'Wood R4 and Acekard themes can’t use these, so they aren’t in the zip:', dropped, 'dropped');
  $<HTMLButtonElement>('#export-anyway').textContent = issues.length ? 'Export anyway' : 'Export';
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      exportDialog.close();
      resolve(ok);
    };
    $<HTMLButtonElement>('#export-anyway').onclick = () => done(true);
    $<HTMLButtonElement>('#export-cancel').onclick = () => done(false);
    exportDialog.oncancel = () => resolve(false); // Esc
    exportDialog.showModal();
  });
}

$<HTMLButtonElement>('#export').addEventListener('click', async () => {
  const issues = checkTheme(theme, flavour);
  const { zip, dropped } = exportThemeZip(theme, flavour);
  if ((issues.length || dropped.length) && !(await confirmExport(issues, dropped))) return;
  download(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), `${themeFolder(theme.name)}.zip`);
  say('Exported. Unzip it into _nds/akmenunext/ui/ on your SD card.');
});

// Both screens as one 256×384 picture, at the DS's own size, like the bundled themes'
// screenshots/preview.gif. Taken from what the preview shows, without the move outline.
$<HTMLButtonElement>('#screenshot').addEventListener('click', () => {
  const shot = document.createElement('canvas');
  shot.width = SCREEN_W;
  shot.height = SCREEN_H * 2;
  const ctx = shot.getContext('2d')!;
  ctx.drawImage(topCtx.canvas, 0, 0);
  ctx.drawImage(bottomCanvas, 0, SCREEN_H);
  shot.toBlob((blob) => {
    if (!blob) return;
    download(blob, `${themeFolder(theme.name)} screenshot.png`);
    say('Screenshot saved.');
  }, 'image/png');
});

for (const c of [topCtx, bottomCtx]) {
  c.canvas.width = SCREEN_W;
  c.canvas.height = SCREEN_H;
}
panels.build();
redraw();

// Open Starlight to start with, unless something else was opened while it loaded.
// Pick up where you left off; otherwise open Starlight. Either way, unless something
// else was opened while it loaded.
const blank = theme;
loadWork()
  .then(async (saved) => {
    if (theme !== blank) return;
    if (saved) {
      flavour = saved.flavour;
      $<HTMLSelectElement>('#flavour').value = flavour;
      openTheme(restoreSnapshot(saved.theme), true);
      say('Welcome back: your theme is just as you left it. Press New to start again from Starlight.');
      return;
    }
    const t = await loadStarter();
    if (theme !== blank) return;
    openTheme(t, true);
    say('This is Starlight, one of AKMenu-Next’s own themes. Change anything you like, or import your own theme. Your work is saved in this browser as you go.');
  })
  .catch((err) => say(`Starlight didn’t load (${(err as Error).message}), so you’re starting with an empty theme.`));
