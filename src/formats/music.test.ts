import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkBcstm, checkWav, isMusicPath, nextMusicPath } from './music';

/** A minimal WAV: fmt + data chunks. */
function wav({ encoding = 1, channels = 2, rate = 32000, bits = 16, frames = 3200 } = {}) {
  const frame = (channels * bits) / 8;
  const data = frames * frame;
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(4, 36 + data, true);
  b.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, encoding, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * frame, true);
  v.setUint16(32, frame, true);
  v.setUint16(34, bits, true);
  b.set([...'data'].map((c) => c.charCodeAt(0)), 36);
  v.setUint32(40, data, true);
  return b;
}

describe('theme music checks', () => {
  it('accepts 16-bit PCM WAV and works out its length', () => {
    expect(checkWav(wav())).toEqual({ ok: true, info: { kind: 'WAV', sampleRate: 32000, channels: 2, seconds: 0.1 } });
  });

  it('rejects WAVs the menu would skip, and says why', () => {
    expect(checkWav(wav({ bits: 8 }))).toMatchObject({ ok: false, reason: expect.stringContaining('16-bit') });
    expect(checkWav(wav({ encoding: 3 }))).toMatchObject({ ok: false, reason: expect.stringContaining('PCM') });
    expect(checkWav(wav({ rate: 96000 }))).toMatchObject({ ok: false, reason: expect.stringContaining('96000 Hz') });
    expect(checkWav(new Uint8Array(20))).toMatchObject({ ok: false });
  });

  it('accepts the BCSTM that ships with Starlight', () => {
    const zip = unzipSync(new Uint8Array(readFileSync('public/themes/Starlight.zip')));
    const res = checkBcstm(zip['Starlight/bgm.bcstm']);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.info.kind).toBe('BCSTM');
    expect(checkBcstm(wav())).toMatchObject({ ok: false, reason: expect.stringContaining('BCSTM') });
  });

  it('names new files bgm, bgm1 … bgm9 per file type, like the menu looks for them', () => {
    expect(nextMusicPath([], '.wav')).toBe('bgm.wav');
    expect(nextMusicPath(['bgm.bcstm'], '.wav')).toBe('bgm.wav');
    expect(nextMusicPath(['BGM.wav', 'bgm1.wav'], '.WAV')).toBe('bgm2.wav');
    expect(nextMusicPath(['bgm', ...'123456789'].map((n) => `${n === 'bgm' ? 'bgm' : `bgm${n}`}.wav`), '.wav')).toBeNull();
    expect(isMusicPath('BGM3.bcstm')).toBe(true);
    expect(isMusicPath('bgm10.wav')).toBe(false);
  });
});
