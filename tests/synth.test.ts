import editSource from '../src/audio/edit.ts?raw';
import engineSource from '../src/audio/engine.ts?raw';
import processorSource from '../src/audio/processor.ts?raw';
import synthSource from '../src/audio/synth.ts?raw';
import songSource from '../src/audio/song.ts?raw';
import demoSource from '../src/audio/demo.ts?raw';
import mainSource from '../src/main.ts?raw';
import editorSource from '../src/editor.ts?raw';
import inspectorSource from '../src/inspector.ts?raw';
import { describe, expect, test } from 'vitest';
import {
  ARP_DOWN,
  ARP_UP,
  DEMO_BPM,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_LONG,
  DRUM_SHORT,
  DRUM_SNARE,
  EMPTY,
  MAX_BPM,
  MAX_CHANNELS,
  MAX_STEPS,
  MIN_BPM,
  PRESET_HAT,
  PRESET_LEAD,
  SOUNDING_CHANNELS,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  VOL_MAX,
  WAVE_LEN,
  applyMix,
  applyPattern,
  applyPreset,
  cell,
  clampBpm,
  clampSteps,
  clockLfsr,
  clonePattern,
  createPattern,
  createState,
  hitChannel,
  loopSeconds,
  rebaseStart,
  renderBlock,
  samePattern,
  setTransport,
  stepIndex,
  stepSeconds,
  writeDemo,
  type Pattern,
  type SynthState,
} from '../src/audio/synth';
import { encodeWav } from '../src/audio/wav';

function render(
  pattern: Pattern,
  frames: number,
  bpm: number,
  block: number,
  sampleRate = 44100,
  mix?: (state: SynthState) => void,
): Float32Array[] {
  const state = createState();
  applyPattern(state, pattern);
  setTransport(state, bpm, 1, 0, 1);
  if (mix) mix(state);
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

function posFrac(buffer: Float32Array, from: number, to: number): number {
  let count = 0;
  const span = to - from;
  for (let i = from; i < to; i++) if (buffer[i] > 0.002) count += 1;
  return span ? count / span : 0;
}

function crossings(buffer: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i++) {
    const prev = buffer[i - 1];
    const next = buffer[i];
    if ((prev <= 0 && next > 0) || (prev >= 0 && next < 0)) count += 1;
  }
  return count;
}

function demo(): Pattern {
  const pattern = createPattern();
  writeDemo(pattern);
  return pattern;
}

function pulse(note: number, length: number, volume = VOL_MAX, steps = 16): Pattern {
  const pattern = createPattern();
  pattern.steps = steps;
  pattern.type[0] = TYPE_PULSE;
  pattern.duty[0] = 0.5;
  pattern.note[cell(0, 0)] = note;
  pattern.length[cell(0, 0)] = length;
  pattern.volume[cell(0, 0)] = volume;
  return pattern;
}

