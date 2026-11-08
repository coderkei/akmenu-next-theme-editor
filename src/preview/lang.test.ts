import { afterEach, describe, expect, it } from 'vitest';
import { bannerLanguage, formatString, LANG, LANGUAGES, languageFont, setLanguage } from './lang';

afterEach(() => setLanguage('English'));

describe('menu languages', () => {
  it('lists all the menu’s languages, sorted like the menu sorts them', () => {
    expect(LANGUAGES[0]).toBe('Deutsch');
    expect(LANGUAGES).toContain('English');
    expect(LANGUAGES).toHaveLength(9);
  });

  it('switches the text, the font and the banner language', async () => {
    expect(LANG('rom info', 'title')).toBe('File Information');
    await setLanguage('Deutsch');
    expect(LANG('rom info', 'title')).not.toBe('File Information');
    expect(bannerLanguage()).toBe(3);
    await setLanguage('简体中文 (CN)');
    expect(languageFont()).toBe('wenquanyi_9pt.pcf');
  });

  it('formats like the menu’s formatString', () => {
    expect(formatString('%d/%d %02d:%02d', 2026, 9, 5, 7)).toBe('2026/9 05:07');
    expect(formatString('%c Yes', 1)).toBe('\x01 Yes');
  });
});
