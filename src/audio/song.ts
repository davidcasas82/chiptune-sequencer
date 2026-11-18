import {
  copyRect,
  findNote,
  pasteRect,
  setPatternSteps,
} from './edit';
import {
  ARP_UP,
  DRUM_HAT,
  DRUM_NOTE,
  EMPTY,
  MAX_ORDER,
  MAX_PATTERNS,
  MAX_STEPS,
  MAX_CHANNELS,
  SWING_STRAIGHT,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  VOL_MAX,
  cell,
  copyPattern,
  createPattern,
  placeClock,
  samePattern,
  writeStarter,
  type Pattern,
  type Place,
} from './synth';

export const SCALE_CHROMA = 0;
export const SCALE_MAJOR = 1;
export const SCALE_MINOR = 2;
export const SCALE_PENTA = 3;
export const SCALE_CUSTOM = 4;

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function bits(degrees: readonly number[]): number {
  let mask = 0;
  for (const degree of degrees) mask |= 1 << degree;
  return mask;
}

const MAJOR = bits([0, 2, 4, 5, 7, 9, 11]);
const MINOR = bits([0, 2, 3, 5, 7, 8, 10]);
const PENTA = bits([0, 2, 4, 7, 9]);
const CHROMA = 0xfff;

export type Box = { c0: number; c1: number; s0: number; s1: number };

export type Song = {
  count: number;
  current: number;
  patterns: Pattern[];
  orderLen: number;
  orderPat: Uint8Array;
  orderRep: Uint8Array;
  orderTr: Int8Array;
  loopStart: number;
  loopEnd: number;
  marker: Uint8Array;
  playSong: number;
  swing: number;
  scale: number;
  root: number;
  custom: number;
  onion: number;
  record: number;
  entry: number;
};

export type SongHistory = {
  undo: Song[];
  redo: Song[];
  base: Song | null;
};

const HISTORY_LIMIT = 64;

export function scaleMask(scale: number, custom: number): number {
  if (scale === SCALE_MAJOR) return MAJOR;
  if (scale === SCALE_MINOR) return MINOR;
  if (scale === SCALE_PENTA) return PENTA;
  if (scale === SCALE_CUSTOM) return custom & CHROMA;
  return CHROMA;
}

export function rootName(root: number): string {
  return ROOTS[((root % 12) + 12) % 12];
}

export function inScale(note: number, root: number, mask: number): boolean {
  const rel = (((Math.round(note) % 12) - root) % 12 + 12) % 12;
  return (mask & (1 << rel)) !== 0;
}

export function snapNote(note: number, root: number, mask: number): number {
  let midi = Math.round(note);
  if (midi < 0) midi = 0;
  if (midi > 127) midi = 127;
  if (mask === CHROMA || inScale(midi, root, mask)) return midi;
  for (let distance = 1; distance <= 6; distance++) {
    const up = midi + distance;
    if (up <= 127 && inScale(up, root, mask)) return up;
    const down = midi - distance;
    if (down >= 0 && inScale(down, root, mask)) return down;
  }
  return midi;
}

export function createSong(): Song {
  const patterns: Pattern[] = [];
  for (let i = 0; i < MAX_PATTERNS; i++) patterns.push(createPattern());
  writeStarter(patterns[0]);
  copyPattern(patterns[0], patterns[1]);
  transposeNotes(patterns[1], null, 5, 0, CHROMA);
  const orderPat = new Uint8Array(MAX_ORDER);
  const orderRep = new Uint8Array(MAX_ORDER);
  orderRep.fill(1);
  orderPat[1] = 1;
  orderPat[2] = 0;
  const orderTr = new Int8Array(MAX_ORDER);
  orderTr[2] = 7;
  return {
    count: 2,
    current: 0,
    patterns,
    orderLen: 3,
    orderPat,
    orderRep,
    orderTr,
    loopStart: 0,
    loopEnd: 3,
    marker: new Uint8Array(MAX_ORDER),
    playSong: 0,
    swing: SWING_STRAIGHT,
    scale: SCALE_CHROMA,
    root: 0,
    custom: MAJOR,
    onion: 0,
    record: 0,
    entry: 0,
  };
}

