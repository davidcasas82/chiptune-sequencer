import {
  MAX_CHANNELS,
  MAX_ORDER,
  MAX_PATTERNS,
  MAX_STEPS,
  WAVE_LEN,
  DRUM_COUNT,
  clampBpm,
  clampSteps,
  copyPattern,
  createPattern,
  type Pattern,
} from './synth';
import { copySong, createSong, type Song } from './song';

export const PROJECT_VERSION = 1;

export type ProjectFile = {
  v: number;
  name: string;
  bpm: number;
  delay: number;
  crush: number;
  mute: number[];
  solo: number[];
  song: ReturnType<typeof dumpSong>;
};

export const AUTO_KEY = 'chiptune-autosave';
export const LIST_KEY = 'chiptune-projects';

export type SavedProject = {
  id: string;
  name: string;
  body: string;
};

function listOf(values: ArrayLike<number>, length = values.length): number[] {
  const out: number[] = [];
  const n = Math.min(length, values.length);
  for (let i = 0; i < n; i++) out.push(values[i]);
  return out;
}

function readFloats(value: unknown, into: Float32Array): void {
  if (!Array.isArray(value)) return;
  const n = Math.min(into.length, value.length);
  for (let i = 0; i < n; i++) {
    const num = Number(value[i]);
    if (Number.isFinite(num)) into[i] = num;
  }
}

function readBytes(value: unknown, into: Uint8Array): void {
  if (!Array.isArray(value)) return;
  const n = Math.min(into.length, value.length);
  for (let i = 0; i < n; i++) {
    const num = Math.round(Number(value[i]));
    if (!Number.isFinite(num)) continue;
    into[i] = num < 0 ? 0 : num > 255 ? 255 : num;
  }
}

function readSigned(value: unknown, into: Int8Array): void {
  if (!Array.isArray(value)) return;
  const n = Math.min(into.length, value.length);
  for (let i = 0; i < n; i++) {
    const num = Math.round(Number(value[i]));
    if (!Number.isFinite(num)) continue;
    into[i] = num < -128 ? -128 : num > 127 ? 127 : num;
  }
}

function dumpPattern(pattern: Pattern) {
  return {
    steps: pattern.steps,
    type: listOf(pattern.type, MAX_CHANNELS),
    duty: listOf(pattern.duty, MAX_CHANNELS),
    note: listOf(pattern.note, MAX_CHANNELS * MAX_STEPS),
    length: listOf(pattern.length, MAX_CHANNELS * MAX_STEPS),
    volume: listOf(pattern.volume, MAX_CHANNELS * MAX_STEPS),
    drum: listOf(pattern.drum, MAX_CHANNELS * MAX_STEPS),
    pitch: listOf(pattern.pitch, MAX_CHANNELS * MAX_STEPS),
    stepDuty: listOf(pattern.stepDuty, MAX_CHANNELS * MAX_STEPS),
    stepArp: listOf(pattern.stepArp, MAX_CHANNELS * MAX_STEPS),
    nudge: listOf(pattern.nudge, MAX_CHANNELS * MAX_STEPS),
    vol: listOf(pattern.vol, MAX_CHANNELS),
    pan: listOf(pattern.pan, MAX_CHANNELS),
    attack: listOf(pattern.attack, MAX_CHANNELS),
    decay: listOf(pattern.decay, MAX_CHANNELS),
    sustain: listOf(pattern.sustain, MAX_CHANNELS),
    release: listOf(pattern.release, MAX_CHANNELS),
    vibDepth: listOf(pattern.vibDepth, MAX_CHANNELS),
    vibRate: listOf(pattern.vibRate, MAX_CHANNELS),
    slide: listOf(pattern.slide, MAX_CHANNELS),
    arpRate: listOf(pattern.arpRate, MAX_CHANNELS),
    arp: listOf(pattern.arp, MAX_CHANNELS),
    preset: listOf(pattern.preset, MAX_CHANNELS),
    sweep: listOf(pattern.sweep, MAX_CHANNELS),
    lfsr: listOf(pattern.lfsr, MAX_CHANNELS),
    wave: listOf(pattern.wave, MAX_CHANNELS * WAVE_LEN),
    drumMask: listOf(pattern.drumMask, MAX_CHANNELS * MAX_STEPS),
    noiseShort: listOf(pattern.noiseShort, DRUM_COUNT),
    noiseHz: listOf(pattern.noiseHz, DRUM_COUNT),
    noiseDecay: listOf(pattern.noiseDecay, DRUM_COUNT),
    noiseGain: listOf(pattern.noiseGain, DRUM_COUNT),
    noiseTone: listOf(pattern.noiseTone, DRUM_COUNT),
    noiseToneDecay: listOf(pattern.noiseToneDecay, DRUM_COUNT),
    noiseToneGain: listOf(pattern.noiseToneGain, DRUM_COUNT),
    noiseDrop: listOf(pattern.noiseDrop, DRUM_COUNT),
    noiseBase: listOf(pattern.noiseBase, DRUM_COUNT),
    noiseStart: listOf(pattern.noiseStart, DRUM_COUNT),
  };
}

