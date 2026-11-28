import {
  DRUM_COUNT,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_LONG,
  DRUM_SHORT,
  DRUM_SNARE,
  kitChannel,
  EMPTY,
  FX_INHERIT,
  MAX_CHANNELS,
  MAX_STEPS,
  PITCH_CENTER,
  VOL_MAX,
  cell,
  clampDrum,
  clampPitch,
  clampSteps,
  clampVol,
  clonePattern,
  copyPattern,
  samePattern,
  type Pattern,
} from './synth';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const HISTORY_LIMIT = 64;

export type Hit = {
  start: number;
  length: number;
  note: number;
  volume: number;
  drum: number;
  pitch: number;
  stepDuty: number;
  stepArp: number;
  nudge: number;
};

export type Clip = {
  rows: number;
  cols: number;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
  pitch: Uint8Array;
  stepDuty: Uint8Array;
  stepArp: Uint8Array;
  nudge: Int8Array;
  drumMask: Uint8Array;
};

export type Snap = Pattern;

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
      pitch: pattern.pitch[index] - PITCH_CENTER,
      stepDuty: pattern.stepDuty[index],
      stepArp: pattern.stepArp[index],
      nudge: pattern.nudge[index],
    };
  }
  return found;
}

export function clearStart(pattern: Pattern, channel: number, start: number): void {
  if (channel < 0 || channel >= MAX_CHANNELS || start < 0 || start >= MAX_STEPS) return;
  const index = cell(channel, start);
  pattern.note[index] = EMPTY;
  pattern.drumMask[index] = 0;
}

export function dropDrum(pattern: Pattern, channel: number, step: number, drum: number): void {
  const found = findNote(pattern, channel, step);
  if (!found) return;
  const index = cell(channel, found.start);
  if (pattern.note[index] === EMPTY) return;
  const kind = clampDrum(drum);
  const primary = clampDrum(pattern.drum[index]);
  const mask = pattern.drumMask[index] & ~(1 << primary);
  const lit = kind === primary || (mask & (1 << kind)) !== 0;
  if (!lit) return;
  if (kind !== primary) {
    pattern.drumMask[index] = mask & ~(1 << kind);
    return;
  }
  let next = -1;
  for (let i = 0; i < DRUM_COUNT; i++) {
    if (i === primary) continue;
    if (mask & (1 << i)) {
      next = i;
      break;
    }
  }
  if (next < 0) {
    pattern.note[index] = EMPTY;
    pattern.drumMask[index] = 0;
    return;
  }
  pattern.drum[index] = next;
  pattern.drumMask[index] = mask & ~(1 << next);
}

export function clearNote(pattern: Pattern, channel: number, step: number): void {
  const found = findNote(pattern, channel, step);
  if (!found) return;
  clearStart(pattern, channel, found.start);
}

export function clearSelection(
  pattern: Pattern,
  span: { c0: number; c1: number; s0: number; s1: number } | null,
): boolean {
  if (!span) return false;
  const c0 = Math.min(span.c0, span.c1);
  const c1 = Math.max(span.c0, span.c1);
  const s0 = Math.min(span.s0, span.s1);
  const s1 = Math.max(span.s0, span.s1);
  for (let channel = c0; channel <= c1; channel++) {
    for (let step = s0; step <= s1; step++) clearNote(pattern, channel, step);
  }
  return true;
}

export const PEN_VOL_MIN = Math.max(1, Math.round(VOL_MAX / 4));
export const PEN_LIFT = 0.08;
export const PEN_TRAIL_MS = 80;

export type PenSample = {
  phase: 'down' | 'move' | 'up' | 'hover';
  pressure: number;
  t: number;
  buttons?: number;
};

export function penHovering(pointerType: string, buttons: number): boolean {
  return pointerType === 'pen' && buttons === 0;
}

export function penVolume(pointerType: string, pressure: number, fallback: number): number {
  if (pointerType === 'pen' && pressure > 0) {
    return clampVol(Math.max(PEN_VOL_MIN, Math.round(pressure * VOL_MAX)));
  }
  return clampVol(fallback);
}

