// Puts the menu-accurate rendering from menu.ts onto the two preview canvases.

import { THEME_ICONS, type Flavour } from '../schema';
import type { Theme } from '../theme';
import type { PreviewFont } from './font';
import { renderTheme, type Hit, type PreviewOptions, type PreviewResult } from './menu';
import type { MenuState } from './navigator';
import { parsePcf } from './pcf';
import { SCREEN_H, SCREEN_W } from './surface';

export { SCREEN_H, SCREEN_W };
export type { Hit, PreviewOptions, PreviewResult };

/** One of the menu's fonts, bundled in public/fonts/ (liberation.pcf unless a language asks for another). */
export async function loadMenuFont(name = 'liberation.pcf'): Promise<PreviewFont> {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
  if (!res.ok) throw new Error(`couldn’t load the menu font (${res.status})`);
  return parsePcf(new Uint8Array(await res.arrayBuffer()));
}

/**
 * The menu's own file list icons, bundled at public/icons/ from akmenu-next's
 * arm9/data/. Keyed by their path in a theme (icons/…), like THEME_ICONS.
 */
export async function loadStockIcons(): Promise<Map<string, Uint8Array>> {
  const icons = new Map<string, Uint8Array>();
  await Promise.all(
    Object.values(THEME_ICONS).map(async (path) => {
      const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
      // A dev server answers missing files with the page itself, so check it isn't HTML.
      if (res.ok && !res.headers.get('content-type')?.includes('html')) icons.set(path, new Uint8Array(await res.arrayBuffer()));
    }),
  );
  return icons;
}

/** Draws both screens; the result has notes and the tap targets of the window in front. */
export function renderPreview(
  top: CanvasRenderingContext2D,
  bottom: CanvasRenderingContext2D,
  theme: Theme,
  flavour: Flavour,
  font: PreviewFont,
  state: MenuState,
  options: PreviewOptions,
): PreviewResult {
  const result = renderTheme(theme, flavour, font, state, options);
  top.putImageData(new ImageData(result.top.toRgba(), SCREEN_W, SCREEN_H), 0, 0);
  bottom.putImageData(new ImageData(result.bottom.toRgba(), SCREEN_W, SCREEN_H), 0, 0);
  return result;
}
