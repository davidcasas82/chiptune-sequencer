import {
  DRUM_HAT,
  DRUM_KICK,
  DRUM_LONG,
  DRUM_SHORT,
  DRUM_SNARE,
  EMPTY,
  MAX_CHANNELS,
  MAX_STEPS,
  SOUNDING_CHANNELS,
  cell,
  clampDrum,
  clampSteps,
  clampVol,
  type Pattern,
} from './synth';

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const HISTORY_LIMIT = 64;

export type Hit = {
  start: number;
  length: number;
  note: number;
  volume: number;
  drum: number;
};

export type Clip = {
  rows: number;
  cols: number;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
};

export type Snap = {
  steps: number;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
};

export type History = {
  undo: Snap[];
  redo: Snap[];
  base: Snap | null;
};

export function noteName(note: number): string {
  if (!Number.isFinite(note) || note < 0 || note > 127) return '---';
  const rounded = Math.round(note);
  return NAMES[rounded % 12] + String(Math.floor(rounded / 12) - 1);
}

export function drumName(drum: number): string {
  if (drum === DRUM_SNARE) return 'SNR';
  if (drum === DRUM_HAT) return 'HAT';
  if (drum === DRUM_SHORT) return 'SHT';
  if (drum === DRUM_LONG) return 'LNG';
  if (drum === DRUM_KICK) return 'KCK';
  return 'KCK';
}

export function findNote(pattern: Pattern, channel: number, step: number): Hit | null {
  if (channel < 0 || channel >= MAX_CHANNELS || step < 0 || step >= pattern.steps) return null;
  let found: Hit | null = null;
  for (let start = 0; start <= step; start++) {
    const index = cell(channel, start);
    if (pattern.note[index] === EMPTY) continue;
    const length = pattern.length[index] > 0 ? pattern.length[index] : 1;
    if (start + length <= step) continue;
    found = {
      start,
      length,
      note: pattern.note[index],
      volume: pattern.volume[index],
      drum: pattern.drum[index],
    };
  }
  return found;
}

export function clearStart(pattern: Pattern, channel: number, start: number): void {
  if (channel < 0 || channel >= MAX_CHANNELS || start < 0 || start >= MAX_STEPS) return;
  pattern.note[cell(channel, start)] = EMPTY;
}

export function clearNote(pattern: Pattern, channel: number, step: number): void {
  const found = findNote(pattern, channel, step);
  if (!found) return;
  clearStart(pattern, channel, found.start);
}

export function putNote(
  pattern: Pattern,
  channel: number,
  step: number,
  length: number,
  note: number,
  volume: number,
  drum: number,
): void {
  if (channel < 0 || channel >= SOUNDING_CHANNELS) return;
  if (step < 0 || step >= pattern.steps) return;
  if (!Number.isFinite(note) || note < 0 || note > 127) return;
  let len = Math.max(1, Math.round(length));
  const room = pattern.steps - step;
  if (len > room) len = room;
  for (let start = 0; start < step; start++) {
    const index = cell(channel, start);
    if (pattern.note[index] === EMPTY) continue;
    const cover = pattern.length[index] > 0 ? pattern.length[index] : 1;
    if (start + cover > step) pattern.length[index] = step - start;
  }
  for (let at = step; at < step + len; at++) pattern.note[cell(channel, at)] = EMPTY;
  const index = cell(channel, step);
  pattern.note[index] = Math.round(note);
  pattern.length[index] = len;
  pattern.volume[index] = clampVol(volume);
  pattern.drum[index] = clampDrum(drum);
}

export function resizeNote(pattern: Pattern, channel: number, start: number, length: number): void {
  if (channel < 0 || channel >= SOUNDING_CHANNELS || start < 0 || start >= pattern.steps) return;
  const index = cell(channel, start);
  if (pattern.note[index] === EMPTY) return;
  let len = Math.max(1, Math.round(length));
  const room = pattern.steps - start;
  if (len > room) len = room;
  for (let at = start + 1; at < start + len; at++) {
    if (pattern.note[cell(channel, at)] !== EMPTY) {
      len = at - start;
      break;
    }
  }
  pattern.length[index] = Math.max(1, len);
}

export function moveNote(
  pattern: Pattern,
  fromChannel: number,
  fromStep: number,
  toChannel: number,
  toStep: number,
  note: number,
  drum: number,
): boolean {
  const found = findNote(pattern, fromChannel, fromStep);
  if (!found) return false;
  const volume = found.volume;
  const length = found.length;
  clearStart(pattern, fromChannel, found.start);
  if (toChannel < 0 || toChannel >= SOUNDING_CHANNELS || toStep < 0 || toStep >= pattern.steps) return true;
  putNote(pattern, toChannel, toStep, length, note, volume, drum);
  return true;
}

export function setPatternSteps(pattern: Pattern, steps: number): void {
  const next = clampSteps(steps);
  pattern.steps = next;
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    for (let start = 0; start < next; start++) {
      const index = cell(channel, start);
      if (pattern.note[index] === EMPTY) continue;
      const room = next - start;
      if (pattern.length[index] > room) pattern.length[index] = room;
    }
  }
}

