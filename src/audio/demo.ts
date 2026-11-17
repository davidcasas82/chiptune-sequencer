import { putNote } from './edit';
import {
  DRUM_HAT,
  DRUM_KICK,
  DRUM_NOTE,
  DRUM_SNARE,
  EMPTY,
  TYPE_NOISE,
  TYPE_PULSE,
  TYPE_TRI,
  copyPattern,
  stepSeconds,
  type Pattern,
} from './synth';
import {
  SCALE_MAJOR,
  createSong,
  scaleMask,
  snapPattern,
  vary,
  type Song,
} from './song';

export const GUIDE_BPM = 90;
const BARS = 16;

export type Cue = { at: number; text: string };

export type GuidePart = {
  song: Song;
  bars: number;
  swing: number;
};

const CHAIN: readonly number[] = [60, 64, 67, 64, 65, 64, 62, 60, 67, 72, 67, 64, 60, 62, 64, 67];
const LIFT: readonly number[] = [72, 74, 76, 74, 72, 71, 69, 67, 72, 76, 74, 72, 71, 69, 67, 72];
const SHARP: readonly number[] = [60, 62, 64, 66, 67, 66, 64, 62, 60, 66, 67, 69, 67, 66, 64, 62];

function mix(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function voice(pattern: Pattern): void {
  pattern.steps = BARS;
  pattern.note.fill(EMPTY);
  pattern.nudge.fill(0);
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.duty[0] = 0.25;
  pattern.duty[1] = 0.5;
  pattern.duty[2] = 0.5;
  pattern.arp[0] = 0;
  pattern.arp[1] = 0;
  pattern.sweep[0] = 0;
  pattern.sweep[1] = 0;
}

function line(pattern: Pattern, notes: readonly number[], bass: number): void {
  voice(pattern);
  for (let step = 0; step < notes.length; step++) {
    putNote(pattern, 0, step, 1, notes[step], 12, 0);
  }
  for (let step = 0; step < BARS; step += 4) putNote(pattern, 2, step, 2, bass, 10, 0);
  putNote(pattern, 3, 0, 1, DRUM_NOTE, 14, DRUM_KICK);
  putNote(pattern, 3, 4, 1, DRUM_NOTE, 12, DRUM_SNARE);
  putNote(pattern, 3, 8, 1, DRUM_NOTE, 14, DRUM_KICK);
  putNote(pattern, 3, 12, 1, DRUM_NOTE, 12, DRUM_SNARE);
  for (let step = 2; step < BARS; step += 4) putNote(pattern, 3, step, 1, DRUM_NOTE, 8, DRUM_HAT);
}

function groove(pattern: Pattern): void {
  voice(pattern);
  for (let step = 0; step < BARS; step++) putNote(pattern, 3, step, 1, DRUM_NOTE, 10, DRUM_HAT);
  for (let step = 0; step < BARS; step += 4) putNote(pattern, 2, step, 1, 36, 12, 0);
  putNote(pattern, 0, 0, 2, 60, 12, 0);
  putNote(pattern, 0, 8, 2, 67, 12, 0);
  putNote(pattern, 3, 4, 1, DRUM_NOTE, 14, DRUM_SNARE);
  putNote(pattern, 3, 12, 1, DRUM_NOTE, 14, DRUM_SNARE);
}

function oneEntry(pattern: Pattern, swing: number): Song {
  const song = createSong();
  copyPattern(pattern, song.patterns[0]);
  song.count = 1;
  song.current = 0;
  song.orderLen = 1;
  song.orderPat[0] = 0;
  song.orderRep[0] = 1;
  song.orderTr[0] = 0;
  song.loopStart = 0;
  song.loopEnd = 1;
  song.playSong = 1;
  song.swing = swing;
  return song;
}

export function guideSong(): Song {
  const song = createSong();
  line(song.patterns[0], CHAIN, 36);
  line(song.patterns[1], LIFT, 43);
  copyPattern(song.patterns[0], song.patterns[2]);
  line(song.patterns[2], SHARP, 36);
  copyPattern(song.patterns[2], song.patterns[3]);
  snapPattern(song.patterns[3], 0, scaleMask(SCALE_MAJOR, 0));
  copyPattern(song.patterns[3], song.patterns[4]);
  vary(song.patterns[4], null, 0, scaleMask(SCALE_MAJOR, 0), mix(1));
  groove(song.patterns[5]);
  song.count = 6;
  song.current = 0;
  song.orderLen = 6;
  song.orderTr.fill(0);
  song.marker.fill(0);
  song.orderPat[0] = 0;
  song.orderPat[1] = 1;
  song.orderPat[2] = 0;
  song.orderTr[2] = 7;
  song.orderPat[3] = 2;
  song.orderPat[4] = 3;
  song.orderPat[5] = 4;
  for (let i = 0; i < 6; i++) song.orderRep[i] = 1;
  song.loopStart = 0;
  song.loopEnd = 6;
  song.playSong = 1;
  song.swing = 50;
  song.scale = SCALE_MAJOR;
  song.root = 0;
  return song;
}

export function guideParts(): GuidePart[] {
  const song = guideSong();
  return [
    { song, bars: 6, swing: 50 },
    { song: oneEntry(song.patterns[5], 50), bars: 1, swing: 50 },
    { song: oneEntry(song.patterns[5], 66), bars: 2, swing: 66 },
  ];
}

export function guideCues(): Cue[] {
  const bar = BARS * stepSeconds(GUIDE_BPM);
  return [
    { at: 0, text: 'Pattern A' },
    { at: bar, text: 'Pattern B' },
    { at: bar * 2, text: 'Pattern A transposed up 7' },
    { at: bar * 3, text: 'Scale lock off, F# in the line' },
    { at: bar * 4, text: 'Scale lock on, F# snapped to G' },
    { at: bar * 5, text: 'Variation of the snapped line' },
    { at: bar * 6, text: 'Swing off, straight 16ths' },
    { at: bar * 7, text: 'Swing on' },
  ];
}

export function guideSeconds(): number {
  return 9 * BARS * stepSeconds(GUIDE_BPM);
}

export function cueSheet(): string {
  return guideCues()
    .map((cue) => {
      const tenths = Math.round(cue.at * 10);
      const seconds = Math.floor(tenths / 10);
      const frac = tenths % 10;
      const mins = Math.floor(seconds / 60);
      const rest = seconds % 60;
      const stamp = `${mins}:${String(rest).padStart(2, '0')}.${frac}`;
      return `${stamp}  ${cue.text}`;
    })
    .join('\n');
}

