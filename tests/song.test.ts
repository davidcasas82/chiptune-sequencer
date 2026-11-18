import { describe, expect, test } from 'vitest';
import { EMPTY, cell, createPattern, createState, applySong, renderBlock, TYPE_NOISE, TYPE_PULSE, TYPE_TRI } from '../src/audio/synth';
import { putNote } from '../src/audio/edit';
import {
  SCALE_CUSTOM,
  SCALE_MAJOR,
  applyArp,
  beginSong,
  clearPatternNotes,
  commitSong,
  createBlankSong,
  createSong,
  createSongHistory,
  duplicateNotes,
  fillSteps,
  humanize,
  inScale,
  cloneSong,
  followView,
  placeSong,
  randomizeNotes,
  sameSong,
  redoSong,
  scaleMask,
  setScale,
  snapNote,
  transposeNotes,
  undoSong,
  type Song,
} from '../src/audio/song';
import { cueSheet, guideCues, guideSeconds, guideSong } from '../src/audio/demo';
import { DRUM_NOTE, VOL_MAX } from '../src/audio/synth';

function onset(buffer: Float32Array, from = 0): number {
  for (let i = from; i < buffer.length; i++) {
    if (buffer[i] > 0.02 || buffer[i] < -0.02) return i;
  }
  return -1;
}

function renderSong(song: Song, seconds: number, bpm: number): Float32Array {
  const state = createState();
  applySong(state, {
    playSong: song.playSong,
    swing: song.swing,
    loopStart: song.loopStart,
    loopEnd: song.loopEnd,
    orderLen: song.orderLen,
    slot: song.current,
    count: song.count,
    orderPat: song.orderPat,
    orderRep: song.orderRep,
    orderTr: song.orderTr,
    patterns: song.patterns,
  });
  setTransport(state, bpm);
  const frames = Math.floor(44100 * seconds);
  const left = new Float32Array(frames);
  const block = 128;
  for (let offset = 0; offset < frames;) {
    const count = Math.min(block, frames - offset);
    renderBlock(state, left.subarray(offset, offset + count), left.subarray(offset, offset + count), offset / 44100, 44100);
    offset += count;
  }
  return left;
}

function setTransport(state: ReturnType<typeof createState>, bpm: number): void {
  state.bpm = bpm;
  state.playing = 1;
  state.startTime = 0;
  state.lastKey = -1;
}

describe('song clock', () => {
  test('chains patterns, repeats, and a transposed entry', () => {
    const song = createSong();
    song.playSong = 1;
    song.count = 2;
    song.orderLen = 3;
    song.loopStart = 0;
    song.loopEnd = 3;
    song.orderPat[0] = 0;
    song.orderRep[0] = 2;
    song.orderTr[0] = 0;
    song.orderPat[1] = 1;
    song.orderRep[1] = 1;
    song.orderTr[1] = 12;
    song.orderPat[2] = 0;
    song.patterns[0].steps = 16;
    song.patterns[1].steps = 16;
    const here = { index: 0, pat: 0, local: 0, tr: 0 };
    placeSong(song, 0, here);
    expect(here).toMatchObject({ index: 0, pat: 0, local: 0, tr: 0 });
    placeSong(song, 16, here);
    expect(here).toMatchObject({ index: 0, pat: 0, local: 0, tr: 0 });
    placeSong(song, 32, here);
    expect(here).toMatchObject({ index: 1, pat: 1, local: 0, tr: 12 });
    placeSong(song, 48, here);
    expect(here).toMatchObject({ index: 2, pat: 0, local: 0 });
    placeSong(song, 64, here);
    expect(here.index).toBe(0);
  });

  test('a loop point auditions one entry', () => {
    const song = createSong();
    song.playSong = 1;
    song.loopStart = 1;
    song.loopEnd = 2;
    const here = { index: 0, pat: 0, local: 0, tr: 0 };
    placeSong(song, 0, here);
    expect(here.index).toBe(1);
    expect(here.pat).toBe(song.orderPat[1]);
  });

  test('swing delays the offbeat and a transpose raises the second pattern', () => {
    function hat(swing: number): Song {
      const song = createSong();
      song.playSong = 0;
      song.swing = swing;
      song.patterns[0].type[0] = 0;
      song.patterns[0].type[1] = 0;
      song.patterns[0].type[2] = 0;
      song.patterns[0].type[3] = TYPE_NOISE;
      song.patterns[0].type[4] = 0;
      song.patterns[0].type[5] = 0;
      for (let step = 0; step < 16; step++) song.patterns[0].note[cell(3, step)] = 255;
      putNote(song.patterns[0], 3, 1, 1, DRUM_NOTE, VOL_MAX, 2);
      return song;
    }
    const straight = hat(50);
    const swung = hat(66);
    const straightOnset = onset(renderSong(straight, 0.4, 120));
    const swungOnset = onset(renderSong(swung, 0.4, 120));
    expect(straightOnset).toBeGreaterThan(5000);
    expect(straightOnset).toBeLessThan(6000);
    expect(swungOnset).toBeGreaterThan(straightOnset + 1000);

    const song = createSong();
    song.playSong = 1;
    song.count = 1;
    song.orderLen = 2;
    song.loopStart = 0;
    song.loopEnd = 2;
    song.orderPat[0] = 0;
    song.orderPat[1] = 0;
    song.orderRep[0] = 1;
    song.orderRep[1] = 1;
    song.orderTr[0] = 0;
    song.orderTr[1] = 12;
    song.patterns[0].type[0] = TYPE_PULSE;
    song.patterns[0].type[1] = 0;
    song.patterns[0].type[2] = 0;
    song.patterns[0].type[3] = 0;
    song.patterns[0].type[4] = 0;
    song.patterns[0].type[5] = 0;
    song.patterns[0].duty[0] = 0.5;
    for (let step = 0; step < 16; step++) song.patterns[0].note[cell(0, step)] = 255;
    putNote(song.patterns[0], 0, 0, 4, 60, VOL_MAX, 0);
    const heard = renderSong(song, 4, 120);
    const low = crossings(heard, 2000, 8000);
    const high = crossings(heard, 44100 * 2 + 2000, 44100 * 2 + 8000);
    expect(high).toBeGreaterThan(low * 1.7);
  });
});

