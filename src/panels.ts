// The settings side of the editor: tabs by where things are on the DS, a card per
// thing, and a search box. Layout comes from src/schema/layout.ts, fields from the schema.

import { countPureBlack, encodeBmp555, replacePureBlack, type RgbaImage } from './formats/bmp';
import { cssToDs, dsToCss, dsToHex, parseDsColour } from './formats/colour';
import { checkMusic, isMusicPath, nextMusicPath, type MusicInfo } from './formats/music';
import { loadMenuBitmap } from './preview/menubmp';
import { CUSTOM_PICTURE, CUSTOM_PICTURE_MAX_BYTES, ICON_LABELS, IMAGE_SLOTS, MUSIC, NEXT_ONLY_PATHS, SCHEMA, THEME_ICONS, type Flavour, type ImageSlot, type KeyDef, type SectionDef, type ThemeFile } from './schema';
import { BANNER_BYTES, decodeBannerIcon, encodeBannerIcon } from './formats/banner';
import { CARDS, TABS, type CardDef, type CardPart, type TabId } from './schema/layout';
import { customPicturePath, type Theme } from './theme';

export interface PanelHost {
  theme(): Theme;
  flavour(): Flavour;
  /**
   * Something in the theme changed: redraw and record it. `separate` keeps it as its own
   * undo step (adding a file), rather than merging with quick edits (typing, a colour drag).
   */
  changed(separate?: boolean): void;
  say(message: string): void;
  /** The menu's own icon for an icons/ path, once loaded. */
  stockIcon(path: string): Uint8Array | undefined;
}

const TAB_STORE = 'aktheme.settingsTab';

function storedTab(): TabId {
  try {
    const t = localStorage.getItem(TAB_STORE) as TabId | null;
    if (t && TABS.some((x) => x.id === t)) return t;
  } catch {
    // Storage blocked: start on the first tab.
  }
  return TABS[0].id;
}