describe('clock and pattern', () => {
  test('clamps tempo and keeps the step grid on the audio clock', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(301)).toBe(MAX_BPM);
    expect(clampBpm(Number.NaN)).toBe(DEMO_BPM);
    expect(clampSteps(8)).toBe(16);
    expect(clampSteps(64)).toBe(MAX_STEPS);
    expect(clampSteps(80)).toBe(MAX_STEPS);
    expect(stepSeconds(120)).toBeCloseTo(0.125);
    expect(stepIndex(0, 0, 120, 16)).toBe(0);
    expect(stepIndex(0.125, 0, 120, 16)).toBe(1);
    expect(stepIndex(2, 0, 120, 16)).toBe(0);
    expect(stepIndex(2, 0, 120, 32)).toBe(16);
    expect(stepIndex(4, 0, 120, 32)).toBe(0);
    expect(stepIndex(0.01, 0.05, 120)).toBe(-1);
    expect(loopSeconds(120, 2)).toBeCloseTo(4);
    expect(loopSeconds(120, 1, 32)).toBeCloseTo(4);

    const now = 10 + 0.125 * 5 + 0.04;
    expect(stepIndex(now, 10, 120, 16)).toBe(5);
    expect(stepIndex(now, rebaseStart(now, 10, 120, 180, 16), 180, 16)).toBe(5);
  });

  test('demo is four sounding channels with room for two more', () => {
    const pattern = demo();
    expect(MAX_CHANNELS).toBe(6);
    expect(SOUNDING_CHANNELS).toBe(4);
    expect(pattern.steps).toBe(16);
    expect(pattern.type[0]).toBe(TYPE_PULSE);
    expect(pattern.type[1]).toBe(TYPE_PULSE);
    expect(pattern.duty[0]).toBeCloseTo(0.25);
    expect(pattern.duty[1]).toBeCloseTo(0.5);
    expect(pattern.type[2]).toBe(TYPE_TRI);
    expect(pattern.type[3]).toBe(TYPE_NOISE);
    expect(pattern.type[4]).toBe(TYPE_OFF);
    expect(pattern.type[5]).toBe(TYPE_OFF);
    for (let channel = 0; channel < SOUNDING_CHANNELS; channel++) {
      let notes = 0;
      for (let step = 0; step < pattern.steps; step++) {
        if (pattern.note[cell(channel, step)] !== EMPTY) notes += 1;
      }
      expect(notes).toBeGreaterThan(0);
    }
    const drums = new Set<number>();
    for (let step = 0; step < pattern.steps; step++) {
      if (pattern.note[cell(3, step)] !== EMPTY) drums.add(pattern.drum[cell(3, step)]);
    }
    expect(drums.has(DRUM_KICK)).toBe(true);
    expect(drums.has(DRUM_SNARE)).toBe(true);
    expect(drums.has(DRUM_HAT)).toBe(true);
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
    for (let step = 0; step < spare.steps; step++) {
      spare.note[cell(4, step)] = 60;
      spare.note[cell(5, step)] = 60;
      spare.length[cell(4, step)] = 1;
      spare.length[cell(5, step)] = 1;
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

  test('a longer note keeps sounding and a short one does not', () => {
    const sampleRate = 44100;
    const frames = Math.floor(sampleRate * 1.6);
    const held = pulse(69, 4, VOL_MAX, 16);
    const stab = pulse(69, 1, VOL_MAX, 16);
    const [long] = render(held, frames, 60, 128, sampleRate);
    const [short] = render(stab, frames, 60, 128, sampleRate);
    const during = [Math.floor(sampleRate * 0.5), Math.floor(sampleRate * 0.75)] as const;
    const after = [Math.floor(sampleRate * 1.2), Math.floor(sampleRate * 1.45)] as const;
    expect(rms(long, during[0], during[1])).toBeGreaterThan(0.05);
    expect(rms(short, during[0], during[1])).toBeLessThan(0.01);
    expect(rms(long, after[0], after[1])).toBeLessThan(0.01);
  });

  test('volume scales the note and a later step in a longer pattern is audible', () => {
    const loud = pulse(69, 2, VOL_MAX, 16);
    const quiet = pulse(69, 2, 4, 16);
    const frames = Math.floor(44100 * 0.4);
    const [loudBuf] = render(loud, frames, 60, 128);
    const [quietBuf] = render(quiet, frames, 60, 128);
    const from = Math.floor(44100 * 0.08);
    const to = Math.floor(44100 * 0.3);
    const ratio = rms(loudBuf, from, to) / rms(quietBuf, from, to);
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);

    const late = createPattern();
    late.steps = 32;
    late.type[0] = TYPE_PULSE;
    late.duty[0] = 0.5;
    late.note[cell(0, 16)] = 69;
    late.length[cell(0, 16)] = 1;
    late.volume[cell(0, 16)] = VOL_MAX;
    const sampleRate = 44100;
    const longFrames = Math.floor(sampleRate * 2.4);
    const [buffer] = render(late, longFrames, 120, 128, sampleRate);
    expect(rms(buffer, 0, sampleRate)).toBe(0);
    expect(rms(buffer, Math.floor(sampleRate * 2.02), Math.floor(sampleRate * 2.12))).toBeGreaterThan(0.02);
  });

  test('mute and solo change what is audible', () => {
    const pattern = demo();
    const frames = 44100;
    const [open] = render(pattern, frames, 120, 128);
    const [muted] = render(pattern, frames, 120, 128, 44100, (state) => {
      applyMix(state, [1, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]);
    });
    expect(rms(open)).toBeGreaterThan(0.02);
    expect(muted.every((sample) => sample === 0)).toBe(true);

    const [solo] = render(pattern, frames, 120, 128, 44100, (state) => {
      applyMix(state, [0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]);
    });
    const stripped = demo();
    for (let channel = 1; channel < MAX_CHANNELS; channel++) stripped.type[channel] = TYPE_OFF;
    const [only] = render(stripped, frames, 120, 128);
    let diff = 0;
    for (let i = 0; i < frames; i++) diff = Math.max(diff, Math.abs(solo[i] - only[i]));
    expect(diff).toBe(0);
    expect(rms(solo)).toBeGreaterThan(0.005);
  });

  test('hat dies before the kick, and long noise outlasts short noise', () => {
    function windows(kind: number): { early: number; late: number } {
      const pattern = createPattern();
      pattern.type[3] = TYPE_NOISE;
      const index = cell(3, 0);
      pattern.note[index] = 60;
      pattern.length[index] = 1;
      pattern.volume[index] = VOL_MAX;
      pattern.drum[index] = kind;
      const sampleRate = 44100;
      const [buffer] = render(pattern, Math.floor(sampleRate * 0.25), 40, 128, sampleRate);
      return {
        early: rms(buffer, 0, Math.floor(sampleRate * 0.03)),
        late: rms(buffer, Math.floor(sampleRate * 0.12), Math.floor(sampleRate * 0.22)),
      };
    }
    const kick = windows(DRUM_KICK);
    const hat = windows(DRUM_HAT);
    const short = windows(DRUM_SHORT);
    const long = windows(DRUM_LONG);
    expect(kick.early).toBeGreaterThan(0.02);
    expect(hat.early).toBeGreaterThan(0.01);
    expect(hat.late).toBeLessThan(0.015);
    expect(kick.late).toBeGreaterThan(hat.late * 3);
    expect(short.early).toBeGreaterThan(0.01);
    expect(long.early).toBeGreaterThan(0.01);
    expect(long.late).toBeGreaterThan(short.late * 3);
  });

  test('a drum hit sounds while the transport is stopped', () => {
    const state = createState();
    applyPattern(state, demo());
    setTransport(state, 120, 0, 0, 1);
    hitChannel(state, 3, DRUM_KICK, VOL_MAX, 44100);
    const left = new Float32Array(Math.floor(44100 * 0.05));
    renderBlock(state, left, left, 0, 44100);
    expect(rms(left)).toBeGreaterThan(0.02);
  });

  test('clearing the pattern silences the loop', () => {
    const pattern = demo();
    const [before] = render(pattern, 44100, 120, 128);
    for (let channel = 0; channel < SOUNDING_CHANNELS; channel++) {
      for (let step = 0; step < pattern.steps; step++) pattern.note[cell(channel, step)] = EMPTY;
    }
    const [after] = render(pattern, 44100, 120, 128);
    expect(rms(before)).toBeGreaterThan(0.02);
    expect(after.every((sample) => sample === 0)).toBe(true);
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
    for (const text of [synthSource, engineSource, processorSource, editSource, songSource, demoSource, editorSource, inspectorSource, mainSource]) {
      expect(text.includes('setTimeout')).toBe(false);
      expect(text.includes('setInterval')).toBe(false);
    }
  });
});

