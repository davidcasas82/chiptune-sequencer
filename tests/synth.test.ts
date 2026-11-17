import engineSource from '../src/audio/engine.ts?raw';
import processorSource from '../src/audio/processor.ts?raw';
import synthSource from '../src/audio/synth.ts?raw';
import mainSource from '../src/main.ts?raw';
import { describe, expect, test } from 'vitest';
import {
  DEMO_BPM,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_SNARE,
  MAX_BPM,
  MAX_CHANNELS,
  MIN_BPM,
  SOUNDING_CHANNELS,
  STEP_COUNT,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  applyPattern,
  clampBpm,
  clockLfsr,
  createPattern,
  createState,
  encodeWav,
  loopSeconds,
  rebaseStart,
  renderBlock,
  setTransport,
  stepIndex,
  stepSeconds,
  toggleStep,
  writeDemo,
  type Pattern,
} from '../src/audio/synth';

function render(pattern: Pattern, frames: number, bpm: number, block: number, sampleRate = 44100): Float32Array[] {
  const state = createState();
  applyPattern(state, pattern);
  setTransport(state, bpm, 1, 0, 1);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let offset = 0; offset < frames;) {
    const count = Math.min(block, frames - offset);
    renderBlock(
      state,
      left.subarray(offset, offset + count),
      right.subarray(offset, offset + count),
      offset / sampleRate,
      sampleRate,
    );
    offset += count;
  }
  return [left, right];
}

function rms(buffer: Float32Array, from = 0, to = buffer.length): number {
  const count = to - from;
  if (count <= 0) return 0;
  let acc = 0;
  for (let i = from; i < to; i++) acc += buffer[i] * buffer[i];
  return Math.sqrt(acc / count);
}

function demo(): Pattern {
  const pattern = createPattern();
  writeDemo(pattern);
  return pattern;
}

describe('clock and pattern', () => {
  test('clamps tempo and keeps the step grid on the audio clock', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(301)).toBe(MAX_BPM);
    expect(clampBpm(Number.NaN)).toBe(DEMO_BPM);
    expect(stepSeconds(120)).toBeCloseTo(0.125);
    expect(stepIndex(0, 0, 120)).toBe(0);
    expect(stepIndex(0.125, 0, 120)).toBe(1);
    expect(stepIndex(2, 0, 120)).toBe(0);
    expect(stepIndex(0.01, 0.05, 120)).toBe(-1);
    expect(loopSeconds(120, 2)).toBeCloseTo(4);

    const now = 10 + 0.125 * 5 + 0.04;
    expect(stepIndex(now, 10, 120)).toBe(5);
    expect(stepIndex(now, rebaseStart(now, 10, 120, 180), 180)).toBe(5);
  });

  test('demo is four sounding channels with room for two more', () => {
    const pattern = demo();
    expect(MAX_CHANNELS).toBe(6);
    expect(SOUNDING_CHANNELS).toBe(4);
    expect(pattern.type[0]).toBe(TYPE_PULSE);
    expect(pattern.type[1]).toBe(TYPE_PULSE);
    expect(pattern.duty[0]).toBeCloseTo(0.25);
    expect(pattern.duty[1]).toBeCloseTo(0.5);
    expect(pattern.type[2]).toBe(TYPE_TRI);
    expect(pattern.type[3]).toBe(TYPE_NOISE);
    expect(pattern.type[4]).toBe(TYPE_OFF);
    expect(pattern.type[5]).toBe(TYPE_OFF);
    for (let channel = 0; channel < SOUNDING_CHANNELS; channel++) {
      let gates = 0;
      for (let step = 0; step < STEP_COUNT; step++) gates += pattern.gate[channel * STEP_COUNT + step];
      expect(gates).toBeGreaterThan(0);
    }
    const drums = new Set<number>();
    for (let step = 0; step < STEP_COUNT; step++) {
      if (pattern.gate[3 * STEP_COUNT + step]) drums.add(pattern.drum[3 * STEP_COUNT + step]);
    }
    expect(drums.has(DRUM_KICK)).toBe(true);
    expect(drums.has(DRUM_SNARE)).toBe(true);
    expect(drums.has(DRUM_HAT)).toBe(true);
  });

  test('toggles a step without dropping its note', () => {
    const pattern = demo();
    const index = 1;
    const note = pattern.note[index];
    const before = pattern.gate[index];
    toggleStep(pattern, 0, 1);
    expect(pattern.gate[index]).toBe(before ? 0 : 1);
    expect(pattern.note[index]).toBe(note);
    toggleStep(pattern, 0, 1);
    expect(pattern.gate[index]).toBe(before);
  });

  test('lfsr short mode cycles sooner than long mode and stays in 15 bits', () => {
    function cycle(short: number): number {
      let reg = 0x7fff;
      const seen = new Set<number>();
      for (let i = 0; i < 40000; i++) {
        reg = clockLfsr(reg, short);
        expect(reg).toBeGreaterThan(0);
        expect(reg).toBeLessThanOrEqual(0x7fff);
        if (seen.has(reg)) return i + 1;
        seen.add(reg);
      }
      return 0;
    }
    const long = cycle(0);
    const short = cycle(1);
    expect(long).toBeGreaterThan(1000);
    expect(short).toBeGreaterThan(1);
    expect(short).toBeLessThan(long);
  });
});

