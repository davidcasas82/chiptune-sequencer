export const MAX_CHANNELS = 6;
export const SOUNDING_CHANNELS = 4;
export const STEP_COUNT = 16;
export const DEMO_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 300;

export const TYPE_OFF = 0;
export const TYPE_PULSE = 1;
export const TYPE_TRI = 2;
export const TYPE_NOISE = 3;

export const DRUM_KICK = 0;
export const DRUM_SNARE = 1;
export const DRUM_HAT = 2;

const GAIN = [0.22, 0.13, 0.26, 0.5, 0, 0];

export type Pattern = {
  type: Uint8Array;
  duty: Float32Array;
  gate: Uint8Array;
  note: Uint8Array;
  drum: Uint8Array;
};

export type SynthState = {
  bpm: number;
  playing: number;
  startTime: number;
  lastStep: number;
  type: Uint8Array;
  duty: Float32Array;
  gate: Uint8Array;
  note: Uint8Array;
  drum: Uint8Array;
  phase: Float32Array;
  age: Float32Array;
  lfsr: Uint16Array;
  lfsrCount: Float32Array;
  period: Float32Array;
  short: Uint8Array;
  drumCur: Uint8Array;
  freq: Float32Array;
};

export type TransportMsg = {
  kind: 'transport';
  bpm: number;
  playing: number;
  startTime: number;
  reset: number;
};

export type PatternMsg = {
  kind: 'pattern';
  type: ArrayLike<number>;
  duty: ArrayLike<number>;
  gate: ArrayLike<number>;
  note: ArrayLike<number>;
  drum: ArrayLike<number>;
};

export type WorkletMsg = TransportMsg | PatternMsg;

export type Capture = {
  bpm: number;
  playing: number;
  startTime: number;
  type: ArrayLike<number>;
  duty: ArrayLike<number>;
  gate: ArrayLike<number>;
  note: ArrayLike<number>;
  drum: ArrayLike<number>;
};

export function createPattern(): Pattern {
  return {
    type: new Uint8Array(MAX_CHANNELS),
    duty: new Float32Array(MAX_CHANNELS),
    gate: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
    note: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
    drum: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
  };
}

export function createState(): SynthState {
  const age = new Float32Array(MAX_CHANNELS);
  age.fill(1e3);
  const period = new Float32Array(MAX_CHANNELS);
  period.fill(1);
  return {
    bpm: DEMO_BPM,
    playing: 0,
    startTime: 0,
    lastStep: -1,
    type: new Uint8Array(MAX_CHANNELS),
    duty: new Float32Array(MAX_CHANNELS),
    gate: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
    note: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
    drum: new Uint8Array(MAX_CHANNELS * STEP_COUNT),
    phase: new Float32Array(MAX_CHANNELS),
    age,
    lfsr: new Uint16Array(MAX_CHANNELS),
    lfsrCount: new Float32Array(MAX_CHANNELS),
    period,
    short: new Uint8Array(MAX_CHANNELS),
    drumCur: new Uint8Array(MAX_CHANNELS),
    freq: new Float32Array(MAX_CHANNELS),
  };
}

function defaultDrum(step: number): number {
  if (step % 8 === 4) return DRUM_SNARE;
  if (step % 4 === 0) return DRUM_KICK;
  return DRUM_HAT;
}

function putNotes(pattern: Pattern, channel: number, cells: readonly (number | null)[], fallback: number): void {
  let last = fallback;
  for (let step = 0; step < STEP_COUNT; step++) {
    const value = cells[step];
    if (value != null) last = value;
    const index = channel * STEP_COUNT + step;
    pattern.note[index] = last;
    pattern.gate[index] = value != null ? 1 : 0;
  }
}