export function penStrokeVolume(samples: readonly PenSample[]): number {
  const contact = samples.filter((sample) => {
    if (sample.phase === 'up' || sample.phase === 'hover') return false;
    if (sample.buttons === 0) return false;
    return sample.phase === 'down' || sample.phase === 'move';
  });
  const above = contact.filter((sample) => sample.pressure >= PEN_LIFT);
  if (above.length === 0) return PEN_VOL_MIN;
  const end = above[above.length - 1].t;
  const body = above.filter((sample) => end - sample.t >= PEN_TRAIL_MS);
  const pool = body.length > 0 ? body : above;
  let peak = 0;
  for (const sample of pool) if (sample.pressure > peak) peak = sample.pressure;
  return penVolume('pen', peak, PEN_VOL_MIN);
}

export type PenAudition = {
  noteOn: (channel: number, note: number, volume: number) => void;
  hit: (drum: number, volume: number, channel: number) => void;
};

export function auditionPenTap(
  play: PenAudition,
  channel: number,
  note: number,
  volume: number,
  drum: number,
  noise: boolean,
): void {
  const level = Math.max(PEN_VOL_MIN, clampVol(volume));
  if (noise) play.hit(drum, level, channel);
  else play.noteOn(channel, note, level);
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
  if (channel < 0 || channel >= MAX_CHANNELS) return;
  if (step < 0 || step >= pattern.steps) return;
  if (!Number.isFinite(note) || note < 0 || note > 127) return;
  let len = Math.max(1, Math.round(length));
  const room = pattern.steps - step;
  if (len > room) len = room;
  const index = cell(channel, step);
  const stacking = kitChannel(pattern, channel) && pattern.note[index] !== EMPTY;
  for (let start = 0; start < step; start++) {
    const covered = cell(channel, start);
    if (pattern.note[covered] === EMPTY) continue;
    const cover = pattern.length[covered] > 0 ? pattern.length[covered] : 1;
    if (start + cover > step) pattern.length[covered] = step - start;
  }
  if (stacking) {
    const kind = clampDrum(drum);
    const primary = clampDrum(pattern.drum[index]);
    if (kind !== primary) pattern.drumMask[index] |= 1 << kind;
    return;
  }
  for (let at = step; at < step + len; at++) {
    const covered = cell(channel, at);
    pattern.note[covered] = EMPTY;
    pattern.drumMask[covered] = 0;
  }
  pattern.note[index] = Math.round(note);
  pattern.length[index] = len;
  pattern.volume[index] = clampVol(volume);
  pattern.drum[index] = clampDrum(drum);
  pattern.drumMask[index] = 0;
  pattern.pitch[index] = PITCH_CENTER;
  pattern.stepDuty[index] = FX_INHERIT;
  pattern.stepArp[index] = FX_INHERIT;
  pattern.nudge[index] = 0;
}