describe('render', () => {
  test('stopped playback and spare channels stay silent', () => {
    const state = createState();
    const buffers = state.type;
    applyPattern(state, demo());
    setTransport(state, 120, 0, 0, 1);
    const left = new Float32Array(256);
    renderBlock(state, left, left, 0, 44100);
    expect(left.every((sample) => sample === 0)).toBe(true);
    expect(state.type).toBe(buffers);

    const spare = demo();
    for (let channel = 0; channel < SOUNDING_CHANNELS; channel++) spare.type[channel] = TYPE_OFF;
    for (let step = 0; step < STEP_COUNT; step++) {
      spare.gate[4 * STEP_COUNT + step] = 1;
      spare.gate[5 * STEP_COUNT + step] = 1;
      spare.note[4 * STEP_COUNT + step] = 60;
      spare.note[5 * STEP_COUNT + step] = 60;
    }
    const [silent] = render(spare, 44100, 120, 128);
    expect(silent.every((sample) => sample === 0)).toBe(true);
  });

  test('demo loop is finite, stereo, and block-size independent', () => {
    const pattern = demo();
    const frames = 44100 * 2;
    const [chunked, chunkedRight] = render(pattern, frames, 120, 128);
    const [whole, wholeRight] = render(pattern, frames, 120, frames);
    let peak = 0;
    let diff = 0;
    for (let i = 0; i < frames; i++) {
      expect(Number.isFinite(chunked[i])).toBe(true);
      peak = Math.max(peak, Math.abs(chunked[i]));
      diff = Math.max(diff, Math.abs(chunked[i] - whole[i]), Math.abs(chunkedRight[i] - wholeRight[i]));
      expect(chunked[i]).toBe(chunkedRight[i]);
    }
    expect(rms(chunked)).toBeGreaterThan(0.02);
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.1);
    expect(diff).toBe(0);

    for (let channel = 0; channel < SOUNDING_CHANNELS; channel++) {
      const solo = demo();
      for (let other = 0; other < MAX_CHANNELS; other++) {
        if (other !== channel) solo.type[other] = TYPE_OFF;
      }
      const [buffer] = render(solo, 44100, 120, 128);
      expect(rms(buffer)).toBeGreaterThan(0.005);
    }
  });

  test('hat dies before the kick', () => {
    function windows(kind: number): { early: number; late: number } {
      const pattern = createPattern();
      pattern.type[3] = TYPE_NOISE;
      pattern.gate[3 * STEP_COUNT] = 1;
      pattern.drum[3 * STEP_COUNT] = kind;
      const sampleRate = 44100;
      const [buffer] = render(pattern, Math.floor(sampleRate * 0.25), 40, 128, sampleRate);
      return {
        early: rms(buffer, 0, Math.floor(sampleRate * 0.03)),
        late: rms(buffer, Math.floor(sampleRate * 0.12), Math.floor(sampleRate * 0.22)),
      };
    }
    const kick = windows(DRUM_KICK);
    const hat = windows(DRUM_HAT);
    expect(kick.early).toBeGreaterThan(0.02);
    expect(hat.early).toBeGreaterThan(0.01);
    expect(hat.late).toBeLessThan(0.015);
    expect(kick.late).toBeGreaterThan(hat.late * 3);
  });

  test('encodes a stereo wav', () => {
    const left = new Float32Array([0, 0.5, -1]);
    const right = new Float32Array([0, -0.5, 1]);
    const wav = encodeWav(left, right, 44100);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(wav.length).toBe(44 + 12);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  test('the sequencer does not schedule notes with timers', () => {
    for (const text of [synthSource, engineSource, processorSource, mainSource]) {
      expect(text.includes('setTimeout')).toBe(false);
      expect(text.includes('setInterval')).toBe(false);
    }
  });
});