export function createBlankSong(): Song {
  const patterns: Pattern[] = [];
  for (let i = 0; i < MAX_PATTERNS; i++) patterns.push(createPattern());
  const pattern = patterns[0];
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.type[4] = TYPE_TRI;
  pattern.type[5] = TYPE_NOISE;
  pattern.duty.fill(0.5);
  const orderPat = new Uint8Array(MAX_ORDER);
  const orderRep = new Uint8Array(MAX_ORDER);
  orderRep.fill(1);
  return {
    count: 1,
    current: 0,
    patterns,
    orderLen: 1,
    orderPat,
    orderRep,
    orderTr: new Int8Array(MAX_ORDER),
    loopStart: 0,
    loopEnd: 1,
    marker: new Uint8Array(MAX_ORDER),
    playSong: 0,
    swing: SWING_STRAIGHT,
    scale: SCALE_CHROMA,
    root: 0,
    custom: MAJOR,
    onion: 0,
    record: 0,
    entry: 0,
  };
}

export function copySong(from: Song, to: Song): void {
  to.count = from.count;
  to.current = from.current;
  for (let i = 0; i < MAX_PATTERNS; i++) copyPattern(from.patterns[i], to.patterns[i]);
  to.orderLen = from.orderLen;
  to.orderPat.set(from.orderPat);
  to.orderRep.set(from.orderRep);
  to.orderTr.set(from.orderTr);
  to.loopStart = from.loopStart;
  to.loopEnd = from.loopEnd;
  to.marker.set(from.marker);
  to.playSong = from.playSong;
  to.swing = from.swing;
  to.scale = from.scale;
  to.root = from.root;
  to.custom = from.custom;
  to.onion = from.onion;
  to.record = from.record;
  to.entry = from.entry;
}

export function cloneSong(song: Song): Song {
  const next = createSong();
  copySong(song, next);
  return next;
}

export function sameSong(a: Song, b: Song): boolean {
  if (a.count !== b.count || a.current !== b.current || a.orderLen !== b.orderLen) return false;
  if (a.loopStart !== b.loopStart || a.loopEnd !== b.loopEnd) return false;
  if (a.playSong !== b.playSong || a.swing !== b.swing) return false;
  if (a.scale !== b.scale || a.root !== b.root || a.custom !== b.custom) return false;
  if (a.onion !== b.onion || a.record !== b.record || a.entry !== b.entry) return false;
  for (let i = 0; i < MAX_ORDER; i++) {
    if (a.orderPat[i] !== b.orderPat[i] || a.orderRep[i] !== b.orderRep[i]) return false;
    if (a.orderTr[i] !== b.orderTr[i] || a.marker[i] !== b.marker[i]) return false;
  }
  for (let i = 0; i < MAX_PATTERNS; i++) {
    if (!samePattern(a.patterns[i], b.patterns[i])) return false;
  }
  return true;
}

export function orderSteps(song: Song): number {
  let total = 0;
  for (let i = 0; i < song.orderLen; i++) {
    const index = song.orderPat[i] > 0 ? song.orderPat[i] : 0;
    const pattern = song.patterns[index];
    const steps = pattern && pattern.steps > 0 ? pattern.steps : 1;
    const rep = song.orderRep[i] > 0 ? song.orderRep[i] : 1;
    total += steps * rep;
  }
  if (total > 0) return total;
  const live = song.patterns[song.current];
  return live && live.steps > 0 ? live.steps : 1;
}

export function placeSong(song: Song, abs: number, out: Place): Place {
  const live = song.patterns[song.current];
  placeClock(
    song.playSong,
    live ? live.steps : 16,
    song.current,
    song.loopStart,
    song.loopEnd,
    song.orderLen,
    song.orderPat,
    song.orderRep,
    song.orderTr,
    song.patterns,
    abs,
    out,
  );
  return out;
}

function kitCopy(from: Pattern, to: Pattern): void {
  to.steps = from.steps;
  to.type.set(from.type);
  to.duty.set(from.duty);
  to.vol.set(from.vol);
  to.pan.set(from.pan);
  to.attack.set(from.attack);
  to.decay.set(from.decay);
  to.sustain.set(from.sustain);
  to.release.set(from.release);
  to.vibDepth.set(from.vibDepth);
  to.vibRate.set(from.vibRate);
  to.slide.set(from.slide);
  to.arpRate.set(from.arpRate);
  to.arp.set(from.arp);
  to.preset.set(from.preset);
  to.sweep.set(from.sweep);
  to.lfsr.set(from.lfsr);
  to.wave.set(from.wave);
  to.noiseShort.set(from.noiseShort);
  to.noiseHz.set(from.noiseHz);
  to.noiseDecay.set(from.noiseDecay);
  to.noiseGain.set(from.noiseGain);
  to.noiseTone.set(from.noiseTone);
  to.noiseToneDecay.set(from.noiseToneDecay);
  to.noiseToneGain.set(from.noiseToneGain);
  to.noiseDrop.set(from.noiseDrop);
  to.noiseBase.set(from.noiseBase);
  to.noiseStart.set(from.noiseStart);
}

