// INI reader/writer that keeps comments, blank lines, key order, spacing and
// unknown keys, so hand-edited theme files survive a round trip.
//
// Comment rules follow CIniFile in akmenu-next (arm9/source/inifile.cpp):
// lines starting with ';', '/' or '!' are comments.
// TODO: check whether CIniFile matches section/key names case-sensitively.

// `eol` is each line's own ending, so files with mixed line endings round-trip exactly.
type Line = { eol: string } & (
  | { kind: 'section'; raw: string; name: string }
  | { kind: 'entry'; raw: string; section: string; key: string; value: string }
  | { kind: 'other'; raw: string }
);

const COMMENT = /^[;/!]/;

export class IniDocument {
  private lines: Line[] = [];
  private eol = '\r\n';

  static parse(text: string): IniDocument {
    const doc = new IniDocument();
    doc.eol = text.includes('\r\n') || !text.includes('\n') ? '\r\n' : '\n';
    let section = '';
    // Splitting on a capture group keeps each line's ending: [line, eol, line, eol, ..., last].
    const parts = text.split(/(\r?\n)/);
    for (let p = 0; p < parts.length; p += 2) {
      const raw = parts[p];
      const eol = parts[p + 1] ?? '';
      const t = raw.trim();
      if (t === '' || COMMENT.test(t)) {
        doc.lines.push({ kind: 'other', raw, eol });
      } else if (t.startsWith('[') && t.endsWith(']')) {
        section = t.slice(1, -1).trim();
        doc.lines.push({ kind: 'section', raw, name: section, eol });
      } else if (t.includes('=')) {
        const i = t.indexOf('=');
        doc.lines.push({
          kind: 'entry',
          raw,
          eol,
          section,
          key: t.slice(0, i).trim(),
          value: t.slice(i + 1).trim(),
        });
      } else {
        doc.lines.push({ kind: 'other', raw, eol });
      }
    }
    return doc;
  }

  hasSection(name: string): boolean {
    return this.lines.some((l) => l.kind === 'section' && l.name === name);
  }

  sections(): string[] {
    return this.lines.flatMap((l) => (l.kind === 'section' ? [l.name] : []));
  }

  get(section: string, key: string): string | undefined {
    for (const l of this.lines) {
      if (l.kind === 'entry' && l.section === section && l.key === key) return l.value;
    }
    return undefined;
  }

  set(section: string, key: string, value: string): void {
    const existing = this.lines.find(
      (l): l is Extract<Line, { kind: 'entry' }> =>
        l.kind === 'entry' && l.section === section && l.key === key,
    );
    if (existing) {
      // Keep the author's spacing around '=' and only swap the value.
      const i = existing.raw.indexOf('=');
      const after = existing.raw.slice(i + 1);
      const lead = after.match(/^\s*/)?.[0] ?? '';
      existing.raw = existing.raw.slice(0, i + 1) + lead + value;
      existing.value = value;
      return;
    }

    const entry: Line = { kind: 'entry', raw: `${key} = ${value}`, eol: this.eol, section, key, value };
    const start = this.lines.findIndex((l) => l.kind === 'section' && l.name === section);
    if (start === -1) {
      this.endLastLine();
      const last = this.lines[this.lines.length - 1];
      if (last && last.raw.trim() !== '') this.lines.push({ kind: 'other', raw: '', eol: this.eol });
      this.lines.push({ kind: 'section', raw: `[${section}]`, name: section, eol: this.eol }, entry);
      return;
    }
    // Insert after the last non-blank line of the section.
    let insertAt = start + 1;
    for (let i = start + 1; i < this.lines.length; i++) {
      const l = this.lines[i];
      if (l.kind === 'section') break;
      if (l.raw.trim() !== '') insertAt = i + 1;
    }
    if (insertAt === this.lines.length) this.endLastLine();
    this.lines.splice(insertAt, 0, entry);
  }

  /** Makes sure the current last line ends with a newline before appending after it. */
  private endLastLine(): void {
    const last = this.lines[this.lines.length - 1];
    if (!last) return;
    if (last.eol === '' && last.raw === '') this.lines.pop();
    else if (last.eol === '') last.eol = this.eol;
  }

  delete(section: string, key: string): void {
    this.lines = this.lines.filter(
      (l) => !(l.kind === 'entry' && l.section === section && l.key === key),
    );
  }

  /** Removes a section header and everything under it. */
  deleteSection(name: string): void {
    const out: Line[] = [];
    let skipping = false;
    for (const l of this.lines) {
      if (l.kind === 'section') skipping = l.name === name;
      if (!skipping) out.push(l);
    }
    this.lines = out;
  }

  toString(): string {
    return this.lines.map((l) => l.raw + l.eol).join('');
  }
}