export function writeDemo(pattern: Pattern): void {
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.type[4] = TYPE_OFF;
  pattern.type[5] = TYPE_OFF;
  pattern.duty[0] = 0.25;
  pattern.duty[1] = 0.5;
  pattern.duty[2] = 0.5;
  pattern.duty[3] = 0.5;

  putNotes(pattern, 0, [
    76, null, 74, 72,
    74, null, 72, 71,
    72, null, 69, 67,
    69, null, 68, 69,
  ], 76);

  putNotes(pattern, 1, [
    57, 60, 64, 60,
    55, 59, 62, 59,
    53, 57, 60, 57,
    52, 56, 59, 56,
  ], 57);

  putNotes(pattern, 2, [
    45, null, 45, null,
    43, null, 43, null,
    41, null, 41, null,
    40, null, 40, null,
  ], 45);

  const drums: readonly (number | null)[] = [
    DRUM_KICK, null, DRUM_HAT, null,
    DRUM_SNARE, null, DRUM_HAT, null,
    DRUM_KICK, null, DRUM_HAT, DRUM_HAT,
    DRUM_SNARE, null, DRUM_HAT, DRUM_HAT,
  ];
  for (let step = 0; step < STEP_COUNT; step++) {
    const index = 3 * STEP_COUNT + step;
    const value = drums[step];
    pattern.gate[index] = value != null ? 1 : 0;
    pattern.drum[index] = value != null ? value : defaultDrum(step);
    pattern.note[index] = 60;
  }
}

export function toggleStep(pattern: Pattern, channel: number, step: number): void {
  const index = channel * STEP_COUNT + step;
  pattern.gate[index] = pattern.gate[index] ? 0 : 1;
}

export function clampBpm(bpm: number): number {
  if (!(bpm > 0) || Number.isNaN(bpm)) return DEMO_BPM;
  if (bpm < MIN_BPM) return MIN_BPM;
  if (bpm > MAX_BPM) return MAX_BPM;
  return bpm;
}

export function stepSeconds(bpm: number): number {
  return 60 / clampBpm(bpm) / 4;
}

export function loopSeconds(bpm: number, loops = 1): number {
  return stepSeconds(bpm) * STEP_COUNT * loops;
}

export function stepIndex(now: number, start: number, bpm: number): number {
  const index = Math.floor((now - start) / stepSeconds(bpm));
  if (index < 0) return -1;
  return index % STEP_COUNT;
}

export function rebaseStart(now: number, start: number, oldBpm: number, newBpm: number): number {
  const position = (now - start) / stepSeconds(oldBpm);
  if (position < 0) return now;
  return now - (position % STEP_COUNT) * stepSeconds(newBpm);
}

export function setTransport(state: SynthState, bpm: number, playing: number, startTime: number, reset: number): void {
  state.bpm = clampBpm(bpm);
  state.playing = playing ? 1 : 0;
  state.startTime = startTime;
  if (reset || !playing) state.lastStep = -1;
}

export function applyPattern(state: SynthState, pattern: Pattern): void {
  state.type.set(pattern.type);
  state.duty.set(pattern.duty);
  state.gate.set(pattern.gate);
  state.note.set(pattern.note);
  state.drum.set(pattern.drum);
}

export function applyMessage(state: SynthState, message: WorkletMsg): void {
  if (message.kind === 'transport') {
    setTransport(state, message.bpm, message.playing, message.startTime, message.reset);
    return;
  }
  state.type.set(message.type);
  state.duty.set(message.duty);
  state.gate.set(message.gate);
  state.note.set(message.note);
  state.drum.set(message.drum);
}

export function capture(pattern: Pattern, bpm: number, playing: number, startTime: number): Capture {
  return {
    bpm: clampBpm(bpm),
    playing,
    startTime,
    type: pattern.type,
    duty: pattern.duty,
    gate: pattern.gate,
    note: pattern.note,
    drum: pattern.drum,
  };
}

export function applyCapture(state: SynthState, options: Capture): void {
  setTransport(state, options.bpm, options.playing, options.startTime, 1);
  state.type.set(options.type);
  state.duty.set(options.duty);
  state.gate.set(options.gate);
  state.note.set(options.note);
  state.drum.set(options.drum);
}

export function clockLfsr(reg: number, short: number): number {
  const other = short ? reg >> 6 : reg >> 1;
  const bit = (reg ^ other) & 1;
  return ((reg >> 1) | (bit << 14)) & 0x7fff;
}

function noiseBit(state: SynthState, channel: number): number {
  state.lfsrCount[channel] -= 1;
  if (state.lfsrCount[channel] <= 0) {
    state.lfsrCount[channel] += state.period[channel];
    state.lfsr[channel] = clockLfsr(state.lfsr[channel] || 1, state.short[channel]);
  }
  return (state.lfsr[channel] & 1) ? 1 : -1;
}