function clearNotes(pattern: Pattern): void {
  pattern.note.fill(EMPTY);
  pattern.length.fill(1);
  pattern.nudge.fill(0);
}

export function clearPatternNotes(pattern: Pattern): void {
  clearNotes(pattern);
}

export function appendEntry(song: Song, pat: number): boolean {
  if (song.orderLen >= MAX_ORDER) return false;
  const extend = song.loopEnd === song.orderLen;
  const index = song.orderLen;
  song.orderPat[index] = pat;
  song.orderRep[index] = 1;
  song.orderTr[index] = 0;
  song.marker[index] = 0;
  song.orderLen += 1;
  if (extend) song.loopEnd = song.orderLen;
  song.entry = index;
  return true;
}

export function addPattern(song: Song, duplicate: boolean): boolean {
  if (song.count >= MAX_PATTERNS) return false;
  const src = song.patterns[song.current];
  const dest = song.patterns[song.count];
  if (duplicate) copyPattern(src, dest);
  else {
    kitCopy(src, dest);
    clearNotes(dest);
  }
  const index = song.count;
  song.count += 1;
  song.current = index;
  appendEntry(song, index);
  if (song.orderLen > 1) song.playSong = 1;
  return true;
}

export function selectPattern(song: Song, index: number): void {
  if (index < 0 || index >= song.count) return;
  song.current = index;
}

export function setRepeat(song: Song, entry: number, repeats: number): void {
  if (entry < 0 || entry >= song.orderLen) return;
  let next = Math.round(repeats);
  if (next < 1) next = 1;
  if (next > 8) next = 8;
  song.orderRep[entry] = next;
}

export function setEntryTranspose(song: Song, entry: number, semis: number): void {
  if (entry < 0 || entry >= song.orderLen) return;
  let next = Math.round(semis);
  if (next < -24) next = -24;
  if (next > 24) next = 24;
  song.orderTr[entry] = next;
}

export function setLoop(song: Song, start: number, end: number): void {
  let from = Math.round(start);
  let to = Math.round(end);
  if (from < 0) from = 0;
  if (from >= song.orderLen) from = song.orderLen - 1;
  if (to <= from) to = from + 1;
  if (to > song.orderLen) to = song.orderLen;
  song.loopStart = from;
  song.loopEnd = to;
}

export function toggleMarker(song: Song, entry: number): void {
  if (entry < 0 || entry >= song.orderLen) return;
  song.marker[entry] = song.marker[entry] ? 0 : 1;
}

function areaOf(pattern: Pattern, box: Box | null): Box {
  const s1 = pattern.steps - 1;
  if (!box) return { c0: 0, c1: MAX_CHANNELS - 1, s0: 0, s1 };
  let c0 = Math.min(box.c0, box.c1);
  let c1 = Math.max(box.c0, box.c1);
  let s0 = Math.min(box.s0, box.s1);
  let sHi = Math.max(box.s0, box.s1);
  if (c0 < 0) c0 = 0;
  if (c1 >= MAX_CHANNELS) c1 = MAX_CHANNELS - 1;
  if (s0 < 0) s0 = 0;
  if (sHi > s1) sHi = s1;
  return { c0, c1, s0, s1: sHi };
}

function tonal(pattern: Pattern, channel: number): boolean {
  return pattern.type[channel] !== TYPE_NOISE && pattern.type[channel] !== TYPE_OFF;
}

export function snapPattern(pattern: Pattern, root: number, mask: number): void {
  if (mask === CHROMA) return;
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (!tonal(pattern, channel)) continue;
    for (let step = 0; step < pattern.steps; step++) {
      const index = cell(channel, step);
      if (pattern.note[index] === EMPTY) continue;
      pattern.note[index] = snapNote(pattern.note[index], root, mask);
    }
  }
}

export function setScale(song: Song, scale: number): void {
  song.scale = scale;
  const pattern = song.patterns[song.current];
  snapPattern(pattern, song.root, scaleMask(song.scale, song.custom));
}

