export const MAX_CHANNELS = 6;
export const SOUNDING_CHANNELS = 4;
export const MIN_STEPS = 16;
export const MAX_STEPS = 64;
export const DEFAULT_STEPS = 16;
export const DEMO_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 300;
export const EMPTY = 255;
export const VOL_MAX = 15;
export const DRUM_NOTE = 60;

export const TYPE_OFF = 0;
export const TYPE_PULSE = 1;
export const TYPE_TRI = 2;
export const TYPE_NOISE = 3;

export const DRUM_KICK = 0;
export const DRUM_SNARE = 1;
export const DRUM_HAT = 2;
export const DRUM_SHORT = 3;
export const DRUM_LONG = 4;
export const DRUM_COUNT = 5;

const CELLS = MAX_CHANNELS * MAX_STEPS;
const GAIN = [0.22, 0.13, 0.26, 0.5, 0, 0];
const ATTACK_TAU = 0.004;
const RELEASE_TAU = 0.008;

export type Pattern = {
  steps: number;
  type: Uint8Array;
  duty: Float32Array;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
};

export type SynthState = {
  bpm: number;
  playing: number;
  startTime: number;
  steps: number;
  lastStep: number;
  type: Uint8Array;
  duty: Float32Array;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
  audible: Uint8Array;
  phase: Float32Array;
  age: Float32Array;
  amp: Float32Array;
  level: Float32Array;
  open: Uint8Array;
  holdUntil: Int32Array;
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
  steps: number;
  type: ArrayLike<number>;
  duty: ArrayLike<number>;
  note: ArrayLike<number>;
  length: ArrayLike<number>;
  volume: ArrayLike<number>;
  drum: ArrayLike<number>;
};

export type MixMsg = {
  kind: 'mix';
  mute: ArrayLike<number>;
  solo: ArrayLike<number>;
};

export type HitMsg = {
  kind: 'hit';
  channel: number;
  drum: number;
  volume: number;
};

export type WorkletMsg = TransportMsg | PatternMsg | MixMsg | HitMsg;

export type Capture = {
  bpm: number;
  playing: number;
  startTime: number;
  steps: number;
  type: ArrayLike<number>;
  duty: ArrayLike<number>;
  note: ArrayLike<number>;
  length: ArrayLike<number>;
  volume: ArrayLike<number>;
  drum: ArrayLike<number>;
  mute: ArrayLike<number>;
  solo: ArrayLike<number>;
};

export function cell(channel: number, step: number): number {
  return channel * MAX_STEPS + step;
}

export function clampBpm(bpm: number): number {
  if (!(bpm > 0) || Number.isNaN(bpm)) return DEMO_BPM;
  if (bpm < MIN_BPM) return MIN_BPM;
  if (bpm > MAX_BPM) return MAX_BPM;
  return bpm;
}

export function clampSteps(steps: number): number {
  if (!Number.isFinite(steps)) return DEFAULT_STEPS;
  const next = Math.round(steps);
  if (next < MIN_STEPS) return MIN_STEPS;
  if (next > MAX_STEPS) return MAX_STEPS;
  return next;
}

export function clampVol(volume: number): number {
  if (!Number.isFinite(volume)) return VOL_MAX;
  const next = Math.round(volume);
  if (next < 0) return 0;
  if (next > VOL_MAX) return VOL_MAX;
  return next;
}

export function clampDrum(drum: number): number {
  if (!Number.isFinite(drum)) return DRUM_KICK;
  const next = Math.round(drum);
  if (next < 0 || next >= DRUM_COUNT) return DRUM_KICK;
  return next;
}

export function createPattern(): Pattern {
  const note = new Uint8Array(CELLS);
  note.fill(EMPTY);
  const length = new Uint8Array(CELLS);
  length.fill(1);
  const volume = new Uint8Array(CELLS);
  volume.fill(VOL_MAX);
  return {
    steps: DEFAULT_STEPS,
    type: new Uint8Array(MAX_CHANNELS),
    duty: new Float32Array(MAX_CHANNELS),
    note,
    length,
    volume,
    drum: new Uint8Array(CELLS),
  };
}

