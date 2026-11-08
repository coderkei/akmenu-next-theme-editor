// Checks theme music files the way the menu opens them, so files the DS would skip
// are caught on upload: arm9/source/wavsource.cpp cWavSource::parse,
// bcstmsource.cpp cBcstmSource::parse/parseInfo and thememusic.cpp openSource.

import { MUSIC } from '../schema';

export interface MusicInfo {
  kind: 'WAV' | 'BCSTM';
  sampleRate: number;
  channels: number;
  /** Length in seconds. */
  seconds: number;
}

export type MusicCheck = { ok: true; info: MusicInfo } | { ok: false; reason: string };

const fail = (reason: string): MusicCheck => ({ ok: false, reason });
const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function rateOk(info: MusicInfo): MusicCheck {
  if (info.sampleRate < MUSIC.minSampleRate || info.sampleRate > MUSIC.maxSampleRate) {
    return fail(`its sample rate is ${info.sampleRate} Hz; the DS needs ${MUSIC.minSampleRate}–${MUSIC.maxSampleRate} Hz`);
  }
  return { ok: true, info };
}

/** cWavSource::parse: 16-bit PCM, mono or stereo, with consistent header fields. */
export function checkWav(b: Uint8Array): MusicCheck {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 12 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WAVE') return fail('it isn’t a WAV file');
  const riffEnd = 8 + v.getUint32(4, true);
  if (riffEnd > b.length) return fail('it’s cut short');
  let fmt: { encoding: number; channels: number; rate: number; byteRate: number; align: number; bits: number } | null = null;
  let dataLength = -1;
  for (let at = 12; at + 8 <= riffEnd; ) {
    const id = tag(b, at);
    const length = v.getUint32(at + 4, true);
    const start = at + 8;
    if (length > riffEnd - start) return fail('it’s cut short');
    if (id === 'fmt ') {
      if (length < 16) return fail('its format header is broken');
      fmt = {
        encoding: v.getUint16(start, true),
        channels: v.getUint16(start + 2, true),
        rate: v.getUint32(start + 4, true),
        byteRate: v.getUint32(start + 8, true),
        align: v.getUint16(start + 12, true),
        bits: v.getUint16(start + 14, true),
      };
      if (fmt.encoding !== 1) return fail('it’s compressed; the DS needs plain (PCM) WAV');
    } else if (id === 'data') {
      dataLength = length;
    }
    at = start + length + (length & 1);
  }
  if (!fmt || dataLength < 0) return fail('it’s missing its format or sound data');
  if (fmt.channels < 1 || fmt.channels > 2 || fmt.bits !== 16) {
    return fail(`it’s ${fmt.bits}-bit with ${fmt.channels} channels; the DS needs 16-bit mono or stereo`);
  }
  const frame = fmt.channels * 2;
  if (fmt.align !== frame || fmt.byteRate !== fmt.rate * frame || dataLength === 0 || dataLength % frame !== 0) {
    return fail('its header doesn’t add up');
  }
  return rateOk({ kind: 'WAV', sampleRate: fmt.rate, channels: fmt.channels, seconds: dataLength / frame / fmt.rate });
}

/** cBcstmSource::parse and parseInfo, up to the stream info the preview needs. */
export function checkBcstm(b: Uint8Array): MusicCheck {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 0x40 || tag(b, 0) !== 'CSTM') return fail('it isn’t a BCSTM file');
  if (v.getUint16(4, true) !== 0xfeff) return fail('it’s a big-endian BCSTM; the DS needs little-endian');
  const refs = v.getUint16(0x10, true);
  if (refs < 1 || refs > 8 || 0x14 + refs * 12 > b.length) return fail('its header is broken');
  let info = -1;
  let infoSize = 0;
  let hasData = false;
  for (let i = 0; i < refs; i++) {
    const at = 0x14 + i * 12;
    const type = v.getUint16(at, true);
    const offset = v.getUint32(at + 4, true);
    const size = v.getUint32(at + 8, true);
    if (type !== 0x4000 && type !== 0x4002) continue;
    if (offset + size > b.length) return fail('it’s cut short');
    if (type === 0x4000) [info, infoSize] = [offset, size];
    else hasData = true;
  }
  if (info < 0 || !hasData) return fail('it’s missing its INFO or DATA block');
  if (infoSize < 0x20 + 0x38 || infoSize > 64 * 1024 || tag(b, info) !== 'INFO') return fail('its INFO block is broken');
  if (v.getUint16(info + 0x08, true) !== 0x4100) return fail('it’s missing its stream info');
  const stream = info + 8 + v.getUint32(info + 0x0c, true);
  if (stream + 0x38 > info + infoSize) return fail('its INFO block is broken');
  if (b[stream] !== 2) return fail('it isn’t DSP-ADPCM; convert it as DSP-ADPCM');
  const channels = b[stream + 2];
  if (channels < 1) return fail('it has no channels');
  const sampleRate = v.getUint32(stream + 4, true);
  const blocks = v.getUint32(stream + 0x10, true);
  const perBlock = v.getUint32(stream + 0x18, true);
  const lastBlock = v.getUint32(stream + 0x20, true);
  const samples = blocks > 0 ? (blocks - 1) * perBlock + lastBlock : 0;
  // The menu plays at most two channels.
  return rateOk({ kind: 'BCSTM', sampleRate, channels: Math.min(channels, 2), seconds: sampleRate ? samples / sampleRate : 0 });
}

export function checkMusic(path: string, bytes: Uint8Array): MusicCheck {
  return /\.wav$/i.test(path) ? checkWav(bytes) : checkBcstm(bytes);
}

/**
 * Where a new music file goes: the first of bgm, bgm1 … bgm9 not yet used for that
 * kind of file (bgm.wav and bgm.bcstm can both exist). Null when they're all taken.
 */
export function nextMusicPath(existing: Iterable<string>, extension: string): string | null {
  const taken = new Set([...existing].map((p) => p.toLowerCase()));
  for (const stem of MUSIC.stems) {
    const path = `${stem}${extension.toLowerCase()}`;
    if (!taken.has(path)) return path;
  }
  return null;
}

/** Theme files the menu treats as music. */
export function isMusicPath(path: string): boolean {
  return MUSIC.stems.some((stem) => MUSIC.extensions.some((ext) => path.toLowerCase() === stem + ext));
}