describe('instrument', () => {
  test('the demo loop sweeps pulse 1 and arpeggiates pulse 2', () => {
    const pattern = demo();
    expect(pattern.sweep[0]).toBeGreaterThan(1);
    expect(pattern.arp[1]).toBe(ARP_UP);
    expect(pattern.arpRate[1]).toBeGreaterThan(12);
    expect(pattern.noiseShort[DRUM_HAT]).toBe(1);
    expect(pattern.noiseShort[DRUM_KICK]).toBe(0);
    const copy = clonePattern(pattern);
    expect(samePattern(pattern, copy)).toBe(true);
    copy.pan[1] = -0.5;
    expect(samePattern(pattern, copy)).toBe(false);
  });

  test('duty, sweep, pitch, and arp are audible', () => {
    const sampleRate = 44100;
    const frames = Math.floor(sampleRate * 0.6);
    const narrow = pulse(69, 4);
    narrow.duty[0] = 0.125;
    const wide = pulse(69, 4);
    wide.duty[0] = 0.5;
    const from = Math.floor(sampleRate * 0.05);
    const to = Math.floor(sampleRate * 0.2);
    const [narrowBuf] = render(narrow, frames, 60, 128, sampleRate);
    const [wideBuf] = render(wide, frames, 60, 128, sampleRate);
    expect(posFrac(narrowBuf, from, to)).toBeLessThan(0.22);
    expect(posFrac(wideBuf, from, to)).toBeGreaterThan(0.4);

    const swept = pulse(69, 8);
    swept.duty[0] = 0.125;
    swept.sweep[0] = 3;
    const [sweptBuf] = render(swept, Math.floor(sampleRate), 60, 128, sampleRate);
    const early = posFrac(sweptBuf, Math.floor(sampleRate * 0.02), Math.floor(sampleRate * 0.06));
    const late = posFrac(sweptBuf, Math.floor(sampleRate * 0.4), Math.floor(sampleRate * 0.5));
    expect(late).toBeGreaterThan(early + 0.2);

    const bent = pulse(69, 4);
    bent.pitch[cell(0, 0)] = 128 + 12;
    const [bentBuf] = render(bent, frames, 60, 128, sampleRate);
    expect(crossings(bentBuf, from, to)).toBeGreaterThan(crossings(wideBuf, from, to) * 1.6);

    const arp = pulse(60, 8);
    arp.arp[0] = ARP_UP;
    arp.arpRate[0] = 12;
    const plain = pulse(60, 8);
    const span = Math.floor(sampleRate);
    const [arpBuf] = render(arp, span, 60, 128, sampleRate);
    const [plainBuf] = render(plain, span, 60, 128, sampleRate);
    const lo = Math.floor(sampleRate * 0.15);
    const hi = Math.floor(sampleRate * 0.9);
    expect(crossings(arpBuf, lo, hi)).toBeGreaterThan(crossings(plainBuf, lo, hi) * 1.15);

    const stepped = pulse(69, 4);
    stepped.duty[0] = 0.5;
    stepped.stepDuty[cell(0, 0)] = 0;
    const [stepBuf] = render(stepped, frames, 60, 128, sampleRate);
    expect(posFrac(stepBuf, from, to)).toBeLessThan(0.22);
  });

  test('pan, attack, vibrato, and volume move without a click', () => {
    const sampleRate = 44100;
    const frames = Math.floor(sampleRate * 0.35);
    const leftPattern = pulse(69, 4);
    leftPattern.pan[0] = -1;
    const [left, right] = render(leftPattern, frames, 60, 128, sampleRate);
    const from = Math.floor(sampleRate * 0.08);
    const to = Math.floor(sampleRate * 0.28);
    expect(rms(left, from, to)).toBeGreaterThan(rms(right, from, to) * 4);

    const slow = pulse(69, 4);
    slow.attack[0] = 0.25;
    const fast = pulse(69, 4);
    fast.attack[0] = 0.001;
    const [slowBuf] = render(slow, frames, 60, 128, sampleRate);
    const [fastBuf] = render(fast, frames, 60, 128, sampleRate);
    const onset = Math.floor(sampleRate * 0.02);
    expect(rms(slowBuf, 0, onset)).toBeLessThan(rms(fastBuf, 0, onset) * 0.45);

    const still = pulse(69, 4);
    const wobble = pulse(69, 4);
    wobble.vibDepth[0] = 0.8;
    wobble.vibRate[0] = 6;
    const [stillBuf] = render(still, frames, 60, 128, sampleRate);
    const [wobbleBuf] = render(wobble, frames, 60, 128, sampleRate);
    let diff = 0;
    for (let i = from; i < to; i++) diff = Math.max(diff, Math.abs(stillBuf[i] - wobbleBuf[i]));
    expect(diff).toBeGreaterThan(0.05);

    const state = createState();
    const pattern = pulse(69, 4);
    applyPattern(state, pattern);
    setTransport(state, 60, 1, 0, 1);
    const lead = Math.floor(sampleRate * 0.12);
    const heard = new Float32Array(lead);
    renderBlock(state, heard, heard, 0, sampleRate);
    const tail = rms(heard, lead - 128, lead);
    state.vol[0] = 0;
    const glide = new Float32Array(64);
    renderBlock(state, glide, glide, lead / sampleRate, sampleRate);
    expect(rms(glide)).toBeGreaterThan(tail * 0.35);
    const gone = new Float32Array(Math.floor(sampleRate * 0.2));
    renderBlock(state, gone, gone, (lead + 64) / sampleRate, sampleRate);
    expect(rms(gone, Math.floor(sampleRate * 0.12), gone.length)).toBeLessThan(0.01);
  });

  test('a drawn wavetable and a lead preset change the voice', () => {
    const sampleRate = 44100;
    const frames = Math.floor(sampleRate * 0.3);
    const drawn = createPattern();
    drawn.type[0] = TYPE_TRI;
    drawn.note[0] = 69;
    drawn.length[0] = 4;
    drawn.volume[0] = VOL_MAX;
    for (let i = 0; i < WAVE_LEN; i++) drawn.wave[i] = 0.8;
    const [buffer] = render(drawn, frames, 60, 128, sampleRate);
    let mean = 0;
    const from = Math.floor(sampleRate * 0.05);
    const to = Math.floor(sampleRate * 0.2);
    for (let i = from; i < to; i++) mean += buffer[i];
    expect(mean / (to - from)).toBeGreaterThan(0.02);

    const pattern = createPattern();
    applyPreset(pattern, 0, PRESET_LEAD);
    expect(pattern.duty[0]).toBeCloseTo(0.5);
    expect(pattern.vibDepth[0]).toBeGreaterThan(0);
    expect(pattern.arp[0]).toBe(0);
    applyPreset(pattern, 3, PRESET_HAT);
    expect(pattern.lfsr[3]).toBe(1);
    expect(pattern.sustain[3]).toBe(0);
    expect(pattern.noiseShort[DRUM_HAT]).toBe(1);
  });
});