export function createState(): SynthState {
  const note = new Uint8Array(CELLS);
  note.fill(EMPTY);
  const length = new Uint8Array(CELLS);
  length.fill(1);
  const volume = new Uint8Array(CELLS);
  volume.fill(VOL_MAX);
  const age = new Float32Array(MAX_CHANNELS);
  age.fill(1e3);
  const period = new Float32Array(MAX_CHANNELS);
  period.fill(1);
  const audible = new Uint8Array(MAX_CHANNELS);
  audible.fill(1);
  const holdUntil = new Int32Array(MAX_CHANNELS);
  holdUntil.fill(-1);
  return {
    bpm: DEMO_BPM,
    playing: 0,
    startTime: 0,
    steps: DEFAULT_STEPS,
    lastStep: -1,
    type: new Uint8Array(MAX_CHANNELS),
    duty: new Float32Array(MAX_CHANNELS),
    note,
    length,
    volume,
    drum: new Uint8Array(CELLS),
    audible,
    phase: new Float32Array(MAX_CHANNELS),
    age,
    amp: new Float32Array(MAX_CHANNELS),
    level: new Float32Array(MAX_CHANNELS),
    open: new Uint8Array(MAX_CHANNELS),
    holdUntil,
    lfsr: new Uint16Array(MAX_CHANNELS),
    lfsrCount: new Float32Array(MAX_CHANNELS),
    period,
    short: new Uint8Array(MAX_CHANNELS),
    drumCur: new Uint8Array(MAX_CHANNELS),
    freq: new Float32Array(MAX_CHANNELS),
  };
}

function putNotes(pattern: Pattern, channel: number, cells: readonly (number | null)[]): void {
  for (let step = 0; step < cells.length && step < pattern.steps; step++) {
    const index = cell(channel, step);
    const value = cells[step];
    if (value == null) {
      pattern.note[index] = EMPTY;
      continue;
    }
    pattern.note[index] = value;
    pattern.length[index] = 1;
    pattern.volume[index] = VOL_MAX;
  }
}

export function writeDemo(pattern: Pattern): void {
  pattern.steps = DEFAULT_STEPS;
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
  ]);

  putNotes(pattern, 1, [
    57, 60, 64, 60,
    55, 59, 62, 59,
    53, 57, 60, 57,
    52, 56, 59, 56,
  ]);

  putNotes(pattern, 2, [
    45, null, 45, null,
    43, null, 43, null,
    41, null, 41, null,
    40, null, 40, null,
  ]);

  const drums: readonly (number | null)[] = [
    DRUM_KICK, null, DRUM_HAT, null,
    DRUM_SNARE, null, DRUM_HAT, null,
    DRUM_KICK, null, DRUM_HAT, DRUM_HAT,
    DRUM_SNARE, null, DRUM_HAT, DRUM_HAT,
  ];
  for (let step = 0; step < drums.length; step++) {
    const index = cell(3, step);
    const value = drums[step];
    if (value == null) {
      pattern.note[index] = EMPTY;
      continue;
    }
    pattern.note[index] = DRUM_NOTE;
    pattern.length[index] = 1;
    pattern.volume[index] = VOL_MAX;
    pattern.drum[index] = value;
  }
}

export function stepSeconds(bpm: number): number {
  return 60 / clampBpm(bpm) / 4;
}

export function loopSeconds(bpm: number, loops = 1, steps = DEFAULT_STEPS): number {
  return stepSeconds(bpm) * clampSteps(steps) * loops;
}

export function absoluteStep(now: number, start: number, bpm: number): number {
  return Math.floor((now - start) / stepSeconds(bpm));
}

export function stepIndex(now: number, start: number, bpm: number, steps = DEFAULT_STEPS): number {
  const index = absoluteStep(now, start, bpm);
  if (index < 0) return -1;
  return index % clampSteps(steps);
}

export function rebaseStart(now: number, start: number, oldBpm: number, newBpm: number, steps = DEFAULT_STEPS): number {
  const position = (now - start) / stepSeconds(oldBpm);
  if (position < 0) return now;
  return now - (position % clampSteps(steps)) * stepSeconds(newBpm);
}

export function setTransport(state: SynthState, bpm: number, playing: number, startTime: number, reset: number): void {
  state.bpm = clampBpm(bpm);
  state.playing = playing ? 1 : 0;
  state.startTime = startTime;
  if (reset || !playing) {
    state.lastStep = -1;
    state.holdUntil.fill(-1);
    state.age.fill(1e3);
    state.amp.fill(0);
    state.open.fill(0);
  }
}