function loadPattern(value: unknown): Pattern | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const pattern = createPattern();
  pattern.steps = clampSteps(Number(raw.steps));
  readBytes(raw.type, pattern.type);
  readFloats(raw.duty, pattern.duty);
  readBytes(raw.note, pattern.note);
  readBytes(raw.length, pattern.length);
  readBytes(raw.volume, pattern.volume);
  readBytes(raw.drum, pattern.drum);
  readBytes(raw.pitch, pattern.pitch);
  readBytes(raw.stepDuty, pattern.stepDuty);
  readBytes(raw.stepArp, pattern.stepArp);
  readSigned(raw.nudge, pattern.nudge);
  readFloats(raw.vol, pattern.vol);
  readFloats(raw.pan, pattern.pan);
  readFloats(raw.attack, pattern.attack);
  readFloats(raw.decay, pattern.decay);
  readFloats(raw.sustain, pattern.sustain);
  readFloats(raw.release, pattern.release);
  readFloats(raw.vibDepth, pattern.vibDepth);
  readFloats(raw.vibRate, pattern.vibRate);
  readFloats(raw.slide, pattern.slide);
  readFloats(raw.arpRate, pattern.arpRate);
  readBytes(raw.arp, pattern.arp);
  readBytes(raw.preset, pattern.preset);
  readFloats(raw.sweep, pattern.sweep);
  readBytes(raw.lfsr, pattern.lfsr);
  readFloats(raw.wave, pattern.wave);
  readBytes(raw.drumMask, pattern.drumMask);
  readBytes(raw.noiseShort, pattern.noiseShort);
  readFloats(raw.noiseHz, pattern.noiseHz);
  readFloats(raw.noiseDecay, pattern.noiseDecay);
  readFloats(raw.noiseGain, pattern.noiseGain);
  readFloats(raw.noiseTone, pattern.noiseTone);
  readFloats(raw.noiseToneDecay, pattern.noiseToneDecay);
  readFloats(raw.noiseToneGain, pattern.noiseToneGain);
  readFloats(raw.noiseDrop, pattern.noiseDrop);
  readFloats(raw.noiseBase, pattern.noiseBase);
  readFloats(raw.noiseStart, pattern.noiseStart);
  return pattern;
}

function dumpSong(song: Song) {
  return {
    count: song.count,
    current: song.current,
    patterns: song.patterns.slice(0, MAX_PATTERNS).map(dumpPattern),
    orderLen: song.orderLen,
    orderPat: listOf(song.orderPat, MAX_ORDER),
    orderRep: listOf(song.orderRep, MAX_ORDER),
    orderTr: listOf(song.orderTr, MAX_ORDER),
    loopStart: song.loopStart,
    loopEnd: song.loopEnd,
    marker: listOf(song.marker, MAX_ORDER),
    playSong: song.playSong,
    swing: song.swing,
    scale: song.scale,
    root: song.root,
    custom: song.custom,
    onion: song.onion,
    record: song.record,
    entry: song.entry,
  };
}