export function setRoot(song: Song, root: number): void {
  song.root = ((Math.round(root) % 12) + 12) % 12;
  snapPattern(song.patterns[song.current], song.root, scaleMask(song.scale, song.custom));
}

export function togglePitch(song: Song, pitchClass: number): void {
  const bit = 1 << (((pitchClass % 12) + 12) % 12);
  song.custom = (song.custom ^ bit) & CHROMA;
  if (song.custom === 0) song.custom = bit;
  if (song.scale === SCALE_CUSTOM) {
    snapPattern(song.patterns[song.current], song.root, song.custom);
  }
}

function eachStart(pattern: Pattern, box: Box, visit: (channel: number, step: number, index: number) => void): void {
  for (let channel = box.c0; channel <= box.c1; channel++) {
    for (let step = box.s0; step <= box.s1; step++) {
      const index = cell(channel, step);
      if (pattern.note[index] === EMPTY) continue;
      visit(channel, step, index);
    }
  }
}

export function randomizeNotes(pattern: Pattern, box: Box | null, root: number, mask: number, rng: () => number): void {
  const area = areaOf(pattern, box);
  eachStart(pattern, area, (channel, _step, index) => {
    if (!tonal(pattern, channel)) return;
    const base = pattern.note[index];
    let pick = snapNote(base, root, mask);
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = base + (Math.floor(rng() * 15) - 7);
      if (candidate < 0 || candidate > 127) continue;
      if (!inScale(candidate, root, mask)) continue;
      pick = candidate;
      break;
    }
    pattern.note[index] = pick;
  });
}

export function humanize(pattern: Pattern, box: Box | null, rng: () => number): void {
  const area = areaOf(pattern, box);
  eachStart(pattern, area, (_channel, _step, index) => {
    pattern.nudge[index] = Math.floor(rng() * 5) - 2;
    let volume = pattern.volume[index] + (Math.floor(rng() * 5) - 2);
    if (volume < 1) volume = 1;
    if (volume > VOL_MAX) volume = VOL_MAX;
    pattern.volume[index] = volume;
  });
}

function shiftDegree(note: number, root: number, mask: number, dir: number): number {
  let midi = note + dir;
  while (midi >= 0 && midi <= 127) {
    if (inScale(midi, root, mask)) return midi;
    midi += dir;
  }
  return note;
}

export function vary(pattern: Pattern, box: Box | null, root: number, mask: number, rng: () => number): void {
  const area = areaOf(pattern, box);
  eachStart(pattern, area, (channel, _step, index) => {
    if (!tonal(pattern, channel)) return;
    const roll = rng();
    if (roll < 0.5) {
      pattern.note[index] = shiftDegree(pattern.note[index], root, mask, rng() < 0.5 ? -1 : 1);
      return;
    }
    if (roll < 0.75) {
      let length = pattern.length[index] + (rng() < 0.5 ? -1 : 1);
      if (length < 1) length = 1;
      const room = pattern.steps - _step;
      if (length > room) length = room;
      pattern.length[index] = length;
    }
  });
}

function degreesOf(mask: number): number[] {
  const degrees: number[] = [];
  for (let degree = 0; degree < 12; degree++) if (mask & (1 << degree)) degrees.push(degree);
  if (degrees.length === 0) degrees.push(0);
  return degrees;
}

export function fillSteps(pattern: Pattern, box: Box | null, root: number, mask: number): void {
  const area = areaOf(pattern, box);
  const degrees = degreesOf(mask);
  for (let channel = area.c0; channel <= area.c1; channel++) {
    if (pattern.type[channel] === TYPE_NOISE) {
      for (let step = area.s0; step <= area.s1; step++) {
        if (step % 2 === 0) continue;
        if (findNote(pattern, channel, step)) continue;
        pattern.note[cell(channel, step)] = DRUM_NOTE;
        pattern.length[cell(channel, step)] = 1;
        pattern.volume[cell(channel, step)] = 8;
        pattern.drum[cell(channel, step)] = DRUM_HAT;
        pattern.nudge[cell(channel, step)] = 0;
      }
      continue;
    }
    if (!tonal(pattern, channel)) continue;
    let center = 60 + root;
    for (let step = 0; step < pattern.steps; step++) {
      const note = pattern.note[cell(channel, step)];
      if (note === EMPTY) continue;
      center = note;
      break;
    }
    for (let step = area.s0; step <= area.s1; step++) {
      if (findNote(pattern, channel, step)) continue;
      const degree = degrees[(step + channel) % degrees.length];
      let midi = Math.floor(center / 12) * 12 + ((root + degree) % 12);
      while (midi < center - 6) midi += 12;
      while (midi > center + 6) midi -= 12;
      if (midi < 0) midi = root;
      if (midi > 127) midi = 127;
      const index = cell(channel, step);
      pattern.note[index] = snapNote(midi, root, mask);
      pattern.length[index] = 1;
      pattern.volume[index] = 11;
      pattern.nudge[index] = 0;
    }
  }
}

