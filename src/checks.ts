// Checks a theme before export, using the menu's own rules. "Problems" make AKMenu-Next
// refuse the theme and switch to another one (theme.cpp isValidTheme); "warnings" are
// things that just won't show.

import { checkMusic, isMusicPath } from './formats/music';
import { loadMenuBitmap } from './preview/menubmp';
import { BANNER_SIZE, CUSTOM_PICTURE_MAX_BYTES, IMAGE_SLOTS, NEXT_ONLY_PATHS, THEME_ICONS, type Flavour } from './schema';
import type { Theme } from './theme';

export interface Issue {
  level: 'problem' | 'warning';
  message: string;
}

export function checkTheme(theme: Theme, flavour: Flavour): Issue[] {
  const issues: Issue[] = [];
  const problem = (message: string) => issues.push({ level: 'problem', message });
  const warning = (message: string) => issues.push({ level: 'warning', message });
  const file = (path: string) => [...theme.files].find(([p]) => p.toLowerCase() === path.toLowerCase())?.[1];
  const next = flavour === 'next';

  if (!theme.uisettings.hasSection('global settings')) {
    problem('uisettings.ini has no [global settings] section, so the menu won’t list the theme.');
  }

  for (const slot of IMAGE_SLOTS) {
    if (!next && NEXT_ONLY_PATHS.some((r) => r.test(slot.path))) continue;
    const data = file(slot.path);
    const report = slot.required ? problem : warning;
    if (!data) {
      if (slot.required) problem(`${slot.label} (${slot.path}) is missing, and the menu needs it.`);
      continue;
    }
    const res = loadMenuBitmap(data);
    if (!res.ok) {
      report(`${slot.label} (${slot.path}) won’t load on the DS: ${res.reason}.`);
      continue;
    }
    const { width, height } = res.bitmap;
    if (slot.screen && (width !== 256 || height !== 192)) {
      report(`${slot.label} (${slot.path}) is ${width}×${height}; it has to be 256×192.`);
    } else if (slot.required && (width > slot.required.maxWidth || height > slot.required.maxHeight)) {
      problem(`${slot.label} (${slot.path}) is ${width}×${height}; the menu allows up to ${slot.required.maxWidth}×${slot.required.maxHeight}.`);
    } else if (slot.digits && height % 10) {
      warning(`${slot.label} (${slot.path}) is ${height} tall, which doesn’t split into 10 equal digits.`);
    } else if (slot.fit === 'stretch' && slot.width && (width !== slot.width || height < slot.height!)) {
      warning(`${slot.label} (${slot.path}) is ${width}×${height}; it needs to be ${slot.width}×${slot.height}.`);
    }
  }

  const button = theme.uisettings.get('start button', 'file');
  if (button && button !== 'none') {
    const data = file(button);
    if (!data) warning(`The start button uses ${button}, but the theme doesn’t have it.`);
    else if (!loadMenuBitmap(data).ok) warning(`The start button picture (${button}) won’t load on the DS.`);
  }

  if (next) {
    for (const path of Object.values(THEME_ICONS)) {
      const data = file(path);
      if (data && data.length < BANNER_SIZE) warning(`${path} is too short to be an icon, so the menu uses its own.`);
    }
    for (const [path, data] of theme.files) {
      if (!isMusicPath(path)) continue;
      const res = checkMusic(path, data);
      if (!res.ok) warning(`${path} won’t play: ${res.reason}.`);
    }
    if (theme.custom.get('custom picture', 'show') === '1') {
      const sdPath = theme.custom.get('custom picture', 'file') ?? '';
      const inTheme = /_nds\/akmenunext\/ui\/[^/]+\/(.+)$/i.exec(sdPath.replace(/\\/g, '/'));
      const data = inTheme ? file(inTheme[1]) : undefined;
      if (!sdPath) warning('The custom picture is switched on but has no file.');
      else if (!inTheme) warning(`The custom picture (${sdPath}) isn’t in the theme, so it’ll only show if that file is on the SD card.`);
      else if (!data) warning(`The custom picture points at ${inTheme[1]}, but the theme doesn’t have it.`);
      else if (data.length > CUSTOM_PICTURE_MAX_BYTES) warning('The custom picture is over 10KB, so the menu won’t show it.');
    }
  }
  return issues;
}
