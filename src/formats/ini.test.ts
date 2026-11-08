import { describe, expect, it } from 'vitest';
import { IniDocument } from './ini';

const SAMPLE = [
  '; Blue Skies',
  '[global settings]',
  'formBodyColor = 0x5e06',
  'unknownKey=keep me',
  '',
  '[main list]',
  'textColor   =   0x2d6b',
  '',
].join('\r\n');

describe('IniDocument', () => {
  it('round-trips unchanged', () => {
    expect(IniDocument.parse(SAMPLE).toString()).toBe(SAMPLE);
  });

  it('reads values and sections', () => {
    const doc = IniDocument.parse(SAMPLE);
    expect(doc.get('main list', 'textColor')).toBe('0x2d6b');
    expect(doc.get('global settings', 'unknownKey')).toBe('keep me');
    expect(doc.sections()).toEqual(['global settings', 'main list']);
  });

  it('edits in place, keeping spacing', () => {
    const doc = IniDocument.parse(SAMPLE);
    doc.set('main list', 'textColor', '0x7fff');
    expect(doc.toString()).toContain('textColor   =   0x7fff');
  });

  it('adds keys inside their section and new sections at the end', () => {
    const doc = IniDocument.parse(SAMPLE);
    doc.set('global settings', 'formTextColor', '0x7fff');
    doc.set('cover', 'darken', '20');
    const lines = doc.toString().trimEnd().split('\r\n');
    expect(lines.indexOf('formTextColor = 0x7fff')).toBe(lines.indexOf('unknownKey=keep me') + 1);
    expect(lines.slice(-2)).toEqual(['[cover]', 'darken = 20']);
  });

  it('treats ; / ! lines as comments', () => {
    const doc = IniDocument.parse('[a]\n// x = 1\n! y = 2\nz = 3');
    expect(doc.get('a', 'x')).toBeUndefined();
    expect(doc.get('a', 'z')).toBe('3');
  });

  it('deletes sections', () => {
    const doc = IniDocument.parse(SAMPLE);
    doc.deleteSection('main list');
    expect(doc.hasSection('main list')).toBe(false);
    expect(doc.get('global settings', 'formBodyColor')).toBe('0x5e06');
  });
});