export function transposeNotes(pattern: Pattern, box: Box | null, semis: number, root: number, mask: number): void {
  const area = areaOf(pattern, box);
  eachStart(pattern, area, (channel, _step, index) => {
    if (!tonal(pattern, channel)) return;
    let midi = pattern.note[index] + semis;
    if (midi < 0) midi = 0;
    if (midi > 127) midi = 127;
    pattern.note[index] = mask === CHROMA ? midi : snapNote(midi, root, mask);
  });
}

export function quantizeNotes(pattern: Pattern, box: Box | null): void {
  const area = areaOf(pattern, box);
  eachStart(pattern, area, (_channel, _step, index) => {
    pattern.nudge[index] = 0;
  });
}

type Held = {
  channel: number;
  step: number;
  note: number;
  length: number;
  volume: number;
  drum: number;
  pitch: number;
  stepDuty: number;
  stepArp: number;
  nudge: number;
};

function take(pattern: Pattern, area: Box): Held[] {
  const notes: Held[] = [];
  eachStart(pattern, area, (channel, step, index) => {
    notes.push({
      channel,
      step,
      note: pattern.note[index],
      length: pattern.length[index],
      volume: pattern.volume[index],
      drum: pattern.drum[index],
      pitch: pattern.pitch[index],
      stepDuty: pattern.stepDuty[index],
      stepArp: pattern.stepArp[index],
      nudge: pattern.nudge[index],
    });
  });
  return notes;
}

function writeHeld(pattern: Pattern, note: Held, step: number): void {
  if (step < 0 || step >= pattern.steps) return;
  const index = cell(note.channel, step);
  pattern.note[index] = note.note;
  let length = note.length > 0 ? note.length : 1;
  const room = pattern.steps - step;
  if (length > room) length = room;
  pattern.length[index] = length;
  pattern.volume[index] = note.volume;
  pattern.drum[index] = note.drum;
  pattern.pitch[index] = note.pitch;
  pattern.stepDuty[index] = note.stepDuty;
  pattern.stepArp[index] = note.stepArp;
  pattern.nudge[index] = note.nudge;
}

export function shiftNotes(pattern: Pattern, box: Box | null, delta: number): void {
  const area = areaOf(pattern, box);
  const width = area.s1 - area.s0 + 1;
  if (width <= 1) return;
  const shift = ((Math.round(delta) % width) + width) % width;
  if (shift === 0) return;
  const notes = take(pattern, area);
  for (const note of notes) pattern.note[cell(note.channel, note.step)] = EMPTY;
  for (const note of notes) {
    const next = area.s0 + ((note.step - area.s0 + shift) % width);
    writeHeld(pattern, note, next);
  }
}

function duplicateSpan(pattern: Pattern, c0: number, c1: number): void {
  const steps = pattern.steps;
  if (steps * 2 <= MAX_STEPS) {
    const clip = copyRect(pattern, c0, 0, c1, steps - 1);
    setPatternSteps(pattern, steps * 2);
    pasteRect(pattern, clip, c0, steps);
    return;
  }
  const half = Math.floor(steps / 2);
  if (half < 1) return;
  const clip = copyRect(pattern, c0, 0, c1, half - 1);
  pasteRect(pattern, clip, c0, half);
}

export function duplicateNotes(pattern: Pattern, box: Box | null): void {
  if (!box) {
    duplicateSpan(pattern, 0, MAX_CHANNELS - 1);
    return;
  }
  const area = areaOf(pattern, box);
  const coversPattern = area.s0 === 0 && area.s1 >= pattern.steps - 1;
  if (coversPattern) {
    duplicateSpan(pattern, area.c0, area.c1);
    return;
  }
  const width = area.s1 - area.s0 + 1;
  const clip = copyRect(pattern, area.c0, area.s0, area.c1, area.s1);
  pasteRect(pattern, clip, area.c0, area.s0 + width);
}