export function copyRect(pattern: Pattern, c0: number, s0: number, c1: number, s1: number): Clip {
  const ch0 = Math.max(0, Math.min(c0, c1));
  const ch1 = Math.min(SOUNDING_CHANNELS - 1, Math.max(c0, c1));
  const st0 = Math.max(0, Math.min(s0, s1));
  const st1 = Math.min(pattern.steps - 1, Math.max(s0, s1));
  const rows = Math.max(1, ch1 - ch0 + 1);
  const cols = Math.max(1, st1 - st0 + 1);
  const note = new Uint8Array(rows * cols);
  note.fill(EMPTY);
  const length = new Uint8Array(rows * cols);
  const volume = new Uint8Array(rows * cols);
  const drum = new Uint8Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const from = cell(ch0 + row, st0 + col);
      const to = row * cols + col;
      note[to] = pattern.note[from];
      length[to] = pattern.length[from];
      volume[to] = pattern.volume[from];
      drum[to] = pattern.drum[from];
    }
  }
  return { rows, cols, note, length, volume, drum };
}

export function pasteRect(pattern: Pattern, clip: Clip, channel: number, step: number): void {
  for (let row = 0; row < clip.rows; row++) {
    const ch = channel + row;
    if (ch < 0 || ch >= SOUNDING_CHANNELS) continue;
    if (step > 0) {
      for (let start = 0; start < step && start < pattern.steps; start++) {
        const index = cell(ch, start);
        if (pattern.note[index] === EMPTY) continue;
        const cover = pattern.length[index] > 0 ? pattern.length[index] : 1;
        if (start + cover > step) pattern.length[index] = step - start;
      }
    }
    for (let col = 0; col < clip.cols; col++) {
      const dest = step + col;
      if (dest < 0 || dest >= pattern.steps) continue;
      const from = row * clip.cols + col;
      const index = cell(ch, dest);
      pattern.note[index] = clip.note[from];
      pattern.length[index] = clip.length[from] > 0 ? clip.length[from] : 1;
      pattern.volume[index] = clip.volume[from];
      pattern.drum[index] = clip.drum[from];
      if (pattern.note[index] === EMPTY) continue;
      const room = pattern.steps - dest;
      if (pattern.length[index] > room) pattern.length[index] = room;
    }
    for (let col = 0; col < clip.cols; col++) {
      const dest = step + col;
      if (dest < 0 || dest >= pattern.steps) continue;
      const index = cell(ch, dest);
      if (pattern.note[index] === EMPTY) continue;
      const end = Math.min(pattern.steps, dest + pattern.length[index]);
      for (let at = dest + 1; at < end; at++) {
        if (pattern.note[cell(ch, at)] === EMPTY) continue;
        pattern.length[index] = at - dest;
        break;
      }
    }
  }
}

export function createHistory(): History {
  return { undo: [], redo: [], base: null };
}

function snapOf(pattern: Pattern): Snap {
  return {
    steps: pattern.steps,
    note: pattern.note.slice(),
    length: pattern.length.slice(),
    volume: pattern.volume.slice(),
    drum: pattern.drum.slice(),
  };
}

function sameSnap(pattern: Pattern, snap: Snap): boolean {
  if (pattern.steps !== snap.steps) return false;
  for (let i = 0; i < pattern.note.length; i++) {
    if (pattern.note[i] !== snap.note[i]) return false;
    if (pattern.length[i] !== snap.length[i]) return false;
    if (pattern.volume[i] !== snap.volume[i]) return false;
    if (pattern.drum[i] !== snap.drum[i]) return false;
  }
  return true;
}

function restore(pattern: Pattern, snap: Snap): void {
  pattern.steps = snap.steps;
  pattern.note.set(snap.note);
  pattern.length.set(snap.length);
  pattern.volume.set(snap.volume);
  pattern.drum.set(snap.drum);
}

export function beginEdit(history: History, pattern: Pattern): void {
  if (history.base) return;
  history.base = snapOf(pattern);
}

export function previewEdit(history: History, pattern: Pattern, edit: (pattern: Pattern) => void): void {
  beginEdit(history, pattern);
  if (!history.base) return;
  restore(pattern, history.base);
  edit(pattern);
}

export function commitEdit(history: History, pattern: Pattern): void {
  if (!history.base) return;
  if (!sameSnap(pattern, history.base)) {
    history.undo.push(history.base);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    history.redo.length = 0;
  }
  history.base = null;
}

export function cancelEdit(history: History, pattern: Pattern): void {
  if (!history.base) return;
  restore(pattern, history.base);
  history.base = null;
}

export function undoEdit(history: History, pattern: Pattern): boolean {
  if (history.base) cancelEdit(history, pattern);
  const prev = history.undo.pop();
  if (!prev) return false;
  history.redo.push(snapOf(pattern));
  restore(pattern, prev);
  return true;
}

export function redoEdit(history: History, pattern: Pattern): boolean {
  if (history.base) commitEdit(history, pattern);
  const next = history.redo.pop();
  if (!next) return false;
  history.undo.push(snapOf(pattern));
  restore(pattern, next);
  return true;
}

export function canUndo(history: History): boolean {
  return history.undo.length > 0;
}

export function canRedo(history: History): boolean {
  return history.redo.length > 0;
}
