import { putNote, setPatternSteps } from './edit';
import { projectFrom, type ProjectFile } from './project';
import { createBlankSong } from './song';
import {
  DRUM_HAT,
  DRUM_KICK,
  DRUM_NOTE,
  DRUM_SNARE,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  type Pattern,
} from './synth';

export type BuiltinSong = {
  id: string;
  name: string;
  file: ProjectFile;
};

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

type Groove = 'smb' | 'march' | 'tetris' | 'wily';

type Bar = {
  lead: string;
  harm: string;
  bass: string;
  groove: Groove;
  fill?: boolean;
};

function pitch(token: string): number {
  const match = /^([A-G])([#b])?(\d)$/.exec(token);
  if (!match) throw new Error(`bad pitch ${token}`);
  let semi = SEMI[match[1]];
  if (match[2] === '#') semi += 1;
  if (match[2] === 'b') semi -= 1;
  return (Number(match[3]) + 1) * 12 + semi;
}

function lay(pattern: Pattern, channel: number, bar: number, spec: string, volume: number): void {
  let step = bar * 16;
  const start = step;
  for (const token of spec.trim().split(/\s+/)) {
    if (!token) continue;
    const held = /^(.*)\*(\d+)$/.exec(token);
    const name = held ? held[1] : token;
    const eighths = held ? Number(held[2]) : 1;
    const len = eighths * 2;
    if (name !== '.' && name !== 'r') putNote(pattern, channel, step, len, pitch(name), volume, 0);
    step += len;
  }
  if (step !== start + 16) throw new Error(`bar ${bar} channel ${channel} "${spec}" spans ${step - start}`);
}

function hit(pattern: Pattern, step: number, drum: number, volume: number): void {
  putNote(pattern, 3, step, 1, DRUM_NOTE, volume, drum);
}

function kickHat(pattern: Pattern, step: number): void {
  hit(pattern, step, DRUM_KICK, 14);
  hit(pattern, step, DRUM_HAT, 9);
}

function snareHat(pattern: Pattern, step: number): void {
  hit(pattern, step, DRUM_SNARE, 13);
  hit(pattern, step, DRUM_HAT, 9);
}

function hat(pattern: Pattern, step: number, volume = 8): void {
  hit(pattern, step, DRUM_HAT, volume);
}

function kick(pattern: Pattern, step: number): void {
  hit(pattern, step, DRUM_KICK, 14);
}

function snare(pattern: Pattern, step: number): void {
  hit(pattern, step, DRUM_SNARE, 12);
}

function drums(pattern: Pattern, bar: number, groove: Groove, fill: boolean): void {
  const at = bar * 16;
  if (groove === 'march') {
    kickHat(pattern, at);
    snareHat(pattern, at + 4);
    kick(pattern, at + 8);
    snareHat(pattern, at + 12);
    return;
  }
  if (groove === 'smb') {
    kickHat(pattern, at);
    hat(pattern, at + 2);
    snareHat(pattern, at + 4);
    hat(pattern, at + 6);
    hat(pattern, at + 7);
    kickHat(pattern, at + 8);
    hat(pattern, at + 10);
    snareHat(pattern, at + 12);
    hat(pattern, at + 14);
    hat(pattern, at + 15);
    return;
  }
  kickHat(pattern, at);
  hat(pattern, at + 2);
  snareHat(pattern, at + 4);
  hat(pattern, at + 6);
  kickHat(pattern, at + 8);
  hat(pattern, at + 10);
  snareHat(pattern, at + 12);
  hat(pattern, at + 14);
  if (fill) {
    snare(pattern, at + 13);
    snare(pattern, at + 15);
  }
}

function voice(pattern: Pattern, dutyLead: number, dutyHarm: number, steps: number): void {
  setPatternSteps(pattern, steps);
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.type[4] = TYPE_OFF;
  pattern.type[5] = TYPE_OFF;
  pattern.duty[0] = dutyLead;
  pattern.duty[1] = dutyHarm;
  pattern.vol[0] = 0.9;
  pattern.vol[1] = 0.72;
  pattern.vol[2] = 0.84;
  pattern.vol[3] = 0.8;
  pattern.arp.fill(0);
  pattern.arpRate.fill(0);
  pattern.sweep.fill(0);
}

function build(name: string, bpm: number, dutyLead: number, dutyHarm: number, bars: readonly Bar[]): ProjectFile {
  const song = createBlankSong();
  const count = Math.ceil(bars.length / 4);
  song.count = count;
  song.current = 0;
  song.orderLen = count;
  song.loopStart = 0;
  song.loopEnd = count;
  song.playSong = 1;
  song.swing = 50;
  song.scale = 0;
  song.root = 0;
  for (let index = 0; index < count; index++) {
    const pattern = song.patterns[index];
    const slice = bars.slice(index * 4, index * 4 + 4);
    voice(pattern, dutyLead, dutyHarm, slice.length * 16);
    slice.forEach((bar, local) => {
      lay(pattern, 0, local, bar.lead, 13);
      lay(pattern, 1, local, bar.harm, 10);
      lay(pattern, 2, local, bar.bass, 12);
      drums(pattern, local, bar.groove, bar.fill === true);
    });
    song.orderPat[index] = index;
    song.orderRep[index] = 1;
    song.orderTr[index] = 0;
  }
  return projectFrom(song, bpm, 0, 0, name);
}

function song(id: string, name: string, bpm: number, dutyLead: number, dutyHarm: number, bars: readonly Bar[]): BuiltinSong {
  return { id, name, file: build(name, bpm, dutyLead, dutyHarm, bars) };
}

const MARIO: readonly Bar[] = [
  { lead: 'E5 E5 . E5 . C5 E5 .', harm: 'C5 C5 . C5 . G4 C5 .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'G5*2 . . . . . .', harm: 'E5*2 . . . . . .', bass: 'G2 D3 G3 D3 G2 D3 G2 .', groove: 'smb' },
  { lead: 'C5*3 G4*3 E4*2', harm: 'E4*3 D4*3 C4*2', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: '. A4 . B4 . Bb4 A4 .', harm: '. F4 . G4 . G4 F4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'G4 E5 G5 A5 . F5 G5 .', harm: 'E4 C5 E5 F5 . D5 E5 .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'E5*2 C5*2 D5 B4 . .', harm: 'C5*2 G4*2 B4 G4 . .', bass: 'G2 D3 G3 D3 B2 D3 G2 .', groove: 'smb' },
  { lead: 'C5*3 G4*3 E4*2', harm: 'E4*3 D4*3 C4*2', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: '. A4 . B4 . Bb4 A4 .', harm: '. F4 . G4 . G4 F4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'G4 E5 G5 A5 . F5 G5 .', harm: 'E4 C5 E5 F5 . D5 E5 .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'E5*2 C5*2 D5 B4 . .', harm: 'C5*2 G4*2 B4 G4 . .', bass: 'G2 D3 G3 D3 B2 D3 G2 .', groove: 'smb' },
  { lead: '. G5 F#5 F5 D#5 . E5 .', harm: '. E5 D5 C5 Bb4 . C5 .', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: 'G#4 A4 C5 . A4 C5 D5 .', harm: 'E4 F4 A4 . F4 A4 B4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: '. G5 F#5 F5 D#5 . E5 .', harm: '. E5 D5 C5 Bb4 . C5 .', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: 'C6 . C6 C6 . . . .', harm: 'G5 . G5 G5 . . . .', bass: 'C3 E3 G3 C4 E3 G3 C3 E3', groove: 'smb' },
  { lead: '. G5 F#5 F5 D#5 . E5 .', harm: '. E5 D5 C5 Bb4 . C5 .', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: 'G#4 A4 C5 . A4 C5 D5 .', harm: 'E4 F4 A4 . F4 A4 B4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'D#5 . D5 . C5 . . .', harm: 'C5 . B4 . G4 . . .', bass: 'C3 G2 E3 G2 C3 G2 C3 .', groove: 'smb' },
  { lead: 'C5 C5 . C5 . C5 D5 .', harm: 'A4 A4 . A4 . A4 B4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'E5 C5 . A4 G4 . . .', harm: 'C5 G4 . F4 E4 . . .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'C5 C5 . C5 . C5 D5 E5', harm: 'A4 A4 . A4 . A4 B4 C5', bass: 'F2 C3 F3 C3 A2 C3 Bb2 C3', groove: 'smb' },
  { lead: '. . . . . . . .', harm: '. . . . . . . .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'C5 C5 . C5 . C5 D5 .', harm: 'A4 A4 . A4 . A4 B4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'E5 C5 . A4 G4 . . .', harm: 'C5 G4 . F4 E4 . . .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'C5 C5 . C5 . C5 D5 .', harm: 'A4 A4 . A4 . A4 B4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'E5*2 C5*2 A4*2 G4*2', harm: 'C5*2 G4*2 F4*2 E4*2', bass: 'C3 G2 E3 G2 C3 G2 E3 G2', groove: 'smb' },
  { lead: 'C5*3 G4*3 E4*2', harm: 'E4*3 D4*3 C4*2', bass: 'C3 G2 C3 G2 E3 G2 C3 G2', groove: 'smb' },
  { lead: '. A4 . B4 . Bb4 A4 .', harm: '. F4 . G4 . G4 F4 .', bass: 'F2 C3 F3 C3 A2 C3 F2 C3', groove: 'smb' },
  { lead: 'G4 E5 G5 A5 . F5 G5 .', harm: 'E4 C5 E5 F5 . D5 E5 .', bass: 'C3 E3 G3 E3 C3 E3 G3 E3', groove: 'smb' },
  { lead: 'E5*2 C5*2 D5 B4 . .', harm: 'C5*2 G4*2 B4 G4 . .', bass: 'G2 D3 G3 D3 B2 D3 G2 .', groove: 'smb' },
  { lead: 'C5*2 . . A4*2 . .', harm: 'A4*2 . . F4*2 . .', bass: 'F2 C3 A2 C3 F2 C3 A2 C3', groove: 'smb' },
  { lead: 'G4*4 E4*2 C4*2', harm: 'E4*4 C4*2 G3*2', bass: 'C3 G2 E3 G2 C3 G2 C2 .', groove: 'smb' },
  { lead: 'C5*8', harm: 'E4*8', bass: 'C3*8', groove: 'smb' },
];

const ZELDA: readonly Bar[] = [
  { lead: 'Bb4*2 Bb4*2 Bb4*2 F4*2', harm: 'G4*2 G4*2 G4*2 D4*2', bass: 'Bb2*8', groove: 'march' },
  { lead: 'F4*8', harm: 'D4*8', bass: 'F2*8', groove: 'march' },
  { lead: 'D5*2 F5*2 Bb5*4', harm: 'Bb4*2 D5*2 G5*4', bass: 'Bb2*4 F2*4', groove: 'march' },
  { lead: 'Bb5*2 C6*2 D6*2 C6*2', harm: 'G5*2 A5*2 Bb5*2 A5*2', bass: 'Bb2*8', groove: 'march' },
  { lead: 'Bb5*2 A5*2 G5*2 F5*2', harm: 'G5*2 F5*2 Eb5*2 D5*2', bass: 'Eb2*4 Bb2*4', groove: 'march' },
  { lead: 'G5*4 F5*4', harm: 'Eb5*4 D5*4', bass: 'F2*8', groove: 'march' },
  { lead: 'Eb5*2 F5*2 D5*2 Bb4*2', harm: 'C5*2 D5*2 Bb4*2 G4*2', bass: 'Bb2*4 G2*4', groove: 'march' },
  { lead: 'C5*8', harm: 'A4*8', bass: 'C3*4 F2*4', groove: 'march' },
  { lead: 'D5*2 F5*2 Bb5*4', harm: 'Bb4*2 D5*2 G5*4', bass: 'Bb2*8', groove: 'march' },
  { lead: 'Bb5*2 C6*2 D6*2 Eb6*2', harm: 'G5*2 A5*2 Bb5*2 C6*2', bass: 'Bb2*4 Eb2*4', groove: 'march' },
  { lead: 'F6*2 D6*2 Bb5*2 F5*2', harm: 'D6*2 Bb5*2 G5*2 D5*2', bass: 'Bb2*4 F2*4', groove: 'march' },
  { lead: 'G5*4 F5*4', harm: 'Eb5*4 D5*4', bass: 'F2*8', groove: 'march' },
  { lead: 'Eb5*2 F5*2 Bb5*4', harm: 'C5*2 D5*2 G5*4', bass: 'Eb2*4 Bb2*4', groove: 'march' },
  { lead: 'A5*4 Bb5*4', harm: 'F5*4 G5*4', bass: 'F2*4 Bb2*4', groove: 'march' },
  { lead: 'D5*2 F5*2 G5*4', harm: 'Bb4*2 D5*2 Eb5*4', bass: 'Bb2*8', groove: 'march' },
  { lead: 'A5*2 Bb5*2 C6*2 Bb5*2', harm: 'F5*2 G5*2 A5*2 G5*2', bass: 'Eb2*4 F2*4', groove: 'march' },
  { lead: 'A5*2 G5*2 F5*4', harm: 'F5*2 Eb5*2 D5*4', bass: 'Bb2*8', groove: 'march' },
  { lead: 'G5*2 A5*2 Bb5*4', harm: 'Eb5*2 F5*2 G5*4', bass: 'Eb2*4 Bb2*4', groove: 'march' },
  { lead: 'A5*2 G5*2 F5*2 Eb5*2', harm: 'F5*2 Eb5*2 D5*2 C5*2', bass: 'F2*8', groove: 'march' },
  { lead: 'D5*2 Eb5*2 F5*4', harm: 'Bb4*2 C5*2 D5*4', bass: 'Bb2*4 Eb2*4', groove: 'march' },
  { lead: 'G5*2 F5*2 Eb5*2 D5*2', harm: 'Eb5*2 D5*2 C5*2 Bb4*2', bass: 'F2*8', groove: 'march' },
  { lead: 'C5*4 Bb4*4', harm: 'A4*4 G4*4', bass: 'F2*4 Bb2*4', groove: 'march' },
  { lead: 'Bb4*2 D5*2 F5*4', harm: 'G4*2 Bb4*2 D5*4', bass: 'Bb2*8', groove: 'march' },
  { lead: 'Bb4*8', harm: 'G4*8', bass: 'Bb2*8', groove: 'march' },
];

const TETRIS_A: readonly Bar[] = [
  { lead: 'E5*2 B4 C5 D5*2 C5 B4', harm: 'A4 . E5 . C5 . E5 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'A4*2 A4 C5 E5*2 D5 C5', harm: 'A4 . C5 . E5 . C5 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'B4*3 C5 D5*2 E5*2', harm: 'B4*2 G#5*2 E5*2 B4*2', bass: 'E2*2 B2*2 E2*2 B2*2', groove: 'tetris' },
  { lead: 'C5*2 A4*2 A4*4', harm: 'A4 . E5 . C5 . A4 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'E5*2 B4 C5 D5*2 C5 B4', harm: 'A4 . E5 . C5 . E5 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'A4*2 A4 C5 E5*2 D5 C5', harm: 'C5 . E5 . A4 . E5 .', bass: 'A2*2 C3*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'B4*3 C5 D5*2 E5*2', harm: 'B4*2 G#5*2 E5*2 B4*2', bass: 'E2*2 B2*2 E2*2 G#2*2', groove: 'tetris' },
  { lead: 'C5*2 A4*2 A4*4', harm: 'A4 . E5 . C5 . A4 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'D5*2 D5 F5 A5*2 G5 F5', harm: 'D5 . F5 . A5 . F5 .', bass: 'D2*2 A2*2 D2*2 A2*2', groove: 'tetris' },
  { lead: 'E5*3 C5 E5*2 D5 C5', harm: 'C5*2 E5*2 G5*2 E5*2', bass: 'C2*2 G2*2 C2*2 G2*2', groove: 'tetris' },
  { lead: 'B4*2 B4 C5 D5*2 E5*2', harm: 'G4 . B4 . D5 . B4 .', bass: 'G2*2 D2*2 G2*2 B2*2', groove: 'tetris' },
  { lead: 'C5*2 A4*2 A4*4', harm: 'A4 . E5 . C5 . A4 .', bass: 'A2*2 E2*2 A2*2 E2*2', groove: 'tetris' },
  { lead: 'D5*2 D5 F5 A5*2 G5 F5', harm: 'D5 . F5 . A5 . F5 .', bass: 'D2*2 A2*2 D2*2 A2*2', groove: 'tetris' },
  { lead: 'E5*3 C5 E5*2 D5 C5', harm: 'C5*2 E5*2 G5*2 E5*2', bass: 'C2*2 G2*2 C2*2 E2*2', groove: 'tetris' },
  { lead: 'B4*2 B4 C5 D5*2 E5*2', harm: 'B4 . G#5 . E5 . B4 .', bass: 'E2*2 B2*2 E2*2 G#2*2', groove: 'tetris' },
  { lead: 'C5*2 A4*2 A4*4', harm: 'A4 . E5 . C5 . A4 .', bass: 'A2*2 E2*2 A2*2 A2*2', groove: 'tetris' },
];

const WILY: readonly Bar[] = [
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5*2 . . . . .', harm: 'F4 Bb4*2 . . . . .', bass: 'Bb2 C2*2 . . . . .', groove: 'wily' },
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5 G4*2 C5*4', harm: 'F4 G4 D4*2 G4*4', bass: 'Bb2 C2 G2*2 C2*4', groove: 'wily', fill: true },
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5*2 . . . . .', harm: 'F4 Bb4*2 . . . . .', bass: 'Bb2 C2*2 . . . . .', groove: 'wily' },
  { lead: 'C5 C5 Eb5 F5 G5 Bb5 G5 F5', harm: 'G4 C5 G4 C5 G4 D5 Bb4 G4', bass: 'C2 C2 Eb2 F2 G2 Bb2 G2 F2', groove: 'wily' },
  { lead: 'Eb5*2 C5*6', harm: 'Bb4*2 G4*6', bass: 'Eb2*2 C2*6', groove: 'wily', fill: true },
  { lead: 'G5*2 F5 Eb5*2 C5*2 .', harm: 'Eb5*2 C5 G4*2 Eb4*2 .', bass: 'C2*2 G2*2 C2*2 G2*2', groove: 'wily' },
  { lead: 'Eb5*2 F5*2 G5*2 Bb5*2', harm: 'Bb4*2 C5*2 Eb5*2 G5*2', bass: 'Eb2*2 Bb2*2 Eb2*2 Bb2*2', groove: 'wily' },
  { lead: 'C6*4 Bb5*2 G5*2', harm: 'G5*4 F5*2 Eb5*2', bass: 'C2*2 G2*2 C2*2 G2*2', groove: 'wily' },
  { lead: 'F5*2 Eb5*2 C5*4', harm: 'C5*2 Bb4*2 G4*4', bass: 'F2*2 C2*2 F2*2 C2*2', groove: 'wily' },
  { lead: 'G5*2 F5 Eb5*2 C5*2 .', harm: 'Eb5*2 C5 G4*2 Eb4*2 .', bass: 'C2*2 G2*2 C2*2 G2*2', groove: 'wily' },
  { lead: 'Eb5*2 F5*2 G5*2 Bb5*2', harm: 'Bb4*2 C5*2 Eb5*2 G5*2', bass: 'Eb2*2 Bb2*2 Eb2*2 Bb2*2', groove: 'wily' },
  { lead: 'C6*6 Bb5*2', harm: 'G5*6 F5*2', bass: 'C2*2 G2*2 C2*4', groove: 'wily' },
  { lead: 'C5*8', harm: 'G4*8', bass: 'C2*8', groove: 'wily', fill: true },
  { lead: 'Eb5*2 F5 G5*2 F5 Eb5 C5', harm: 'Bb4*2 C5 Eb5*2 C5 Bb4 G4', bass: 'Eb2*2 Bb2*2 Eb2*2 Bb2*2', groove: 'wily' },
  { lead: 'G5*2 Bb5*2 C6*4', harm: 'Eb5*2 G5*2 G5*4', bass: 'C2*2 G2*2 C2*4', groove: 'wily' },
  { lead: 'Bb5*2 G5*2 F5*2 Eb5*2', harm: 'G5*2 Eb5*2 C5*2 Bb4*2', bass: 'Bb2*2 F2*2 Bb2*2 F2*2', groove: 'wily' },
  { lead: 'C5*4 G4*4', harm: 'G4*4 D4*4', bass: 'C2*4 G2*4', groove: 'wily' },
  { lead: 'Eb5*2 F5*2 G5*2 Bb5*2', harm: 'Bb4*2 C5*2 Eb5*2 G5*2', bass: 'Eb2*2 Bb2*2 Eb2*4', groove: 'wily' },
  { lead: 'C6*2 Bb5 G5*2 F5 Eb5 .', harm: 'G5*2 F5 Eb5*2 C5 Bb4 .', bass: 'C2*2 G2*2 F2*2 Eb2*2', groove: 'wily' },
  { lead: 'G5*2 F5 Eb5*2 D5*2 C5', harm: 'Eb5*2 C5 Bb4*2 G4*2 Eb4', bass: 'G2*2 F2 Eb2*2 D2*2 C2', groove: 'wily' },
  { lead: 'C5*8', harm: 'G4*8', bass: 'C2*8', groove: 'wily', fill: true },
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5*2 . . . . .', harm: 'F4 Bb4*2 . . . . .', bass: 'Bb2 C2*2 . . . . .', groove: 'wily' },
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5 G4*2 C5*4', harm: 'F4 G4 D4*2 G4*4', bass: 'Bb2 C2 G2*2 C2*4', groove: 'wily', fill: true },
  { lead: 'C5 C5 Eb5 F5 G5 F5 Eb5 C5', harm: 'G4 C5 G4 C5 G4 C5 G4 C5', bass: 'C2 C2 Eb2 F2 G2 F2 Eb2 C2', groove: 'wily' },
  { lead: 'Bb4 C5*2 . . . . .', harm: 'F4 Bb4*2 . . . . .', bass: 'Bb2 C2*2 . . . . .', groove: 'wily' },
  { lead: 'C5 C5 Eb5 F5 G5 Bb5 G5 F5', harm: 'G4 C5 G4 C5 G4 D5 Bb4 G4', bass: 'C2 C2 Eb2 F2 G2 Bb2 G2 F2', groove: 'wily' },
  { lead: 'Eb5*2 C5*6', harm: 'Bb4*2 G4*6', bass: 'Eb2*2 C2*6', groove: 'wily', fill: true },
];

function check(id: string, bars: readonly Bar[]): void {
  if (bars.length < 16 || bars.length > 32 || bars.length % 4 !== 0) {
    throw new Error(`${id} bar count ${bars.length}`);
  }
  for (const bar of bars) {
    if (!bar.lead || !bar.harm || !bar.bass) throw new Error(`${id} missing a part`);
  }
}

check('mario', MARIO);
check('zelda', ZELDA);
check('tetris', TETRIS_A);
check('wily', WILY);

export const BUILTIN_SONGS: readonly BuiltinSong[] = [
  song('builtin:mario', 'Super Mario Bros. Overworld', 180, 0.25, 0.5, MARIO),
  song('builtin:zelda', 'Zelda Overworld', 108, 0.5, 0.25, ZELDA),
  song('builtin:tetris', 'Tetris Korobeiniki Type A', 150, 0.25, 0.5, [...TETRIS_A, ...TETRIS_A]),
  song('builtin:wily', 'Mega Man 2 Wily Stage 1', 168, 0.5, 0.25, WILY),
];

export function builtinById(id: string): BuiltinSong | undefined {
  return BUILTIN_SONGS.find((entry) => entry.id === id);
}

export function isBuiltinId(id: string): boolean {
  return builtinById(id) !== undefined;
}
