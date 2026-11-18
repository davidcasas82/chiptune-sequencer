import { putNote } from './edit';
import {
  DRUM_HAT,
  DRUM_KICK,
  DRUM_NOTE,
  DRUM_SNARE,
  EMPTY,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  copyPattern,
  stepSeconds,
  type Pattern,
} from './synth';
import {
  SCALE_MAJOR,
  createSong,
  type Song,
} from './song';

export const GUIDE_BPM = 90;
const BARS = 16;

export type Cue = { at: number; text: string };

export type GuidePart = {
  song: Song;
  bars: number;
  swing: number;
  delay: number;
  crush: number;
};

const CHAIN: readonly number[] = [60, 64, 67, 64, 65, 64, 62, 60, 67, 72, 67, 64, 60, 62, 64, 67];

function voice(pattern: Pattern): void {
  pattern.steps = BARS;
  pattern.note.fill(EMPTY);
  pattern.nudge.fill(0);
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.type[4] = TYPE_OFF;
  pattern.type[5] = TYPE_OFF;
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

function addTriangle(pattern: Pattern): void {
  pattern.type[4] = TYPE_TRI;
  for (let step = 0; step < BARS; step += 2) putNote(pattern, 4, step, 2, 72, 9, 0);
}

function addNoise(pattern: Pattern): void {
  pattern.type[5] = TYPE_NOISE;
  for (let step = 1; step < BARS; step += 2) putNote(pattern, 5, step, 1, DRUM_NOTE, 8, DRUM_HAT);
}

export function guideSong(): Song {
  const song = createSong();
  line(song.patterns[0], CHAIN, 36);
  copyPattern(song.patterns[0], song.patterns[1]);
  addTriangle(song.patterns[1]);
  copyPattern(song.patterns[1], song.patterns[2]);
  addNoise(song.patterns[2]);
  song.count = 3;
  song.current = 0;
  song.orderLen = 3;
  song.orderTr.fill(0);
  song.marker.fill(0);
  song.orderPat[0] = 0;
  song.orderPat[1] = 1;
  song.orderPat[2] = 2;
  for (let i = 0; i < 3; i++) song.orderRep[i] = 1;
  song.loopStart = 0;
  song.loopEnd = 3;
  song.playSong = 1;
  song.swing = 50;
  song.scale = SCALE_MAJOR;
  song.root = 0;
  return song;
}

export function guideParts(): GuidePart[] {
  const song = guideSong();
  const dry = oneEntry(song.patterns[0], 50);
  const tri = oneEntry(song.patterns[1], 50);
  const full = oneEntry(song.patterns[2], 50);
  return [
    { song: dry, bars: 2, swing: 50, delay: 0, crush: 0 },
    { song: tri, bars: 2, swing: 50, delay: 0, crush: 0 },
    { song: full, bars: 1, swing: 50, delay: 0, crush: 0 },
    { song: full, bars: 2, swing: 50, delay: 0.65, crush: 0 },
    { song: full, bars: 2, swing: 50, delay: 0, crush: 0.7 },
  ];
}

export function guideCues(): Cue[] {
  const bar = BARS * stepSeconds(GUIDE_BPM);
  return [
    { at: 0, text: 'Four voices, dry' },
    { at: bar * 2, text: 'Second triangle' },
    { at: bar * 4, text: 'Second noise' },
    { at: bar * 5, text: 'Light delay' },
    { at: bar * 7, text: 'Light bitcrush' },
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