/** document.createElement with properties (e.g. className, value) and children. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

let uid = 0;
const nextId = (base: string) => `${base.replace(/\W+/g, '-')}-${++uid}`;

export function createPanels(container: HTMLElement, host: PanelHost) {
  let activeTab = storedTab();
  let query = '';

  const docFor = (file: ThemeFile) => (file === 'custom.ini' ? host.theme().custom : host.theme().uisettings);
  const sectionDef = (part: CardPart) => SCHEMA.find((s) => s.file === part.file && s.section === part.section)!;
  const visibleParts = (card: CardDef) => card.parts.filter((p) => sectionDef(p).flavours.includes(host.flavour()));
  // Classic themes can't have music, icons or the AKMenu-Next-only pictures.
  const imagesFor = (card: CardDef) =>
    (card.images ?? []).filter((p) => host.flavour() === 'next' || !NEXT_ONLY_PATHS.some((r) => r.test(p)));
  const cardShown = (card: CardDef) =>
    card.music || card.icons ? host.flavour() === 'next' : imagesFor(card).length > 0 || visibleParts(card).length > 0;

  // ------------------------------------------------------------------ fields

  function setValue(s: SectionDef, key: string, value: string) {
    const doc = docFor(s.file);
    if (value === '') doc.delete(s.section, key);
    else doc.set(s.section, key, value);
    host.changed();
  }

  function numberInput(s: SectionDef, k: KeyDef, label?: string) {
    const current = docFor(s.file).get(s.section, k.key);
    const input = el('input', { type: 'number', value: current ?? '', id: nextId(`f-${s.section}-${k.key}`) });
    if (k.min !== undefined) input.min = String(k.min);
    if (k.max !== undefined) input.max = String(k.max);
    input.placeholder = k.default !== undefined ? String(k.default) : s.section === 'cover' ? 'centre' : '';
    input.dataset.key = `${s.file}|${s.section}|${k.key}`;
    if (label) input.setAttribute('aria-label', label);
    input.addEventListener('input', () => setValue(s, k.key, input.value.trim()));
    return input;
  }

  /** A row with a label and whatever controls it needs. */
  function row(labelText: string, forId: string | null, controls: Node[], help?: string, wide = false) {
    const label = el('label', { textContent: labelText });
    if (forId) label.htmlFor = forId;
    // Wide rows take the whole card width; short ones pack two to a row.
    const r = el('div', { className: wide ? 'field wide' : 'field' }, label, el('div', { className: 'controls' }, ...controls));
    if (help) r.append(el('small', { className: 'help', textContent: help }));
    return r;
  }

  function field(s: SectionDef, k: KeyDef): HTMLElement {
    const current = docFor(s.file).get(s.section, k.key);
    const id = nextId(`f-${s.section}-${k.key}`);

    if (k.type === 'colour') {
      const value = parseDsColour(current ?? '') ?? (k.default as number) ?? 0;
      const picker = el('input', { type: 'color', id, value: dsToCss(value) });
      const hex = el('output', { textContent: dsToHex(value) });
      hex.setAttribute('for', id);
      picker.addEventListener('input', () => {
        const ds = cssToDs(picker.value);
        hex.textContent = dsToHex(ds);
        setValue(s, k.key, dsToHex(ds));
      });
      return row(k.label, id, [picker, hex], k.help);
    }
    if (k.type === 'bool') {
      const box = el('input', { type: 'checkbox', id, className: 'switch', checked: (current ?? String(k.default ?? 0)) !== '0' });
      box.setAttribute('role', 'switch');
      box.addEventListener('change', () => {
        setValue(s, k.key, box.checked ? '1' : '0');
        if (k.key === 'show') box.closest('.part')?.classList.toggle('off', !box.checked);
      });
      return row(k.label, id, [box], k.help, k.key === 'show');
    }
    if (k.type === 'string' && k.options) {
      const select = el('select', { id });
      for (const o of k.options) select.append(el('option', { value: o, textContent: o }));
      select.value = current ?? String(k.default ?? k.options[0]);
      select.addEventListener('change', () => setValue(s, k.key, select.value));
      return row(k.label, id, [select], k.help, true);
    }
    if (k.type === 'string') {
      const input = el('input', { type: 'text', id, value: current ?? '', placeholder: k.default !== undefined ? String(k.default) : '' });
      input.addEventListener('input', () => setValue(s, k.key, input.value.trim()));
      return row(k.label, id, [input], k.help, true);
    }
    const input = numberInput(s, k);
    input.id = id;
    return row(k.label, id, [input], k.help);
  }

  /** X and Y (or width and height) side by side. */
  function pairRow(s: SectionDef, a: KeyDef, b: KeyDef, title: string, help?: string) {
    const ia = numberInput(s, a, `${title} ${a.label}`);
    const ib = numberInput(s, b, `${title} ${b.label}`);
    const tag = (text: string, input: HTMLInputElement) => el('label', { className: 'pair' }, el('span', { textContent: text }), input);
    const help2 = help ?? [a.help, b.help].filter((h, i, all) => h && all.indexOf(h) === i).join(' ');
    return row(title, null, [tag(a.label === 'X' ? 'X' : 'Width', ia), tag(b.label === 'Y' ? 'Y' : 'Height', ib)], help2 || undefined, true);
  }

  function partFields(part: CardPart): HTMLElement {
    const s = sectionDef(part);
    const keys = s.keys.filter((k) => !part.keys || part.keys.includes(k.key));
    const box = el('div', { className: 'part' });
    if (part.heading) box.append(el('h4', { textContent: part.heading }));
    const by = (key: string) => keys.find((k) => k.key === key);
    const done = new Set<string>();

    const show = by('show');
    if (show) {
      box.append(field(s, show));
      done.add('show');
      const on = (docFor(s.file).get(s.section, 'show') ?? String(show.default ?? 0)) !== '0';
      box.classList.toggle('off', !on);
    }
    const x = by('x'), y = by('y');
    if (x && y) {
      box.append(pairRow(s, x, y, 'Position'));
      done.add('x').add('y');
    }
    const w = by('w'), h = by('h');
    if (w && h) {
      box.append(pairRow(s, w, h, 'Size'));
      done.add('w').add('h');
    }
    const dw = by('dw'), dh = by('dh');
    if (dw && dh) {
      box.append(pairRow(s, dw, dh, 'Cell size'));
      done.add('dw').add('dh');
    }
    for (const k of keys) if (!done.has(k.key)) box.append(field(s, k));
    return box;
  }

  // ------------------------------------------------------------ pictures

  /** The theme's own key for a path (FAT is case-insensitive), if it has that file. */
  const fileKey = (path: string) => [...host.theme().files.keys()].find((p) => p.toLowerCase() === path.toLowerCase());

  const IMAGE_TYPES = 'image/png,image/jpeg,image/bmp,image/gif,image/webp';

  /** Decodes any browser-supported picture and fits it as the slot asks. */
  async function loadImage(file: File, fit: 'cover' | 'stretch' | 'contain' | 'none', w?: number, h?: number): Promise<RgbaImage> {
    const bitmap = await createImageBitmap(file);
    const width = fit === 'none' ? bitmap.width : w!;
    const height = fit === 'none' ? bitmap.height : h!;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    if (fit === 'stretch' || fit === 'none') {
      ctx.drawImage(bitmap, 0, 0, width, height);
    } else {
      const pick = fit === 'cover' ? Math.max : Math.min;
      const scale = pick(width / bitmap.width, height / bitmap.height);
      const dw = bitmap.width * scale;
      const dh = bitmap.height * scale;
      ctx.drawImage(bitmap, (width - dw) / 2, (height - dh) / 2, dw, dh);
    }
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  }

  /** Puts RGBA pixels on a thumbnail canvas. */
  function paint(thumb: HTMLCanvasElement, img: RgbaImage) {
    thumb.width = img.width;
    thumb.height = img.height;
    thumb.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  }

  /** Shows the picture as the DS would load it (black see-through), or says why it can't. */
  function drawThumb(thumb: HTMLCanvasElement, note: HTMLElement, slot: ImageSlot) {
    const key = fileKey(slot.path);
    thumb.getContext('2d')!.clearRect(0, 0, thumb.width, thumb.height);
    note.classList.remove('warn');
    if (!key) {
      note.textContent = slot.required ? `Missing: the menu won’t use the theme without it. ${slot.help}` : slot.help;
      note.classList.toggle('warn', !!slot.required);
      return;
    }
    const res = loadMenuBitmap(host.theme().files.get(key)!);
    if (!res.ok) {
      note.textContent = `This won’t work on the DS: ${res.reason}. Replace it to convert it.`;
      note.classList.add('warn');
      return;
    }
    const { bitmap } = res;
    const data = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
    const expand = (c: number) => (c << 3) | (c >> 2);
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        const px = bitmap.pixels[y * bitmap.pitch + x];
        const opaque = slot.screen || px & 0x8000;
        data.set([expand(px & 31), expand((px >> 5) & 31), expand((px >> 10) & 31), opaque ? 255 : 0], (y * bitmap.width + x) * 4);
      }
    }
    paint(thumb, { width: bitmap.width, height: bitmap.height, data });
    // Spell out the size rules the menu relies on.
    let problem = '';
    if (slot.width && (bitmap.width !== slot.width || bitmap.height !== slot.height)) {
      problem = `It’s ${bitmap.width}×${bitmap.height}; it needs to be ${slot.width}×${slot.height}.`;
    } else if (slot.digits && bitmap.height % 10) {
      problem = `It’s ${bitmap.height} tall, which doesn’t split into 10 equal digits.`;
    }
    note.textContent = problem || `${bitmap.width}×${bitmap.height}. ${slot.help}`;
    note.classList.toggle('warn', !!problem);
  }

  /**
   * A picture slot: thumbnail, name and Replace / Remove. Full-screen pictures get a
   * bigger thumbnail; the rest are a single compact row.
   */
  function imageField(path: string): HTMLElement {
    const slot = IMAGE_SLOTS.find((s) => s.path === path)!;
    const id = nextId(`img-${path}`);
    const thumb = el('canvas', { className: slot.screen ? 'thumb' : 'thumb small', width: 1, height: 1 });
    thumb.setAttribute('aria-hidden', 'true');
    const note = el('small', { className: 'help' });
    const input = el('input', { type: 'file', id, accept: IMAGE_TYPES, hidden: true });
    // A real button (not a label) so the keyboard can reach it.
    const replace = el('button', { type: 'button' });
    replace.addEventListener('click', () => input.click());
    const remove = el('button', { type: 'button', textContent: 'Remove' });
    remove.setAttribute('aria-label', `Remove ${slot.label.toLowerCase()}`);
    const update = () => {
      const has = !!fileKey(path);
      replace.textContent = has ? 'Replace…' : 'Add…';
      // Required pictures can only be replaced: without one the menu rejects the theme.
      remove.hidden = !has || !!slot.required;
      drawThumb(thumb, note, slot);
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      let img: RgbaImage;
      try {
        img = await loadImage(file, slot.fit, slot.width, slot.height);
      } catch {
        host.say(`${file.name} isn’t a picture this browser can open.`);
        return;
      }
      // Pure black is see-through on the DS. On full-screen pictures that's rarely
      // wanted; on others it's usually the point, unless the picture already uses real
      // transparency, in which case stray black is probably a mistake.
      const black = countPureBlack(img);
      const usesAlpha = img.data.some((v, i) => i % 4 === 3 && v < 128);
      if (black > 0 && (slot.screen || usesAlpha) && confirm(`${black} pixels are pure black, which the DS shows as see-through. Swap them for a very dark grey?`)) {
        img = replacePureBlack(img);
      }
      const key = fileKey(path) ?? path;
      host.theme().files.set(key, encodeBmp555(img));
      update();
      host.say(`${slot.label} updated.`);
      host.changed(true);
    });
    remove.addEventListener('click', () => {
      const key = fileKey(path);
      if (!key || !confirm(`Remove the ${slot.label.toLowerCase()} picture (${path})?`)) return;
      host.theme().files.delete(key);
      update();
      host.say(`${slot.label} removed.`);
      host.changed(true);
    });
    update();
    const text = el('div', { className: 'image-text' }, el('strong', { textContent: slot.label }), note);
    const buttons = el('div', { className: 'image-buttons' }, replace, input, remove);
    return el('div', { className: slot.screen ? 'image-field' : 'image-field compact' }, thumb, text, buttons);
  }

  /**
   * The custom picture: upload it and the editor stores it in the theme, fills in the
   * full SD path custom.ini needs, and switches it on.
   */
  function customPictureField(): HTMLElement {
    const id = nextId('custom-picture');
    const thumb = el('canvas', { className: 'thumb small', width: 1, height: 1 });
    thumb.setAttribute('aria-hidden', 'true');
    const note = el('small', { className: 'help' });
    const input = el('input', { type: 'file', id, accept: IMAGE_TYPES, hidden: true });
    const choose = el('button', { type: 'button' });
    choose.addEventListener('click', () => input.click());
    const remove = el('button', { type: 'button', textContent: 'Remove' });
    remove.setAttribute('aria-label', 'Remove the custom picture');

    // The theme file the path in custom.ini points at, if it's in this theme.
    const pictureKey = () => {
      const path = host.theme().custom.get('custom picture', 'file') ?? '';
      const m = /_nds\/akmenunext\/ui\/[^/]+\/(.+)$/i.exec(path.replace(/\\/g, '/'));
      return m ? fileKey(m[1]) : undefined;
    };

    const update = () => {
      const key = pictureKey();
      const path = host.theme().custom.get('custom picture', 'file');
      choose.textContent = key ? 'Replace…' : 'Add…';
      remove.hidden = !key;
      thumb.getContext('2d')!.clearRect(0, 0, thumb.width, thumb.height);
      note.classList.remove('warn');
      if (!key) {
        note.textContent = path ? 'The path below points outside this theme, so the preview can’t show it.' : 'Up to 10KB; bigger pictures are shrunk to fit 64×64.';
        return;
      }
      const bytes = host.theme().files.get(key)!;
      const res = loadMenuBitmap(bytes);
      if (!res.ok) {
        note.textContent = `This won’t work on the DS: ${res.reason}.`;
        note.classList.add('warn');
        return;
      }
      const { bitmap } = res;
      const data = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
      const expand = (c: number) => (c << 3) | (c >> 2);
      bitmap.pixels.forEach((px, i) => {
        const x = i % bitmap.pitch, y = Math.floor(i / bitmap.pitch);
        if (x < bitmap.width) data.set([expand(px & 31), expand((px >> 5) & 31), expand((px >> 10) & 31), px & 0x8000 ? 255 : 0], (y * bitmap.width + x) * 4);
      });
      paint(thumb, { width: bitmap.width, height: bitmap.height, data });
      const tooBig = bytes.length > CUSTOM_PICTURE_MAX_BYTES;
      note.textContent = tooBig
        ? `It’s ${(bytes.length / 1024).toFixed(1)}KB; the menu ignores pictures over 10KB.`
        : `${bitmap.width}×${bitmap.height}, ${(bytes.length / 1024).toFixed(1)}KB.`;
      note.classList.toggle('warn', tooBig);
    };

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      let img: RgbaImage;
      try {
        // Keep its shape; only shrink it if it's bigger than 64×64, so it stays under 10KB.
        const probe = await createImageBitmap(file);
        const scale = Math.min(1, 64 / probe.width, 64 / probe.height);
        img = await loadImage(file, 'stretch', Math.max(1, Math.round(probe.width * scale)), Math.max(1, Math.round(probe.height * scale)));
      } catch {
        host.say(`${file.name} isn’t a picture this browser can open.`);
        return;
      }
      const theme = host.theme();
      theme.files.set(fileKey(CUSTOM_PICTURE) ?? CUSTOM_PICTURE, encodeBmp555(img));
      theme.custom.set('custom picture', 'file', customPicturePath(theme.name));
      theme.custom.set('custom picture', 'show', '1');
      host.say('Custom picture added. Drag it into place on the preview.');
      host.changed(true);
      build(); // the path and Show switch below change too
    });
    remove.addEventListener('click', () => {
      const key = pictureKey();
      if (!key || !confirm('Remove the custom picture from the theme?')) return;
      host.theme().files.delete(key);
      host.theme().custom.delete('custom picture', 'file');
      host.theme().custom.set('custom picture', 'show', '0');
      host.say('Custom picture removed.');
      host.changed(true);
      build();
    });
    update();
    const text = el('div', { className: 'image-text' }, el('strong', { textContent: 'Picture' }), note);
    return el('div', { className: 'image-field compact' }, thumb, text, el('div', { className: 'image-buttons' }, choose, input, remove));
  }

  /** The 11 file list icons: the theme's own, or the menu's (dimmed). Click to replace. */
  function iconGrid(): HTMLElement {
    const grid = el('div', { className: 'icon-grid' });
    const note = el('small', { className: 'help' });
    const refresh = () => {
      grid.replaceChildren();
      for (const path of Object.values(THEME_ICONS)) {
        const key = fileKey(path);
        const own = key ? host.theme().files.get(key)! : undefined;
        const usable = own && own.length >= BANNER_BYTES;
        const stock = host.stockIcon(path);
        const label = ICON_LABELS[path] ?? path;
        const id = nextId(`icon-${path}`);
        const thumb = el('canvas', { width: 32, height: 32 });
        thumb.setAttribute('aria-hidden', 'true');
        const shown = usable ? own : stock;
        if (shown) paint(thumb, decodeBannerIcon(shown));
        const input = el('input', { type: 'file', id, accept: IMAGE_TYPES, hidden: true });
        const tile = el('button', { type: 'button', className: usable ? 'icon-tile own' : 'icon-tile', title: `${label}: ${usable ? 'your icon' : 'the menu’s own'}. Click to choose a picture.` }, thumb, el('span', { textContent: label }));
        tile.setAttribute('aria-label', `${label} icon (${usable ? 'your own' : 'the menu’s own'}). Choose a picture`);
        tile.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          input.value = '';
          if (!file) return;
          try {
            const img = await loadImage(file, 'contain', 32, 32);
            host.theme().files.set(key ?? path, encodeBannerIcon(img));
            host.say(`${label} icon updated.`);
            refresh();
            host.changed(true);
          } catch {
            host.say(`${file.name} isn’t a picture this browser can open.`);
          }
        });
        const cell = el('div', { className: 'icon-cell' }, tile, input);
        if (key) {
          const reset = el('button', { type: 'button', className: 'icon-reset', textContent: '×', title: 'Use the menu’s own icon' });
          reset.setAttribute('aria-label', `Use the menu’s own ${label} icon`);
          reset.addEventListener('click', () => {
            host.theme().files.delete(key);
            host.say(`${label} is back to the menu’s own icon.`);
            refresh();
            host.changed(true);
          });
          cell.append(reset);
        }
        grid.append(cell);
      }
      const own = Object.values(THEME_ICONS).filter((p) => fileKey(p)).length;
      note.textContent = own ? `${own} of ${Object.keys(THEME_ICONS).length} are this theme’s own; the faded ones are the menu’s.` : 'All of these are the menu’s own icons for now.';
    };
    refresh();
    return el('div', {}, grid, note);
  }

  // --------------------------------------------------------------- music

  function describeMusic(info: MusicInfo, bytes: number) {
    const mins = Math.floor(info.seconds / 60);
    const secs = String(Math.round(info.seconds % 60)).padStart(2, '0');
    const mb = (bytes / 1024 / 1024).toFixed(1);
    return `${info.kind} · ${info.channels === 1 ? 'mono' : 'stereo'} · ${info.sampleRate.toLocaleString('en-GB')} Hz · ${mins}:${secs} · ${mb} MB`;
  }

  /** An "Add music" button and the list of music files in the theme, each removable. */
  function musicField(): HTMLElement {
    const id = nextId('music');
    const input = el('input', { type: 'file', id, accept: '.wav,.bcstm', multiple: true, hidden: true });
    const add = el('button', { type: 'button', textContent: 'Add music…' });
    add.addEventListener('click', () => input.click());
    const list = el('ul', { className: 'music-list' });
    const room = el('small', { className: 'help' });

    const refresh = () => {
      const files = [...host.theme().files].filter(([p]) => isMusicPath(p)).sort(([a], [b]) => a.localeCompare(b, 'en'));
      list.replaceChildren();
      for (const [path, bytes] of files) {
        const check = checkMusic(path, bytes);
        const remove = el('button', { type: 'button', textContent: 'Remove' });
        remove.setAttribute('aria-label', `Remove ${path}`);
        remove.addEventListener('click', () => {
          if (!confirm(`Remove ${path} from the theme?`)) return;
          host.theme().files.delete(path);
          host.say(`${path} removed.`);
          refresh();
          host.changed(true);
        });
        const details = check.ok
          ? el('small', { className: 'help', textContent: describeMusic(check.info, bytes.length) })
          : el('small', { className: 'help warn', textContent: `The DS will skip this one: ${check.reason}.` });
        list.append(el('li', {}, el('div', {}, el('strong', { textContent: path }), details), remove));
      }
      if (!files.length) list.append(el('li', { className: 'empty', textContent: 'No music yet.' }));
      const free = MUSIC.stems.length * MUSIC.extensions.length - files.length;
      room.textContent = `Room for ${free} more (up to ${MUSIC.stems.length} WAV and ${MUSIC.stems.length} BCSTM files).`;
    };

    input.addEventListener('change', async () => {
      const picked = [...(input.files ?? [])];
      input.value = '';
      const added: string[] = [];
      const problems: string[] = [];
      for (const file of picked) {
        const ext = /\.(wav|bcstm)$/i.exec(file.name)?.[0].toLowerCase();
        if (!ext) {
          problems.push(`${file.name} isn’t a .wav or .bcstm file`);
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const check = checkMusic(file.name, bytes);
        if (!check.ok) {
          problems.push(`${file.name} won’t play on the DS: ${check.reason}`);
          continue;
        }
        const path = nextMusicPath(host.theme().files.keys(), ext);
        if (!path) {
          problems.push(`There’s no room for ${file.name}; remove a ${ext} file first`);
          continue;
        }
        host.theme().files.set(path, bytes);
        added.push(`${file.name} as ${path}`);
      }
      refresh();
      if (added.length) host.changed(true);
      host.say([added.length ? `Added ${added.join(', ')}.` : '', ...problems.map((p) => `${p}.`)].join(' ').trim());
    });

    refresh();
    return el('div', { className: 'music-field' }, el('div', { className: 'music-add' }, add, input, room), list);
  }

  // --------------------------------------------------------------- cards

  /** Text a search can match: names, descriptions, field labels and INI names. */
  function searchText(card: CardDef) {
    const bits = [card.label, card.description];
    for (const part of visibleParts(card)) {
      const s = sectionDef(part);
      bits.push(s.section, part.heading ?? '');
      for (const k of s.keys) if (!part.keys || part.keys.includes(k.key)) bits.push(k.label, k.key, k.help ?? '');
    }
    for (const img of card.images ?? []) bits.push(img, IMAGE_SLOTS.find((s) => s.path === img)?.label ?? '', 'picture image bmp');
    if (card.icons) bits.push('icon icons banner', ...Object.values(ICON_LABELS));
    if (card.music) bits.push('music bgm wav bcstm sound audio song');
    return bits.join(' ').toLowerCase();
  }

  function cardElement(card: CardDef): HTMLElement {
    const node = el('section', { className: 'card' });
    node.dataset.card = card.id;
    node.dataset.search = searchText(card);
    const headingId = nextId(`card-${card.id}`);
    node.setAttribute('aria-labelledby', headingId);
    node.append(el('h3', { id: headingId, textContent: card.label }), el('p', { className: 'desc', textContent: card.description }));
    const parts = visibleParts(card);
    if (card.customPicture) node.append(customPictureField());
    for (const part of parts) node.append(partFields(part));
    // Pictures come after the settings, under a small heading when there are both.
    const images = imagesFor(card);
    if (images.length && parts.length) node.append(el('h4', { className: 'pictures-heading', textContent: images.length > 1 ? 'Pictures' : 'Picture' }));
    for (const img of images) node.append(imageField(img));
    if (card.icons) node.append(iconGrid());
    if (card.music) node.append(musicField());
    return node;
  }

  // ---------------------------------------------------------------- tabs

  let tabButtons: HTMLButtonElement[] = [];
  let tabPanels: HTMLElement[] = [];
  let emptyNote: HTMLElement;
  let tablist: HTMLElement;

  function selectTab(id: TabId, focus = false) {
    activeTab = id;
    try {
      localStorage.setItem(TAB_STORE, id);
    } catch {
      // Not remembered; that's fine.
    }
    applyView();
    if (focus) tabButtons.find((b) => b.dataset.tab === id)?.focus();
  }

  /** Tabs normally; every matching card across tabs while searching. */
  function applyView() {
    const q = query.trim().toLowerCase();
    tablist.hidden = !!q;
    let matches = 0;
    for (const panel of tabPanels) {
      const cards = [...panel.querySelectorAll<HTMLElement>('.card')];
      let shown = 0;
      for (const c of cards) {
        const hit = !q || c.dataset.search!.includes(q);
        c.hidden = !hit;
        if (hit) shown++;
      }
      matches += q ? shown : 0;
      panel.hidden = q ? shown === 0 : panel.dataset.tab !== activeTab;
      panel.classList.toggle('searching', !!q);
    }
    for (const b of tabButtons) {
      const on = b.dataset.tab === activeTab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    emptyNote.hidden = !q || matches > 0;
    emptyNote.textContent = `Nothing matches “${query.trim()}”. Try a word like clock, colour or button.`;
  }

  function build() {
    container.replaceChildren();
    const search = el('input', { type: 'search', id: 'settings-search', value: query, placeholder: 'Find a setting, e.g. clock, colour, start' });
    search.addEventListener('input', () => {
      query = search.value;
      applyView();
    });

    tablist = el('div', { className: 'tabs' });
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Theme settings');
    tabButtons = [];
    tabPanels = [];
    for (const tab of TABS) {
      const cards = CARDS.filter((c) => c.tab === tab.id && cardShown(c));
      if (!cards.length) continue;
      const tabId = `tab-${tab.id}`;
      const panelId = `panel-${tab.id}`;
      const button = el('button', { type: 'button', id: tabId, textContent: tab.label });
      button.dataset.tab = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panelId);
      button.addEventListener('click', () => selectTab(tab.id));
      tabButtons.push(button);
      tablist.append(button);

      const panel = el('div', { id: panelId, className: 'tab-panel' });
      panel.dataset.tab = tab.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.append(el('h2', { className: 'tab-title', textContent: tab.label }), el('p', { className: 'tab-intro', textContent: tab.intro }));
      for (const c of cards) panel.append(cardElement(c));
      tabPanels.push(panel);
    }
    // Arrow keys move between tabs (WAI-ARIA tabs pattern).
    tablist.addEventListener('keydown', (e) => {
      const i = tabButtons.findIndex((b) => b.dataset.tab === activeTab);
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        selectTab(tabButtons[e.key === 'Home' ? 0 : tabButtons.length - 1].dataset.tab as TabId, true);
      } else if (step) {
        e.preventDefault();
        selectTab(tabButtons[(i + step + tabButtons.length) % tabButtons.length].dataset.tab as TabId, true);
      }
    });
    if (!tabButtons.some((b) => b.dataset.tab === activeTab)) activeTab = tabButtons[0].dataset.tab as TabId;
    emptyNote = el('p', { className: 'no-results' });
    // The search box and tabs stay at the top while the cards scroll.
    const head = el(
      'div',
      { className: 'settings-head' },
      el('div', { className: 'settings-search' }, el('label', { htmlFor: 'settings-search', className: 'visually-hidden', textContent: 'Find a setting' }), search),
      // Said once here rather than on every card that can be moved.
      el('p', { className: 'tip', textContent: 'Tip: to move something, click it on the preview and drag the handle.' }),
      tablist,
    );
    container.append(head, ...tabPanels, emptyNote);
    applyView();
  }

  /** Opens the card for an INI section and briefly highlights it. */
  function reveal(file: ThemeFile, section: string) {
    const card = CARDS.find((c) => c.parts.some((p) => p.file === file && p.section === section));
    if (!card) return;
    query = '';
    const search = container.querySelector<HTMLInputElement>('#settings-search');
    if (search) search.value = '';
    selectTab(card.tab);
    const node = container.querySelector<HTMLElement>(`[data-card="${card.id}"]`);
    if (!node) return;
    node.classList.remove('flash');
    void node.offsetWidth; // restart the highlight
    node.classList.add('flash');
    // Side by side, bring it into view; stacked (narrow screens), don't pull the page away from the preview.
    if (matchMedia('(min-width: 761px)').matches) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { build, reveal };
}