export function resizeNote(pattern: Pattern, channel: number, start: number, length: number): void {
  if (channel < 0 || channel >= MAX_CHANNELS || start < 0 || start >= pattern.steps) return;
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

function keepBend(
  pattern: Pattern,
  index: number,
  pitch: number,
  stepDuty: number,
  stepArp: number,
  nudge: number,
): void {
  pattern.pitch[index] = PITCH_CENTER + clampPitch(pitch);
  pattern.stepDuty[index] = stepDuty;
  pattern.stepArp[index] = stepArp;
  pattern.nudge[index] = nudge;
}

export function moveNote(
  pattern: Pattern,
  fromChannel: number,
  fromStep: number,
  toChannel: number,
  toStep: number,
  note: number,
  drum: number,
  grabDrum?: number,
): boolean {
  const found = findNote(pattern, fromChannel, fromStep);
  if (!found) return false;
  const volume = found.volume;
  const length = found.length;
  const pitch = found.pitch;
  const stepDuty = found.stepDuty;
  const stepArp = found.stepArp;
  const nudge = found.nudge;
  const src = cell(fromChannel, found.start);
  const mask = pattern.drumMask[src];
  const inRange = toChannel >= 0 && toChannel < MAX_CHANNELS && toStep >= 0 && toStep < pattern.steps;
  if (
    grabDrum !== undefined
    && kitChannel(pattern, fromChannel)
    && (!inRange || kitChannel(pattern, toChannel))
  ) {
    dropDrum(pattern, fromChannel, found.start, grabDrum);
    if (!inRange) return true;
    const dest = cell(toChannel, toStep);
    const destEmpty = pattern.note[dest] === EMPTY;
    putNote(pattern, toChannel, toStep, length, note, volume, drum);
    if (destEmpty) keepBend(pattern, dest, pitch, stepDuty, stepArp, nudge);
    return true;
  }
  clearStart(pattern, fromChannel, found.start);
  if (!inRange) return true;
  const dest = cell(toChannel, toStep);
  if (pattern.note[dest] !== EMPTY) {
    pattern.note[dest] = EMPTY;
    pattern.drumMask[dest] = 0;
  }
  putNote(pattern, toChannel, toStep, length, note, volume, drum);
  pattern.drumMask[dest] = mask & ~(1 << clampDrum(pattern.drum[dest]));
  keepBend(pattern, dest, pitch, stepDuty, stepArp, nudge);
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
  const ch1 = Math.min(MAX_CHANNELS - 1, Math.max(c0, c1));
  const st0 = Math.max(0, Math.min(s0, s1));
  const st1 = Math.min(pattern.steps - 1, Math.max(s0, s1));
  const rows = Math.max(1, ch1 - ch0 + 1);
  const cols = Math.max(1, st1 - st0 + 1);
  const note = new Uint8Array(rows * cols);
  note.fill(EMPTY);
  const length = new Uint8Array(rows * cols);
  const volume = new Uint8Array(rows * cols);
  const drum = new Uint8Array(rows * cols);
  const pitch = new Uint8Array(rows * cols);
  const stepDuty = new Uint8Array(rows * cols);
  const stepArp = new Uint8Array(rows * cols);
  const nudge = new Int8Array(rows * cols);
  const drumMask = new Uint8Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const from = cell(ch0 + row, st0 + col);
      const to = row * cols + col;
      note[to] = pattern.note[from];
      length[to] = pattern.length[from];
      volume[to] = pattern.volume[from];
      drum[to] = pattern.drum[from];
      pitch[to] = pattern.pitch[from];
      stepDuty[to] = pattern.stepDuty[from];
      stepArp[to] = pattern.stepArp[from];
      nudge[to] = pattern.nudge[from];
      drumMask[to] = pattern.drumMask[from];
    }
  }
  return { rows, cols, note, length, volume, drum, pitch, stepDuty, stepArp, nudge, drumMask };
}

export function pasteRect(pattern: Pattern, clip: Clip, channel: number, step: number): void {
  for (let row = 0; row < clip.rows; row++) {
    const ch = channel + row;
    if (ch < 0 || ch >= MAX_CHANNELS) continue;
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
      pattern.pitch[index] = clip.pitch[from];
      pattern.stepDuty[index] = clip.stepDuty[from];
      pattern.stepArp[index] = clip.stepArp[from];
      pattern.nudge[index] = clip.nudge[from];
      pattern.drumMask[index] = clip.drumMask[from];
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
  return clonePattern(pattern);
}

function sameSnap(pattern: Pattern, snap: Snap): boolean {
  return samePattern(pattern, snap);
}

function restore(pattern: Pattern, snap: Snap): void {
  copyPattern(snap, pattern);
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

export const DOUBLE_TAP_MS = 400;

export type NoteTap = { at: number; channel: number; start: number };

export function repeatTap(previous: NoteTap | null, at: number, channel: number, start: number): boolean {
  if (!previous) return false;
  if (previous.channel !== channel || previous.start !== start) return false;
  const gap = at - previous.at;
  return gap >= 0 && gap <= DOUBLE_TAP_MS;
}