function loadSong(value: unknown): Song | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.patterns) || raw.patterns.length === 0) return null;
  const song = createSong();
  const count = Math.round(Number(raw.count));
  song.count = Number.isFinite(count) ? Math.min(MAX_PATTERNS, Math.max(1, count)) : 1;
  for (let i = 0; i < MAX_PATTERNS; i++) {
    const loaded = loadPattern(raw.patterns[i]);
    if (loaded) copyPattern(loaded, song.patterns[i]);
  }
  const current = Math.round(Number(raw.current));
  song.current = Number.isFinite(current) ? Math.min(song.count - 1, Math.max(0, current)) : 0;
  const orderLen = Math.round(Number(raw.orderLen));
  song.orderLen = Number.isFinite(orderLen) ? Math.min(MAX_ORDER, Math.max(1, orderLen)) : 1;
  readBytes(raw.orderPat, song.orderPat);
  readBytes(raw.orderRep, song.orderRep);
  readSigned(raw.orderTr, song.orderTr);
  readBytes(raw.marker, song.marker);
  const loopStart = Math.round(Number(raw.loopStart));
  const loopEnd = Math.round(Number(raw.loopEnd));
  song.loopStart = Number.isFinite(loopStart) ? Math.max(0, Math.min(song.orderLen - 1, loopStart)) : 0;
  song.loopEnd = Number.isFinite(loopEnd) ? Math.max(song.loopStart + 1, Math.min(song.orderLen, loopEnd)) : song.orderLen;
  song.playSong = Number(raw.playSong) ? 1 : 0;
  const swing = Math.round(Number(raw.swing));
  song.swing = Number.isFinite(swing) ? Math.min(75, Math.max(50, swing)) : 50;
  const scale = Math.round(Number(raw.scale));
  song.scale = Number.isFinite(scale) ? Math.min(4, Math.max(0, scale)) : 0;
  const root = Math.round(Number(raw.root));
  song.root = Number.isFinite(root) ? ((root % 12) + 12) % 12 : 0;
  const custom = Math.round(Number(raw.custom));
  song.custom = Number.isFinite(custom) ? custom & 0xfff : song.custom;
  song.onion = Number(raw.onion) ? 1 : 0;
  song.record = Number(raw.record) ? 1 : 0;
  const entry = Math.round(Number(raw.entry));
  song.entry = Number.isFinite(entry) ? Math.min(song.orderLen - 1, Math.max(0, entry)) : 0;
  return song;
}

export function projectName(value: string): string {
  const clean = value.replace(/[^\w .+-]+/g, ' ').trim().slice(0, 40);
  return clean || 'Demo';
}

function unit(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function mixBits(value: ArrayLike<number> | undefined): number[] {
  const out: number[] = [];
  for (let i = 0; i < MAX_CHANNELS; i++) {
    const raw = value && i < value.length ? Number(value[i]) : 0;
    out.push(Number.isFinite(raw) && raw !== 0 ? 1 : 0);
  }
  return out;
}

export function projectFrom(
  song: Song,
  bpm: number,
  delay: number,
  crush: number,
  name: string,
  mute?: ArrayLike<number>,
  solo?: ArrayLike<number>,
): ProjectFile {
  return {
    v: PROJECT_VERSION,
    name: projectName(name),
    bpm: clampBpm(bpm),
    delay: unit(delay),
    crush: unit(crush),
    mute: mixBits(mute),
    solo: mixBits(solo),
    song: dumpSong(song),
  };
}

export function stringifyProject(file: ProjectFile): string {
  return JSON.stringify(file);
}

export function parseProject(text: string): ProjectFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== PROJECT_VERSION) return null;
  const song = loadSong(record.song);
  if (!song) return null;
  const mute = Array.isArray(record.mute) ? record.mute : undefined;
  const solo = Array.isArray(record.solo) ? record.solo : undefined;
  return projectFrom(
    song,
    Number(record.bpm),
    Number(record.delay),
    Number(record.crush),
    String(record.name ?? ''),
    mute,
    solo,
  );
}

export function applyProject(
  file: ProjectFile,
  song: Song,
): { bpm: number; delay: number; crush: number; name: string; mute: number[]; solo: number[] } {
  const loaded = loadSong(file.song);
  if (loaded) copySong(loaded, song);
  return {
    bpm: clampBpm(file.bpm),
    delay: unit(file.delay),
    crush: unit(file.crush),
    name: projectName(file.name),
    mute: mixBits(file.mute),
    solo: mixBits(file.solo),
  };
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAuto(): string | null {
  try {
    return storage()?.getItem(AUTO_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveAuto(body: string): void {
  try {
    storage()?.setItem(AUTO_KEY, body);
  } catch {
    // the browser refused the write
  }
}

export function loadNamed(): SavedProject[] {
  try {
    const text = storage()?.getItem(LIST_KEY);
    if (!text) return [];
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: SavedProject[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.body !== 'string') continue;
      out.push({ id: record.id, name: projectName(String(record.name ?? '')), body: record.body });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveNamed(list: SavedProject[]): void {
  try {
    storage()?.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // the browser refused the write
  }
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export async function saveBytes(name: string, bytes: Uint8Array, type: string): Promise<void> {
  const body = copyBytes(bytes);
  const file = new File([body], name, { type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: name });
    return;
  }
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