function crossings(buffer: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i++) {
    const prev = buffer[i - 1];
    const next = buffer[i];
    if ((prev <= 0 && next > 0) || (prev >= 0 && next < 0)) count += 1;
  }
  return count;
}

describe('scale and edits', () => {
  test('snaps to the nearest scale tone, ties upward', () => {
    const mask = scaleMask(SCALE_MAJOR, 0);
    expect(snapNote(66, 0, mask)).toBe(67);
    expect(inScale(66, 0, mask)).toBe(false);
    expect(inScale(67, 0, mask)).toBe(true);
    expect(snapNote(64, 0, mask)).toBe(64);
    const song = createSong();
    putNote(song.patterns[0], 0, 0, 1, 66, 12, 0);
    setScale(song, SCALE_MAJOR);
    expect(song.patterns[0].note[cell(0, 0)]).toBe(67);
  });

  test('randomize, humanize, fill, and arp are undoable', () => {
    const song = createSong();
    song.scale = SCALE_MAJOR;
    const pattern = song.patterns[0];
    pattern.type[0] = TYPE_PULSE;
    for (let step = 0; step < 16; step++) pattern.note[cell(0, step)] = 255;
    putNote(pattern, 0, 0, 2, 60, 12, 0);
    putNote(pattern, 0, 4, 2, 64, 12, 0);
    const history = createSongHistory();
    beginSong(history, song);
    randomizeNotes(pattern, null, 0, scaleMask(SCALE_MAJOR, 0), () => 0.2);
    for (let step = 0; step < 16; step++) {
      const note = pattern.note[cell(0, step)];
      if (note === 255) continue;
      expect(inScale(note, 0, scaleMask(SCALE_MAJOR, 0))).toBe(true);
    }
    humanize(pattern, null, () => 0.9);
    expect(pattern.nudge[cell(0, 0)]).not.toBe(0);
    fillSteps(pattern, null, 0, scaleMask(SCALE_MAJOR, 0));
    expect(pattern.note[cell(0, 2)]).not.toBe(255);
    const chord = createPattern();
    chord.type[0] = TYPE_PULSE;
    chord.type[1] = TYPE_PULSE;
    chord.type[2] = TYPE_PULSE;
    putNote(chord, 0, 0, 1, 60, 12, 0);
    putNote(chord, 1, 0, 1, 64, 12, 0);
    putNote(chord, 2, 0, 1, 67, 12, 0);
    applyArp(chord, null);
    expect(chord.note[cell(0, 0)]).toBe(60);
    expect(chord.note[cell(0, 1)]).toBe(64);
    expect(chord.note[cell(0, 2)]).toBe(67);
    expect(chord.note[cell(1, 0)]).toBe(255);
    const single = createPattern();
    single.type[0] = TYPE_PULSE;
    putNote(single, 0, 0, 4, 60, 12, 0);
    applyArp(single, null);
    expect(single.stepArp[cell(0, 0)]).toBe(1);
    transposeNotes(pattern, null, 2, 0, scaleMask(SCALE_CUSTOM, scaleMask(SCALE_MAJOR, 0)));
    commitSong(history, song);
    expect(undoSong(history, song)).toBe(true);
    expect(song.patterns[0].note[cell(0, 0)]).toBe(60);
    expect(redoSong(history, song)).toBe(true);
  });

  test('clear pattern removes notes and undo puts them back', () => {
    const song = createSong();
    const pattern = song.patterns[0];
    expect(pattern.note.some((note) => note !== EMPTY)).toBe(true);
    const history = createSongHistory();
    beginSong(history, song);
    clearPatternNotes(pattern);
    commitSong(history, song);
    expect(pattern.note.every((note) => note === EMPTY)).toBe(true);
    expect(pattern.type[0]).toBe(TYPE_PULSE);
    expect(undoSong(history, song)).toBe(true);
    expect(song.patterns[0].note.some((note) => note !== EMPTY)).toBe(true);
  });

  test('a blank song is one empty pattern with the six voices', () => {
    const song = createBlankSong();
    expect(song.count).toBe(1);
    expect(song.orderLen).toBe(1);
    expect(song.patterns[0].note.every((note) => note === EMPTY)).toBe(true);
    expect(song.patterns[0].type[0]).toBe(TYPE_PULSE);
    expect(song.patterns[0].type[2]).toBe(TYPE_TRI);
    expect(song.patterns[0].type[3]).toBe(TYPE_NOISE);
    expect(song.patterns[0].duty[0]).toBe(0.5);
  });

  test('doubling one track leaves the other tracks in place', () => {
    const pattern = createPattern();
    pattern.type[0] = TYPE_PULSE;
    pattern.type[1] = TYPE_PULSE;
    putNote(pattern, 0, 0, 1, 60, 12, 0);
    putNote(pattern, 1, 0, 1, 48, 12, 0);
    duplicateNotes(pattern, { c0: 0, c1: 0, s0: 0, s1: pattern.steps - 1 });
    expect(pattern.steps).toBe(32);
    expect(pattern.note[cell(0, 0)]).toBe(60);
    expect(pattern.note[cell(0, 16)]).toBe(60);
    expect(pattern.note[cell(1, 0)]).toBe(48);
    expect(pattern.note[cell(1, 16)]).toBe(EMPTY);
  });
});