function copyCells(target: Uint8Array, source: ArrayLike<number>): void {
  const count = Math.min(target.length, source.length);
  for (let i = 0; i < count; i++) target[i] = source[i];
}

export function applyPattern(state: SynthState, pattern: Pattern): void {
  state.steps = clampSteps(pattern.steps);
  state.type.set(pattern.type);
  state.duty.set(pattern.duty);
  copyCells(state.note, pattern.note);
  copyCells(state.length, pattern.length);
  copyCells(state.volume, pattern.volume);
  copyCells(state.drum, pattern.drum);
}

export function applyMix(state: SynthState, mute: ArrayLike<number>, solo: ArrayLike<number>): void {
  let any = 0;
  for (let i = 0; i < MAX_CHANNELS; i++) if (solo[i]) any = 1;
  for (let i = 0; i < MAX_CHANNELS; i++) {
    const muted = mute[i] ? 1 : 0;
    const soloed = solo[i] ? 1 : 0;
    state.audible[i] = muted ? 0 : any && !soloed ? 0 : 1;
  }
}

export function applyMessage(state: SynthState, message: WorkletMsg): void {
  if (message.kind === 'transport') {
    setTransport(state, message.bpm, message.playing, message.startTime, message.reset);
    return;
  }
  if (message.kind === 'pattern') {
    state.steps = clampSteps(message.steps);
    copyCells(state.type, message.type);
    const dutyCount = Math.min(state.duty.length, message.duty.length);
    for (let i = 0; i < dutyCount; i++) state.duty[i] = message.duty[i];
    copyCells(state.note, message.note);
    copyCells(state.length, message.length);
    copyCells(state.volume, message.volume);
    copyCells(state.drum, message.drum);
    return;
  }
  if (message.kind === 'mix') {
    applyMix(state, message.mute, message.solo);
    return;
  }
  return;
}

export function capture(
  pattern: Pattern,
  bpm: number,
  playing: number,
  startTime: number,
  mute: ArrayLike<number>,
  solo: ArrayLike<number>,
): Capture {
  return {
    bpm: clampBpm(bpm),
    playing,
    startTime,
    steps: clampSteps(pattern.steps),
    type: pattern.type,
    duty: pattern.duty,
    note: pattern.note,
    length: pattern.length,
    volume: pattern.volume,
    drum: pattern.drum,
    mute,
    solo,
  };
}

export function applyCapture(state: SynthState, options: Capture): void {
  setTransport(state, options.bpm, options.playing, options.startTime, 1);
  state.steps = clampSteps(options.steps);
  copyCells(state.type, options.type);
  const dutyCount = Math.min(state.duty.length, options.duty.length);
  for (let i = 0; i < dutyCount; i++) state.duty[i] = options.duty[i];
  copyCells(state.note, options.note);
  copyCells(state.length, options.length);
  copyCells(state.volume, options.volume);
  copyCells(state.drum, options.drum);
  applyMix(state, options.mute, options.solo);
}

export function clockLfsr(reg: number, short: number): number {
  const other = short ? reg >> 6 : reg >> 1;
  const bit = (reg ^ other) & 1;
  return ((reg >> 1) | (bit << 14)) & 0x7fff;
}

function armDrum(state: SynthState, channel: number, drum: number, sampleRate: number): void {
  const kind = clampDrum(drum);
  state.drumCur[channel] = kind;
  if (kind === DRUM_HAT) {
    state.period[channel] = Math.max(1, sampleRate / 24000);
    state.short[channel] = 1;
    return;
  }
  if (kind === DRUM_SHORT) {
    state.period[channel] = Math.max(1, sampleRate / 14000);
    state.short[channel] = 1;
    return;
  }
  if (kind === DRUM_SNARE) {
    state.period[channel] = Math.max(1, sampleRate / 9000);
    state.short[channel] = 0;
    return;
  }
  if (kind === DRUM_LONG) {
    state.period[channel] = Math.max(1, sampleRate / 2800);
    state.short[channel] = 0;
    return;
  }
  state.period[channel] = Math.max(1, sampleRate / 3500);
  state.short[channel] = 0;
}