const CHORD_TONES = [
  [0, 4, 7],
  [0, 3, 7],
  [0, 4, 7, 10],
  [0, 5, 7],
] as const;

export function applyChord(pattern: Pattern, box: Box | null, shape: number): void {
  const tones = CHORD_TONES[shape] ?? CHORD_TONES[0];
  const area = areaOf(pattern, box);
  const starts: Held[] = [];
  eachStart(pattern, area, (channel, step, index) => {
    if (!tonal(pattern, channel)) return;
    starts.push({
      channel,
      step,
      note: pattern.note[index],
      length: 1,
      volume: pattern.volume[index],
      drum: pattern.drum[index],
      pitch: pattern.pitch[index],
      stepDuty: pattern.stepDuty[index],
      stepArp: pattern.stepArp[index],
      nudge: 0,
    });
  });
  const used = new Set<number>();
  for (const hit of starts) {
    if (used.has(cell(hit.channel, hit.step))) continue;
    for (let i = 0; i < tones.length; i++) {
      const at = hit.step + i;
      if (at > area.s1 || at >= pattern.steps) break;
      const midi = hit.note + tones[i];
      if (midi > 127) break;
      writeHeld(pattern, { ...hit, note: midi, length: 1 }, at);
      used.add(cell(hit.channel, at));
    }
  }
}

export function applyArp(pattern: Pattern, box: Box | null): void {
  const area = areaOf(pattern, box);
  let spread = false;
  for (let step = area.s0; step <= area.s1; step++) {
    const hits: Held[] = [];
    for (let channel = area.c0; channel <= area.c1; channel++) {
      if (!tonal(pattern, channel)) continue;
      const index = cell(channel, step);
      if (pattern.note[index] === EMPTY) continue;
      hits.push({
        channel,
        step,
        note: pattern.note[index],
        length: 1,
        volume: pattern.volume[index],
        drum: pattern.drum[index],
        pitch: pattern.pitch[index],
        stepDuty: pattern.stepDuty[index],
        stepArp: pattern.stepArp[index],
        nudge: 0,
      });
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a.note - b.note);
    for (const hit of hits) pattern.note[cell(hit.channel, step)] = EMPTY;
    const dest = hits[0].channel;
    for (let i = 0; i < hits.length; i++) {
      const at = step + i;
      if (at > area.s1 || at >= pattern.steps) break;
      writeHeld(pattern, { ...hits[i], channel: dest, length: 1, nudge: 0 }, at);
    }
    spread = true;
  }
  if (spread) return;
  eachStart(pattern, area, (channel, _step, index) => {
    if (!tonal(pattern, channel)) return;
    pattern.stepArp[index] = ARP_UP;
    if (!(pattern.arpRate[channel] > 0)) pattern.arpRate[channel] = 12;
  });
}

export function createSongHistory(): SongHistory {
  return { undo: [], redo: [], base: null };
}

export function beginSong(history: SongHistory, song: Song): void {
  if (history.base) return;
  history.base = cloneSong(song);
}

export function previewSong(history: SongHistory, song: Song, edit: (song: Song) => void): void {
  beginSong(history, song);
  if (!history.base) return;
  copySong(history.base, song);
  edit(song);
}

export function commitSong(history: SongHistory, song: Song): void {
  if (!history.base) return;
  if (!sameSong(song, history.base)) {
    history.undo.push(history.base);
    if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
    history.redo.length = 0;
  }
  history.base = null;
}

export function cancelSong(history: SongHistory, song: Song): void {
  if (!history.base) return;
  copySong(history.base, song);
  history.base = null;
}

export function undoSong(history: SongHistory, song: Song): boolean {
  if (history.base) cancelSong(history, song);
  const prev = history.undo.pop();
  if (!prev) return false;
  history.redo.push(cloneSong(song));
  copySong(prev, song);
  return true;
}

export function redoSong(history: SongHistory, song: Song): boolean {
  if (history.base) commitSong(history, song);
  const next = history.redo.pop();
  if (!next) return false;
  history.undo.push(cloneSong(song));
  copySong(next, song);
  return true;
}

export function canUndoSong(history: SongHistory): boolean {
  return history.undo.length > 0;
}

export function canRedoSong(history: SongHistory): boolean {
  return history.redo.length > 0;
}
