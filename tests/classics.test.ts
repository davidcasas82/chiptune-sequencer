import { describe, expect, test } from 'vitest';
import { BUILTIN_SONGS } from '../src/audio/classics';
import { createEngine } from '../src/audio/engine';
import { applyProject, parseProject, stringifyProject, PROJECT_VERSION } from '../src/audio/project';
import { createSong, orderSteps } from '../src/audio/song';
import {
  EMPTY,
  TYPE_OFF,
  applySong,
  cell,
  createState,
  drumHits,
  renderBlock,
  stepSeconds,
} from '../src/audio/synth';

function energy(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function renderFrom(song: ReturnType<typeof createSong>, bpm: number, from: number, seconds: number): Float32Array {
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
  state.bpm = bpm;
  state.playing = 1;
  state.startTime = 0;
  state.lastKey = -1;
  const frames = Math.floor(44100 * seconds);
  const left = new Float32Array(frames);
  const block = 128;
  for (let offset = 0; offset < frames;) {
    const count = Math.min(block, frames - offset);
    const time = from + offset / 44100;
    renderBlock(state, left.subarray(offset, offset + count), left.subarray(offset, offset + count), time, 44100);
    offset += count;
  }
  return left;
}

describe('built-in songs', () => {
  test('four presets are compiled into the app', () => {
    expect(BUILTIN_SONGS.map((song) => song.name)).toEqual([
      'Super Mario Bros. Overworld',
      'Zelda Overworld',
      'Tetris Korobeiniki Type A',
      'Mega Man 2 Wily Stage 1',
    ]);
    expect(new Set(BUILTIN_SONGS.map((song) => song.id)).size).toBe(4);
  });

  test.each(BUILTIN_SONGS)('$name loads and plays', (preset) => {
    const text = stringifyProject(preset.file);
    const parsed = parseProject(text);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.v).toBe(PROJECT_VERSION);
    expect(parsed.v).toBe(1);
    expect(parsed.name).toBe(preset.name);

    const song = createSong();
    const applied = applyProject(parsed, song);
    expect(applied.bpm).toBe(parsed.bpm);
    expect(song.playSong).toBe(1);
    const seconds = orderSteps(song) * stepSeconds(applied.bpm);
    expect(seconds).toBeGreaterThanOrEqual(30);
    expect(seconds).toBeLessThanOrEqual(60);

    let lead = 0;
    let harm = 0;
    let bass = 0;
    let drums = 0;
    let stacked = 0;
    for (let index = 0; index < song.count; index++) {
      const pattern = song.patterns[index];
      expect(pattern.type[4]).toBe(TYPE_OFF);
      expect(pattern.type[5]).toBe(TYPE_OFF);
      expect(pattern.arp[0]).toBe(0);
      expect(pattern.arpRate[0]).toBe(0);
      for (let step = 0; step < pattern.steps; step++) {
        if (pattern.note[cell(0, step)] !== EMPTY) lead += 1;
        if (pattern.note[cell(1, step)] !== EMPTY) harm += 1;
        if (pattern.note[cell(2, step)] !== EMPTY) bass += 1;
        if (pattern.note[cell(3, step)] !== EMPTY) drums += 1;
        expect(pattern.note[cell(4, step)]).toBe(EMPTY);
        expect(pattern.note[cell(5, step)]).toBe(EMPTY);
        if (drumHits(pattern, cell(3, step)).length > 1) stacked += 1;
      }
    }
    expect(lead).toBeGreaterThan(16);
    expect(harm).toBeGreaterThan(16);
    expect(bass).toBeGreaterThan(16);
    expect(drums).toBeGreaterThan(16);
    expect(stacked).toBeGreaterThan(4);

    const engine = createEngine();
    engine.loadProject(parsed);
    expect(engine.title).toBe(preset.name);
    expect(engine.bpm).toBe(applied.bpm);
    const heard = renderFrom(engine.song, engine.bpm, 0, 1.2);
    expect(energy(heard)).toBeGreaterThan(0.02);
    let later = 0;
    for (let index = 0; index < engine.song.orderLen - 1; index++) {
      const pattern = engine.song.patterns[engine.song.orderPat[index] || 0];
      later += (pattern.steps > 0 ? pattern.steps : 1) * (engine.song.orderRep[index] > 0 ? engine.song.orderRep[index] : 1);
    }
    const tail = renderFrom(engine.song, engine.bpm, later * stepSeconds(engine.bpm), 0.4);
    expect(energy(tail)).toBeGreaterThan(0.02);
  });
});