function noiseSample(state: SynthState, channel: number, sampleRate: number, age: number): number {
  const kind = state.drumCur[channel];
  if (kind === DRUM_KICK) {
    const freq = 48 + 190 * Math.exp(-age * 28);
    state.phase[channel] += freq / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    const tone = state.phase[channel] < 0.5 ? 1 : -1;
    const noise = noiseBit(state, channel);
    const env = Math.exp(-age * 14);
    return (tone * 0.84 + noise * 0.16) * env;
  }
  if (kind === DRUM_SNARE) {
    const freq = 160 + 110 * Math.exp(-age * 30);
    state.phase[channel] += freq / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    const tone = state.phase[channel] < 0.5 ? 1 : -1;
    const noise = noiseBit(state, channel);
    return tone * Math.exp(-age * 36) * 0.42 + noise * Math.exp(-age * 12) * 0.72;
  }
  return noiseBit(state, channel) * Math.exp(-age * 60) * 0.62;
}

function channelSample(state: SynthState, channel: number, sampleRate: number): number {
  const age = state.age[channel];
  if (age > 1.5) return 0;
  const type = state.type[channel];
  if (type === TYPE_PULSE) {
    const duty = state.duty[channel];
    state.phase[channel] += state.freq[channel] / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    const raw = state.phase[channel] < duty ? 1 : -1;
    const centered = raw - (duty * 2 - 1);
    const attack = age < 0.003 ? age / 0.003 : 1;
    return centered * attack * Math.exp(-age * 11) * GAIN[channel];
  }
  if (type === TYPE_TRI) {
    state.phase[channel] += state.freq[channel] / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    const phase = state.phase[channel];
    const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
    const attack = age < 0.004 ? age / 0.004 : 1;
    return tri * attack * Math.exp(-age * 3.4) * GAIN[channel];
  }
  if (type === TYPE_NOISE) return noiseSample(state, channel, sampleRate, age) * GAIN[channel];
  return 0;
}

function trigger(state: SynthState, step: number, sampleRate: number): void {
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (state.type[channel] === TYPE_OFF) continue;
    const index = channel * STEP_COUNT + step;
    if (!state.gate[index]) {
      state.age[channel] = 1e3;
      continue;
    }
    state.age[channel] = 0;
    state.phase[channel] = 0;
    state.lfsr[channel] = 0x7fff;
    state.lfsrCount[channel] = 0;
    const note = state.note[index];
    state.freq[channel] = 440 * Math.pow(2, (note - 69) / 12);
    const drum = state.drum[index];
    state.drumCur[channel] = drum;
    if (state.type[channel] !== TYPE_NOISE) continue;
    if (drum === DRUM_HAT) {
      state.period[channel] = Math.max(1, sampleRate / 24000);
      state.short[channel] = 1;
    } else if (drum === DRUM_SNARE) {
      state.period[channel] = Math.max(1, sampleRate / 9000);
      state.short[channel] = 0;
    } else {
      state.period[channel] = Math.max(1, sampleRate / 3500);
      state.short[channel] = 0;
    }
  }
}

export function renderBlock(
  state: SynthState,
  left: Float32Array,
  right: Float32Array,
  time: number,
  sampleRate: number,
): void {
  const frames = left.length;
  const dt = 1 / sampleRate;
  const stereo = right !== left;
  const playing = state.playing;
  for (let i = 0; i < frames; i++) {
    if (!playing) {
      left[i] = 0;
      if (stereo) right[i] = 0;
      continue;
    }
    const step = stepIndex(time + i * dt, state.startTime, state.bpm);
    if (step !== state.lastStep) {
      state.lastStep = step;
      if (step >= 0) trigger(state, step, sampleRate);
    }
    let mix = 0;
    for (let channel = 0; channel < MAX_CHANNELS; channel++) {
      if (state.type[channel] === TYPE_OFF) continue;
      mix += channelSample(state, channel, sampleRate);
      state.age[channel] += dt;
    }
    mix *= 0.9;
    if (mix > 1) mix = 1;
    else if (mix < -1) mix = -1;
    left[i] = mix;
    if (stereo) right[i] = mix;
  }
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function toPcm(sample: number): number {
  const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
  return (clamped * 32767) | 0;
}

export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const dataBytes = frames * 4;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, toPcm(left[i]), true);
    view.setInt16(offset + 2, toPcm(right[i]), true);
    offset += 4;
  }
  return new Uint8Array(view.buffer);
}