describe('guided demo', () => {
  test('the cue sheet is 20 to 30 seconds and names each feature', () => {
    expect(guideSeconds()).toBeGreaterThan(20);
    expect(guideSeconds()).toBeLessThan(30);
    const text = cueSheet();
    expect(text).toContain('Four voices, dry');
    expect(text).toContain('Second triangle');
    expect(text).toContain('Second noise');
    expect(text).toContain('Light delay');
    expect(text).toContain('Light bitcrush');
    expect(guideCues()).toHaveLength(5);
    const song = guideSong();
    expect(song.orderLen).toBe(3);
    expect(song.patterns[0].type[4]).toBe(0);
    expect(song.patterns[1].type[4]).toBe(2);
    expect(song.patterns[2].type[5]).toBe(3);
    expect(song.patterns[1].note[cell(4, 0)]).toBe(72);
    expect(song.patterns[2].note[cell(5, 1)]).not.toBe(255);
  });
});

describe('song follow', () => {
  test('points at the playing section and does not rewrite the song', () => {
    const song = createSong();
    song.playSong = 1;
    const before = cloneSong(song);
    const here = { index: -1, pat: 0, local: 0, tr: 0 };
    placeSong(song, 0, here);
    expect(followView(true, song.playSong, true, false, here.index)).toBe(0);
    expect(here).toMatchObject({ index: 0, pat: 0, local: 0 });
    placeSong(song, 16, here);
    expect(followView(true, song.playSong, true, false, here.index)).toBe(1);
    expect(here).toMatchObject({ index: 1, pat: 1, local: 0 });
    placeSong(song, 32, here);
    expect(followView(true, song.playSong, true, false, here.index)).toBe(2);
    expect(here).toMatchObject({ index: 2, pat: 0, local: 0 });
    expect(followView(false, 1, true, false, 1)).toBe(-1);
    expect(followView(true, 0, true, false, 1)).toBe(-1);
    expect(followView(true, 1, false, false, 1)).toBe(-1);
    expect(followView(true, 1, true, true, 1)).toBe(-1);
    expect(followView(true, 1, true, false, -1)).toBe(-1);
    expect(sameSong(song, before)).toBe(true);
  });
});