function startVoice(
  state: SynthState,
  channel: number,
  note: number,
  volume: number,
  drum: number,
  sampleRate: number,
): void {
  state.age[channel] = 0;
  state.phase[channel] = 0;
  state.amp[channel] = 0;
  state.open[channel] = 1;
  state.lfsr[channel] = 0x7fff;
  state.lfsrCount[channel] = 0;
  state.freq[channel] = 440 * Math.pow(2, (note - 69) / 12);
  state.level[channel] = (clampVol(volume) / VOL_MAX) * GAIN[channel];
  armDrum(state, channel, drum, sampleRate);
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
  if (kind === DRUM_HAT) return noiseBit(state, channel) * Math.exp(-age * 60) * 0.62;
  if (kind === DRUM_SHORT) return noiseBit(state, channel) * Math.exp(-age * 28) * 0.7;
  return noiseBit(state, channel) * Math.exp(-age * 4.5) * 0.66;
}

function channelSample(state: SynthState, channel: number, sampleRate: number): number {
  const type = state.type[channel];
  if (type === TYPE_OFF) return 0;
  const age = state.age[channel];
  if (type === TYPE_NOISE) {
    if (!state.open[channel] || age > 1.5) return 0;
    return noiseSample(state, channel, sampleRate, age) * state.level[channel];
  }
  if (!state.open[channel] && state.amp[channel] < 1e-4) return 0;
  let raw = 0;
  if (type === TYPE_PULSE) {
    const duty = state.duty[channel];
    state.phase[channel] += state.freq[channel] / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    raw = (state.phase[channel] < duty ? 1 : -1) - (duty * 2 - 1);
  } else if (type === TYPE_TRI) {
    state.phase[channel] += state.freq[channel] / sampleRate;
    if (state.phase[channel] >= 1) state.phase[channel] -= 1;
    const phase = state.phase[channel];
    raw = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  }
  const sustain = 0.78 + 0.22 * Math.exp(-Math.min(age, 8) * 3);
  const target = state.open[channel] ? state.level[channel] * sustain : 0;
  const tau = state.open[channel] ? ATTACK_TAU : RELEASE_TAU;
  const k = 1 - Math.exp(-(1 / sampleRate) / tau);
  state.amp[channel] += (target - state.amp[channel]) * k;
  return raw * state.amp[channel];
}

function onStep(state: SynthState, abs: number, sampleRate: number): void {
  const step = abs % state.steps;
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (state.type[channel] === TYPE_OFF) continue;
    const index = cell(channel, step);
    if (state.note[index] !== EMPTY) {
      const len = state.length[index] > 0 ? state.length[index] : 1;
      state.holdUntil[channel] = abs + len;
      startVoice(state, channel, state.note[index], state.volume[index], state.drum[index], sampleRate);
      continue;
    }
    if (abs >= state.holdUntil[channel]) {
      state.open[channel] = 0;
      if (state.type[channel] === TYPE_NOISE) state.age[channel] = 1e3;
    }
  }
}

export function hitChannel(
  state: SynthState,
  channel: number,
  drum: number,
  volume: number,
  sampleRate: number,
): void {
  if (channel < 0 || channel >= MAX_CHANNELS) return;
  if (state.type[channel] !== TYPE_NOISE) return;
  startVoice(state, channel, DRUM_NOTE, volume, drum, sampleRate);
  if (state.playing && state.lastStep >= 0) {
    const until = state.lastStep + 2;
    if (until > state.holdUntil[channel]) state.holdUntil[channel] = until;
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
  const stepDur = stepSeconds(state.bpm);
  for (let i = 0; i < frames; i++) {
    if (playing) {
      const abs = Math.floor((time + i * dt - state.startTime) / stepDur);
      if (abs !== state.lastStep) {
        state.lastStep = abs;
        if (abs >= 0 && state.steps > 0) onStep(state, abs, sampleRate);
      }
    }
    let mix = 0;
    for (let channel = 0; channel < MAX_CHANNELS; channel++) {
      if (state.type[channel] === TYPE_OFF) continue;
      const sample = channelSample(state, channel, sampleRate);
      if (state.audible[channel]) mix += sample;
      if (state.age[channel] < 10) state.age[channel] += dt;
    }
    mix *= 0.9;
    if (mix > 1) mix = 1;
    else if (mix < -1) mix = -1;
    left[i] = mix;
    if (stereo) right[i] = mix;
  }
}
