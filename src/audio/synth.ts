export const MAX_CHANNELS = 6;
export const SOUNDING_CHANNELS = 4;
export const MIN_STEPS = 16;
export const MAX_STEPS = 64;
export const DEFAULT_STEPS = 16;
export const MAX_PATTERNS = 8;
export const MAX_ORDER = 16;
export const SUB = 6;
export const SWING_STRAIGHT = 50;
export const DEMO_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 300;
export const EMPTY = 255;
export const VOL_MAX = 15;
export const DRUM_NOTE = 60;
export const WAVE_LEN = 32;
export const SCOPE_LEN = 256;
export const FX_INHERIT = 255;
export const PITCH_CENTER = 128;
export const LFSR_FOLLOW = 255;

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

export const ARP_OFF = 0;
export const ARP_UP = 1;
export const ARP_DOWN = 2;
export const ARP_UPDOWN = 3;
export const ARP_RANDOM = 4;

export const PRESET_LEAD = 0;
export const PRESET_BASS = 1;
export const PRESET_ARP = 2;
export const PRESET_KICK = 3;
export const PRESET_SNARE = 4;
export const PRESET_HAT = 5;
export const PRESET_COUNT = 6;
export const PRESET_NONE = 255;

export const DUTY_VALUE = [0.125, 0.25, 0.5, 0.75] as const;

const CELLS = MAX_CHANNELS * MAX_STEPS;
const GAIN = [0.22, 0.13, 0.26, 0.5, 0.2, 0.32];
export const DELAY_LEN = 8192;
const SMOOTH = 0.008;
const DUTY_LUT = new Float32Array(DUTY_VALUE);
const ARP_LEN = new Uint8Array([0, 3, 3, 4, 3]);
const ARP_SEQ = new Int8Array([
  0, 0, 0, 0,
  0, 4, 7, 0,
  7, 4, 0, 0,
  0, 4, 7, 4,
  0, 4, 7, 0,
]);

const FACTORY_SHORT = new Uint8Array([0, 0, 1, 1, 0]);
const FACTORY_HZ = new Float32Array([3500, 9000, 24000, 14000, 2800]);
const FACTORY_DECAY = new Float32Array([14, 12, 60, 28, 4.5]);
const FACTORY_GAIN = new Float32Array([0.16, 0.72, 0.62, 0.7, 0.66]);
const FACTORY_TONE = new Float32Array([1, 1, 0, 0, 0]);
const FACTORY_TONE_DECAY = new Float32Array([14, 36, 1, 1, 1]);
const FACTORY_TONE_GAIN = new Float32Array([0.84, 0.42, 0, 0, 0]);
const FACTORY_DROP = new Float32Array([28, 30, 0, 0, 0]);
const FACTORY_BASE = new Float32Array([48, 160, 0, 0, 0]);
const FACTORY_START = new Float32Array([190, 110, 0, 0, 0]);

const PRESET_DUTY = new Float32Array([0.5, 0.125, 0.25, 0, 0, 0]);
const PRESET_ATTACK = new Float32Array([0.01, 0.005, 0.004, 0.001, 0.001, 0.001]);
const PRESET_DECAY = new Float32Array([0.2, 0.08, 0.05, 0.14, 0.08, 0.02]);
const PRESET_SUSTAIN = new Float32Array([0.7, 1, 0.6, 0, 0, 0]);
const PRESET_RELEASE = new Float32Array([0.1, 0.05, 0.04, 0.03, 0.04, 0.015]);
const PRESET_VIB = new Float32Array([0.2, 0, 0, 0, 0, 0]);
const PRESET_VIB_RATE = new Float32Array([5.5, 5, 5, 5, 5, 5]);
const PRESET_ARP_KIND = new Uint8Array([ARP_OFF, ARP_OFF, ARP_UP, ARP_OFF, ARP_OFF, ARP_OFF]);
const PRESET_ARP_RATE = new Float32Array([0, 0, 12.5, 0, 0, 0]);
const PRESET_VOL = new Float32Array([0.85, 1, 0.8, 1, 1, 0.9]);

export type Pattern = {
  steps: number;
  type: Uint8Array;
  duty: Float32Array;
  note: Uint8Array;
  length: Uint8Array;
  volume: Uint8Array;
  drum: Uint8Array;
  pitch: Uint8Array;
  stepDuty: Uint8Array;
  stepArp: Uint8Array;
  nudge: Int8Array;
  vol: Float32Array;
  pan: Float32Array;
  attack: Float32Array;
  decay: Float32Array;
  sustain: Float32Array;
  release: Float32Array;
  vibDepth: Float32Array;
  vibRate: Float32Array;
  slide: Float32Array;
  arpRate: Float32Array;
  arp: Uint8Array;
  preset: Uint8Array;
  sweep: Float32Array;
  lfsr: Uint8Array;
  wave: Float32Array;
  drumMask: Uint8Array;
  noiseShort: Uint8Array;
  noiseHz: Float32Array;
  noiseDecay: Float32Array;
  noiseGain: Float32Array;
  noiseTone: Float32Array;
  noiseToneDecay: Float32Array;
  noiseToneGain: Float32Array;
  noiseDrop: Float32Array;
  noiseBase: Float32Array;
  noiseStart: Float32Array;
};

export type Place = {
  index: number;
  pat: number;
  local: number;
  tr: number;
};

export type SynthState = Pattern & {
  bpm: number;
  playing: number;
  startTime: number;
  lastStep: number;
  audible: Uint8Array;
  phase: Float32Array;
  age: Float32Array;
  level: Float32Array;
  open: Uint8Array;
  holdUntil: Int32Array;
  lfsrReg: Uint16Array;
  lfsrCount: Float32Array;
  period: Float32Array;
  short: Uint8Array;
  drumCur: Uint8Array;
  xPeriod: Float32Array;
  xLfsr: Uint16Array;
  xCount: Float32Array;
  xShort: Uint8Array;
  xPhase: Float32Array;
  freq: Float32Array;
  env: Float32Array;
  envStage: Uint8Array;
  origin: Int8Array;
  baseMidi: Float32Array;
  glide: Float32Array;
  vibPhase: Float32Array;
  arpPhase: Float32Array;
  arpTick: Int32Array;
  arpOff: Int8Array;
  rng: Uint32Array;
  dutyNow: Float32Array;
  volNow: Float32Array;
  panNow: Float32Array;
  waveNow: Float32Array;
  peak: Float32Array;
  scope: Float32Array | null;
  scopeWrite: Int32Array | null;
  scopeDiv: number;
  delay: number;
  crush: number;
  delayNow: number;
  crushNow: number;
  delayPos: number;
  delayL: Float32Array;
  delayR: Float32Array;
  crushL: number;
  crushR: number;
  crushPhase: number;
  bank: Pattern[];
  slot: number;
  bound: number;
  playSong: number;
  swing: number;
  orderLen: number;
  orderPat: Uint8Array;
  orderRep: Uint8Array;
  orderTr: Int8Array;
  loopStart: number;
  loopEnd: number;
  lastKey: number;
  here: Place;
  ahead: Place;
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
  index: number;
} & Pattern;

export type SongBoot = {
  playSong: number;
  swing: number;
  loopStart: number;
  loopEnd: number;
  orderLen: number;
  slot: number;
  count: number;
  orderPat: ArrayLike<number>;
  orderRep: ArrayLike<number>;
  orderTr: ArrayLike<number>;
  patterns: Pattern[];
};

export type SongMsg = {
  kind: 'song';
  playSong: number;
  swing: number;
  loopStart: number;
  loopEnd: number;
  orderLen: number;
  slot: number;
  orderPat: ArrayLike<number>;
  orderRep: ArrayLike<number>;
  orderTr: ArrayLike<number>;
};

export type NoteMsg = {
  kind: 'note';
  channel: number;
  note: number;
  volume: number;
  down: number;
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

export type FxMsg = {
  kind: 'fx';
  delay: number;
  crush: number;
};

export type WorkletMsg = TransportMsg | PatternMsg | MixMsg | HitMsg | SongMsg | NoteMsg | FxMsg;

export type Capture = {
  bpm: number;
  playing: number;
  startTime: number;
  pattern: Pattern;
  mute: ArrayLike<number>;
  solo: ArrayLike<number>;
  scope: SharedArrayBuffer | null;
  song: SongBoot | null;
  delay: number;
  crush: number;
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

export function drumTrack(channel: number): boolean {
  return channel === 3 || channel === 5;
}

export function kitChannel(pattern: Pattern, channel: number): boolean {
  if (channel < 0 || channel >= MAX_CHANNELS) return false;
  if (drumTrack(channel)) return true;
  return pattern.type[channel] === TYPE_NOISE;
}

export function drumHits(pattern: Pattern, index: number): number[] {
  if (pattern.note[index] === EMPTY) return [];
  const primary = clampDrum(pattern.drum[index]);
  const hits = [primary];
  const mask = pattern.drumMask[index] || 0;
  for (let i = 0; i < DRUM_COUNT; i++) {
    if (i === primary) continue;
    if (mask & (1 << i)) hits.push(i);
  }
  return hits;
}

export function clampPitch(bend: number): number {
  if (!Number.isFinite(bend)) return 0;
  const next = Math.round(bend);
  if (next < -24) return -24;
  if (next > 24) return 24;
  return next;
}

export function fillTriangle(wave: Float32Array, channel: number): void {
  const base = channel * WAVE_LEN;
  for (let i = 0; i < WAVE_LEN; i++) {
    const v = i < 16 ? i : 31 - i;
    wave[base + i] = v / 7.5 - 1;
  }
}

function writeNoiseFactory(target: Pattern): void {
  target.noiseShort.set(FACTORY_SHORT);
  target.noiseHz.set(FACTORY_HZ);
  target.noiseDecay.set(FACTORY_DECAY);
  target.noiseGain.set(FACTORY_GAIN);
  target.noiseTone.set(FACTORY_TONE);
  target.noiseToneDecay.set(FACTORY_TONE_DECAY);
  target.noiseToneGain.set(FACTORY_TONE_GAIN);
  target.noiseDrop.set(FACTORY_DROP);
  target.noiseBase.set(FACTORY_BASE);
  target.noiseStart.set(FACTORY_START);
}

export function restoreNoise(pattern: Pattern, drum: number): void {
  const i = clampDrum(drum);
  pattern.noiseShort[i] = FACTORY_SHORT[i];
  pattern.noiseHz[i] = FACTORY_HZ[i];
  pattern.noiseDecay[i] = FACTORY_DECAY[i];
  pattern.noiseGain[i] = FACTORY_GAIN[i];
  pattern.noiseTone[i] = FACTORY_TONE[i];
  pattern.noiseToneDecay[i] = FACTORY_TONE_DECAY[i];
  pattern.noiseToneGain[i] = FACTORY_TONE_GAIN[i];
  pattern.noiseDrop[i] = FACTORY_DROP[i];
  pattern.noiseBase[i] = FACTORY_BASE[i];
  pattern.noiseStart[i] = FACTORY_START[i];
}

export function applyPreset(pattern: Pattern, channel: number, preset: number): void {
  if (channel < 0 || channel >= MAX_CHANNELS) return;
  if (preset < 0 || preset >= PRESET_COUNT) return;
  const duty = PRESET_DUTY[preset];
  if (duty > 0) pattern.duty[channel] = duty;
  pattern.attack[channel] = PRESET_ATTACK[preset];
  pattern.decay[channel] = PRESET_DECAY[preset];
  pattern.sustain[channel] = PRESET_SUSTAIN[preset];
  pattern.release[channel] = PRESET_RELEASE[preset];
  pattern.vibDepth[channel] = PRESET_VIB[preset];
  pattern.vibRate[channel] = PRESET_VIB_RATE[preset];
  pattern.slide[channel] = 0;
  pattern.sweep[channel] = 0;
  pattern.arp[channel] = PRESET_ARP_KIND[preset];
  pattern.arpRate[channel] = PRESET_ARP_RATE[preset];
  pattern.preset[channel] = preset;
  pattern.vol[channel] = PRESET_VOL[preset];
  if (preset < PRESET_KICK) return;
  const drum = preset - PRESET_KICK;
  restoreNoise(pattern, drum);
  pattern.lfsr[channel] = pattern.noiseShort[drum];
}

function voiceDefaults(pattern: Pattern): void {
  pattern.attack.fill(0.004);
  pattern.decay.fill(0.08);
  pattern.sustain.fill(1);
  pattern.release.fill(0.02);
  pattern.vol.fill(1);
  pattern.vibRate.fill(5);
  pattern.lfsr.fill(LFSR_FOLLOW);
  pattern.type[4] = TYPE_TRI;
  pattern.type[5] = TYPE_NOISE;
}

export function createPattern(): Pattern {
  const note = new Uint8Array(CELLS);
  note.fill(EMPTY);
  const length = new Uint8Array(CELLS);
  length.fill(1);
  const volume = new Uint8Array(CELLS);
  volume.fill(VOL_MAX);
  const pitch = new Uint8Array(CELLS);
  pitch.fill(PITCH_CENTER);
  const stepDuty = new Uint8Array(CELLS);
  stepDuty.fill(FX_INHERIT);
  const stepArp = new Uint8Array(CELLS);
  stepArp.fill(FX_INHERIT);
  const preset = new Uint8Array(MAX_CHANNELS);
  preset.fill(PRESET_NONE);
  const nudge = new Int8Array(CELLS);
  const pattern: Pattern = {
    steps: DEFAULT_STEPS,
    type: new Uint8Array(MAX_CHANNELS),
    duty: new Float32Array(MAX_CHANNELS),
    note,
    length,
    volume,
    drum: new Uint8Array(CELLS),
    pitch,
    stepDuty,
    stepArp,
    nudge,
    vol: new Float32Array(MAX_CHANNELS),
    pan: new Float32Array(MAX_CHANNELS),
    attack: new Float32Array(MAX_CHANNELS),
    decay: new Float32Array(MAX_CHANNELS),
    sustain: new Float32Array(MAX_CHANNELS),
    release: new Float32Array(MAX_CHANNELS),
    vibDepth: new Float32Array(MAX_CHANNELS),
    vibRate: new Float32Array(MAX_CHANNELS),
    slide: new Float32Array(MAX_CHANNELS),
    arpRate: new Float32Array(MAX_CHANNELS),
    arp: new Uint8Array(MAX_CHANNELS),
    preset,
    sweep: new Float32Array(MAX_CHANNELS),
    lfsr: new Uint8Array(MAX_CHANNELS),
    wave: new Float32Array(MAX_CHANNELS * WAVE_LEN),
    drumMask: new Uint8Array(CELLS),
    noiseShort: new Uint8Array(DRUM_COUNT),
    noiseHz: new Float32Array(DRUM_COUNT),
    noiseDecay: new Float32Array(DRUM_COUNT),
    noiseGain: new Float32Array(DRUM_COUNT),
    noiseTone: new Float32Array(DRUM_COUNT),
    noiseToneDecay: new Float32Array(DRUM_COUNT),
    noiseToneGain: new Float32Array(DRUM_COUNT),
    noiseDrop: new Float32Array(DRUM_COUNT),
    noiseBase: new Float32Array(DRUM_COUNT),
    noiseStart: new Float32Array(DRUM_COUNT),
  };
  voiceDefaults(pattern);
  writeNoiseFactory(pattern);
  for (let channel = 0; channel < MAX_CHANNELS; channel++) fillTriangle(pattern.wave, channel);
  return pattern;
}

export function copyPattern(from: Pattern, to: Pattern): void {
  to.steps = clampSteps(from.steps);
  to.type.set(from.type);
  to.duty.set(from.duty);
  to.note.set(from.note);
  to.length.set(from.length);
  to.volume.set(from.volume);
  to.drum.set(from.drum);
  to.pitch.set(from.pitch);
  to.stepDuty.set(from.stepDuty);
  to.stepArp.set(from.stepArp);
  to.nudge.set(from.nudge);
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
  if (from.drumMask) to.drumMask.set(from.drumMask);
  else to.drumMask.fill(0);
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

export function clonePattern(pattern: Pattern): Pattern {
  const next = createPattern();
  copyPattern(pattern, next);
  return next;
}

function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function samePattern(a: Pattern, b: Pattern): boolean {
  if (a.steps !== b.steps) return false;
  return sameBytes(a.type, b.type)
    && sameBytes(a.duty, b.duty)
    && sameBytes(a.note, b.note)
    && sameBytes(a.length, b.length)
    && sameBytes(a.volume, b.volume)
    && sameBytes(a.drum, b.drum)
    && sameBytes(a.pitch, b.pitch)
    && sameBytes(a.stepDuty, b.stepDuty)
    && sameBytes(a.stepArp, b.stepArp)
    && sameBytes(a.nudge, b.nudge)
    && sameBytes(a.vol, b.vol)
    && sameBytes(a.pan, b.pan)
    && sameBytes(a.attack, b.attack)
    && sameBytes(a.decay, b.decay)
    && sameBytes(a.sustain, b.sustain)
    && sameBytes(a.release, b.release)
    && sameBytes(a.vibDepth, b.vibDepth)
    && sameBytes(a.vibRate, b.vibRate)
    && sameBytes(a.slide, b.slide)
    && sameBytes(a.arpRate, b.arpRate)
    && sameBytes(a.arp, b.arp)
    && sameBytes(a.preset, b.preset)
    && sameBytes(a.sweep, b.sweep)
    && sameBytes(a.lfsr, b.lfsr)
    && sameBytes(a.wave, b.wave)
    && sameBytes(a.drumMask, b.drumMask)
    && sameBytes(a.noiseShort, b.noiseShort)
    && sameBytes(a.noiseHz, b.noiseHz)
    && sameBytes(a.noiseDecay, b.noiseDecay)
    && sameBytes(a.noiseGain, b.noiseGain)
    && sameBytes(a.noiseTone, b.noiseTone)
    && sameBytes(a.noiseToneDecay, b.noiseToneDecay)
    && sameBytes(a.noiseToneGain, b.noiseToneGain)
    && sameBytes(a.noiseDrop, b.noiseDrop)
    && sameBytes(a.noiseBase, b.noiseBase)
    && sameBytes(a.noiseStart, b.noiseStart);
}

export function createState(): SynthState {
  const pattern = createPattern();
  const bank: Pattern[] = [];
  for (let i = 0; i < MAX_PATTERNS; i++) bank.push(createPattern());
  const age = new Float32Array(MAX_CHANNELS);
  age.fill(1e3);
  const period = new Float32Array(MAX_CHANNELS);
  period.fill(1);
  const audible = new Uint8Array(MAX_CHANNELS);
  audible.fill(1);
  const holdUntil = new Int32Array(MAX_CHANNELS);
  holdUntil.fill(-1);
  const origin = new Int8Array(MAX_CHANNELS);
  origin.fill(-1);
  const glide = new Float32Array(MAX_CHANNELS);
  glide.fill(-1);
  const rng = new Uint32Array(MAX_CHANNELS);
  rng.fill(1);
  const orderRep = new Uint8Array(MAX_ORDER);
  orderRep.fill(1);
  const state: SynthState = {
    ...pattern,
    bank,
    slot: 0,
    bound: 0,
    playSong: 0,
    swing: SWING_STRAIGHT,
    orderLen: 1,
    orderPat: new Uint8Array(MAX_ORDER),
    orderRep,
    orderTr: new Int8Array(MAX_ORDER),
    loopStart: 0,
    loopEnd: 1,
    lastKey: -1,
    here: { index: -1, pat: 0, local: 0, tr: 0 },
    ahead: { index: -1, pat: 0, local: 0, tr: 0 },
    bpm: DEMO_BPM,
    playing: 0,
    startTime: 0,
    lastStep: -1,
    audible,
    phase: new Float32Array(MAX_CHANNELS),
    age,
    level: new Float32Array(MAX_CHANNELS),
    open: new Uint8Array(MAX_CHANNELS),
    holdUntil,
    lfsrReg: new Uint16Array(MAX_CHANNELS),
    lfsrCount: new Float32Array(MAX_CHANNELS),
    period,
    short: new Uint8Array(MAX_CHANNELS),
    drumCur: new Uint8Array(MAX_CHANNELS),
    xPeriod: new Float32Array(MAX_CHANNELS * DRUM_COUNT),
    xLfsr: new Uint16Array(MAX_CHANNELS * DRUM_COUNT),
    xCount: new Float32Array(MAX_CHANNELS * DRUM_COUNT),
    xShort: new Uint8Array(MAX_CHANNELS * DRUM_COUNT),
    xPhase: new Float32Array(MAX_CHANNELS * DRUM_COUNT),
    freq: new Float32Array(MAX_CHANNELS),
    env: new Float32Array(MAX_CHANNELS),
    envStage: new Uint8Array(MAX_CHANNELS),
    origin,
    baseMidi: new Float32Array(MAX_CHANNELS),
    glide,
    vibPhase: new Float32Array(MAX_CHANNELS),
    arpPhase: new Float32Array(MAX_CHANNELS),
    arpTick: new Int32Array(MAX_CHANNELS),
    arpOff: new Int8Array(MAX_CHANNELS),
    rng,
    dutyNow: new Float32Array(MAX_CHANNELS),
    volNow: new Float32Array(MAX_CHANNELS),
    panNow: new Float32Array(MAX_CHANNELS),
    waveNow: new Float32Array(MAX_CHANNELS * WAVE_LEN),
    peak: new Float32Array(MAX_CHANNELS),
    scope: null,
    scopeWrite: null,
    scopeDiv: 0,
    delay: 0,
    crush: 0,
    delayNow: 0,
    crushNow: 0,
    delayPos: 0,
    delayL: new Float32Array(DELAY_LEN),
    delayR: new Float32Array(DELAY_LEN),
    crushL: 0,
    crushR: 0,
    crushPhase: 0,
  };
  state.volNow.set(state.vol);
  state.waveNow.set(state.wave);
  state.dutyNow.set(state.duty);
  return state;
}

export function bindScope(state: SynthState, buffer: SharedArrayBuffer): void {
  state.scopeWrite = new Int32Array(buffer, 0, 1);
  state.scope = new Float32Array(buffer, 4, SCOPE_LEN);
  state.peak = new Float32Array(buffer, 4 + SCOPE_LEN * 4, MAX_CHANNELS);
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
  pattern.type[4] = TYPE_TRI;
  pattern.type[5] = TYPE_NOISE;
  pattern.duty[0] = 0.25;
  pattern.duty[1] = 0.5;
  pattern.duty[2] = 0.5;
  pattern.duty[3] = 0.5;
  pattern.duty[4] = 0.5;
  pattern.duty[5] = 0.5;
  pattern.sweep[0] = 3;
  pattern.arp[1] = ARP_UP;
  pattern.arpRate[1] = 24;
  pattern.pitch[cell(0, 2)] = PITCH_CENTER + 3;
  pattern.stepDuty[cell(0, 8)] = 2;

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

  putNotes(pattern, 4, [
    33, null, 33, null,
    31, null, 31, null,
    29, null, 29, null,
    28, null, 28, null,
  ]);

  for (let step = 1; step < pattern.steps; step += 2) {
    const index = cell(5, step);
    pattern.note[index] = DRUM_NOTE;
    pattern.length[index] = 1;
    pattern.volume[index] = VOL_MAX;
    pattern.drum[index] = DRUM_HAT;
  }
}

export function writeStarter(pattern: Pattern): void {
  pattern.steps = DEFAULT_STEPS;
  pattern.type[0] = TYPE_PULSE;
  pattern.type[1] = TYPE_PULSE;
  pattern.type[2] = TYPE_TRI;
  pattern.type[3] = TYPE_NOISE;
  pattern.type[4] = TYPE_TRI;
  pattern.type[5] = TYPE_NOISE;
  pattern.duty[0] = 0.5;
  pattern.duty[1] = 0.5;
  pattern.duty[2] = 0.5;
  pattern.duty[3] = 0.5;
  pattern.duty[4] = 0.5;
  pattern.duty[5] = 0.5;

  putNotes(pattern, 0, [
    72, null, 76, null,
    79, null, 76, null,
    72, null, 76, null,
    79, null, 74, null,
  ]);
  putNotes(pattern, 1, [
    67, null, null, null,
    64, null, null, null,
    67, null, null, null,
    62, null, null, null,
  ]);
  putNotes(pattern, 2, [
    48, null, null, null,
    43, null, null, null,
    48, null, null, null,
    41, null, null, null,
  ]);

  const drums: readonly (number | null)[] = [
    DRUM_KICK, null, DRUM_HAT, null,
    DRUM_SNARE, null, DRUM_HAT, null,
    DRUM_KICK, null, DRUM_HAT, null,
    DRUM_SNARE, null, DRUM_HAT, null,
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

export function stepIndex(now: number, start: number, bpm: number, steps = DEFAULT_STEPS, swing = SWING_STRAIGHT): number {
  const index = absStepAt(now - start, bpm, swing);
  if (index < 0) return -1;
  return index % clampSteps(steps);
}

export function clampSwing(swing: number): number {
  if (!Number.isFinite(swing)) return SWING_STRAIGHT;
  const next = Math.round(swing);
  if (next < SWING_STRAIGHT) return SWING_STRAIGHT;
  if (next > 75) return 75;
  return next;
}

export function swingSeconds(bpm: number, swing: number, step: number): number {
  const straight = stepSeconds(bpm);
  if (swing === SWING_STRAIGHT) return straight;
  const pair = straight * 2;
  const even = pair * (clampSwing(swing) / 100);
  return (step & 1) === 0 ? even : pair - even;
}

export function stepStart(abs: number, bpm: number, swing: number): number {
  if (abs <= 0) return 0;
  const straight = stepSeconds(bpm);
  if (swing === SWING_STRAIGHT) return abs * straight;
  const pairs = Math.floor(abs / 2);
  const pair = straight * 2;
  const even = pair * (clampSwing(swing) / 100);
  return pairs * pair + ((abs & 1) === 1 ? even : 0);
}

export function absStepAt(elapsed: number, bpm: number, swing: number): number {
  if (!(elapsed >= 0)) return -1;
  const straight = stepSeconds(bpm);
  if (!(straight > 0)) return 0;
  if (swing === SWING_STRAIGHT) return Math.floor(elapsed / straight);
  const pair = straight * 2;
  const pairIndex = Math.floor(elapsed / pair);
  const within = elapsed - pairIndex * pair;
  const even = pair * (clampSwing(swing) / 100);
  if (within < even) return pairIndex * 2;
  return pairIndex * 2 + 1;
}

export function placeClock(
  playSong: number,
  liveSteps: number,
  slot: number,
  loopStart: number,
  loopEnd: number,
  orderLen: number,
  orderPat: ArrayLike<number>,
  orderRep: ArrayLike<number>,
  orderTr: ArrayLike<number>,
  patterns: { steps: number }[],
  abs: number,
  out: Place,
): void {
  const at = abs < 0 ? 0 : abs;
  if (!playSong) {
    const steps = liveSteps > 0 ? liveSteps : 1;
    out.index = -1;
    out.pat = slot;
    out.local = at % steps;
    out.tr = 0;
    return;
  }
  const end = loopEnd > loopStart ? loopEnd : loopStart + 1;
  const last = end < orderLen ? end : orderLen;
  let total = 0;
  for (let i = loopStart; i < last; i++) {
    const pat = orderPat[i] > 0 ? orderPat[i] : 0;
    const steps = patterns[pat] && patterns[pat].steps > 0 ? patterns[pat].steps : 1;
    const rep = orderRep[i] > 0 ? orderRep[i] : 1;
    total += steps * rep;
  }
  if (total <= 0) {
    out.index = 0;
    out.pat = 0;
    out.local = 0;
    out.tr = 0;
    return;
  }
  let left = at % total;
  for (let i = loopStart; i < last; i++) {
    const pat = orderPat[i] > 0 ? orderPat[i] : 0;
    const steps = patterns[pat] && patterns[pat].steps > 0 ? patterns[pat].steps : 1;
    const rep = orderRep[i] > 0 ? orderRep[i] : 1;
    const span = steps * rep;
    if (left < span) {
      out.index = i;
      out.pat = pat;
      out.local = left % steps;
      out.tr = orderTr[i] || 0;
      return;
    }
    left -= span;
  }
  out.index = loopStart;
  out.pat = orderPat[loopStart] > 0 ? orderPat[loopStart] : 0;
  out.local = 0;
  out.tr = orderTr[loopStart] || 0;
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
    state.open.fill(0);
    state.env.fill(0);
    state.envStage.fill(3);
    state.origin.fill(-1);
    state.glide.fill(-1);
    state.lastKey = -1;
    state.delayPos = 0;
    state.delayL.fill(0);
    state.delayR.fill(0);
    state.crushPhase = 0;
    state.crushL = 0;
    state.crushR = 0;
  }
}

export function applyPattern(state: SynthState, pattern: Pattern): void {
  copyPattern(pattern, state.bank[0]);
  copyPattern(pattern, state);
  state.bound = 0;
  state.slot = 0;
}

export function applySong(state: SynthState, song: SongBoot): void {
  state.playSong = song.playSong ? 1 : 0;
  state.swing = clampSwing(song.swing);
  state.loopStart = song.loopStart;
  state.loopEnd = song.loopEnd;
  state.orderLen = song.orderLen;
  state.slot = song.slot;
  const entries = song.orderLen < MAX_ORDER ? song.orderLen : MAX_ORDER;
  for (let i = 0; i < MAX_ORDER; i++) {
    state.orderPat[i] = i < entries && song.orderPat[i] > 0 ? song.orderPat[i] : 0;
    state.orderRep[i] = i < entries && song.orderRep[i] > 0 ? song.orderRep[i] : 1;
    state.orderTr[i] = i < entries ? song.orderTr[i] || 0 : 0;
  }
  const count = song.count < MAX_PATTERNS ? song.count : MAX_PATTERNS;
  for (let i = 0; i < count; i++) copyPattern(song.patterns[i], state.bank[i]);
  const picked = state.playSong ? state.orderPat[state.loopStart] || 0 : state.slot;
  const pat = picked >= 0 && picked < MAX_PATTERNS ? picked : 0;
  copyPattern(state.bank[pat], state);
  state.bound = pat;
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
    const index = message.index >= 0 && message.index < MAX_PATTERNS ? message.index : 0;
    copyPattern(message, state.bank[index]);
    if (index === state.bound) copyPattern(message, state);
    return;
  }
  if (message.kind === 'song') {
    state.playSong = message.playSong ? 1 : 0;
    state.swing = clampSwing(message.swing);
    state.loopStart = message.loopStart;
    state.loopEnd = message.loopEnd;
    state.orderLen = message.orderLen;
    state.slot = message.slot >= 0 && message.slot < MAX_PATTERNS ? message.slot : 0;
    const entries = message.orderLen < MAX_ORDER ? message.orderLen : MAX_ORDER;
    for (let i = 0; i < MAX_ORDER; i++) {
      state.orderPat[i] = i < entries && message.orderPat[i] > 0 ? message.orderPat[i] : 0;
      state.orderRep[i] = i < entries && message.orderRep[i] > 0 ? message.orderRep[i] : 1;
      state.orderTr[i] = i < entries ? message.orderTr[i] || 0 : 0;
    }
    if (!state.playSong) {
      copyPattern(state.bank[state.slot], state);
      state.bound = state.slot;
    } else {
      state.bound = -1;
    }
    return;
  }
  if (message.kind === 'mix') applyMix(state, message.mute, message.solo);
  if (message.kind === 'fx') setFx(state, message.delay, message.crush);
}

function unit(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function setFx(state: SynthState, delay: number, crush: number): void {
  state.delay = unit(delay);
  state.crush = unit(crush);
}

export function patternMessage(pattern: Pattern, index = 0): PatternMsg {
  return { kind: 'pattern', index, ...pattern };
}

export function capture(
  pattern: Pattern,
  bpm: number,
  playing: number,
  startTime: number,
  mute: ArrayLike<number>,
  solo: ArrayLike<number>,
  scope: SharedArrayBuffer | null,
  song: SongBoot | null = null,
  delay = 0,
  crush = 0,
): Capture {
  return {
    bpm: clampBpm(bpm),
    playing,
    startTime,
    pattern,
    mute,
    solo,
    scope,
    song,
    delay: unit(delay),
    crush: unit(crush),
  };
}

export function applyCapture(state: SynthState, options: Capture): void {
  setTransport(state, options.bpm, options.playing, options.startTime, 1);
  if (options.song) applySong(state, options.song);
  else applyPattern(state, options.pattern);
  applyMix(state, options.mute, options.solo);
  setFx(state, options.delay, options.crush);
  state.delayNow = state.delay;
  state.crushNow = state.crush;
}

export function clockLfsr(reg: number, short: number): number {
  const other = short ? reg >> 6 : reg >> 1;
  const bit = (reg ^ other) & 1;
  return ((reg >> 1) | (bit << 14)) & 0x7fff;
}

function xorshift(n: number): number {
  let x = n | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function armDrum(state: SynthState, channel: number, drum: number, sampleRate: number): void {
  const kind = clampDrum(drum);
  state.drumCur[channel] = kind;
  const hz = state.noiseHz[kind] > 1 ? state.noiseHz[kind] : 1;
  state.period[channel] = Math.max(1, sampleRate / hz);
  const mode = state.lfsr[channel];
  state.short[channel] = mode === LFSR_FOLLOW ? state.noiseShort[kind] : mode ? 1 : 0;
}

function dutyBase(state: SynthState, channel: number): number {
  const origin = state.origin[channel];
  if (origin >= 0) {
    const pick = state.stepDuty[cell(channel, origin)];
    if (pick < 4) return DUTY_LUT[pick];
  }
  return state.duty[channel];
}

function startVoice(
  state: SynthState,
  channel: number,
  note: number,
  volume: number,
  drum: number,
  sampleRate: number,
  step: number,
): void {
  state.origin[channel] = step;
  state.baseMidi[channel] = note;
  state.age[channel] = 0;
  state.open[channel] = 1;
  state.envStage[channel] = 0;
  state.arpPhase[channel] = 0;
  state.arpTick[channel] = 0;
  state.arpOff[channel] = 0;
  state.lfsrReg[channel] = 0x7fff;
  state.lfsrCount[channel] = 0;
  state.level[channel] = (clampVol(volume) / VOL_MAX) * GAIN[channel];
  const bend = step >= 0 ? state.pitch[cell(channel, step)] - PITCH_CENTER : 0;
  if (state.glide[channel] < 0 || state.slide[channel] <= 0) state.glide[channel] = note + bend;
  state.dutyNow[channel] = dutyBase(state, channel);
  const kind = clampDrum(drum);
  armDrum(state, channel, kind, sampleRate);
  if (step < 0) return;
  const mask = state.drumMask[cell(channel, step)] || 0;
  for (let i = 0; i < DRUM_COUNT; i++) {
    if ((mask & (1 << i)) === 0 || i === kind) continue;
    const slot = channel * DRUM_COUNT + i;
    const hz = state.noiseHz[i] > 1 ? state.noiseHz[i] : 1;
    state.xPeriod[slot] = Math.max(1, sampleRate / hz);
    const mode = state.lfsr[channel];
    state.xShort[slot] = mode === LFSR_FOLLOW ? state.noiseShort[i] : mode ? 1 : 0;
    state.xLfsr[slot] = 0x7fff;
    state.xCount[slot] = 0;
    state.xPhase[slot] = 0;
  }
}

function extraNoise(state: SynthState, slot: number, kind: number, sampleRate: number, age: number): number {
  state.xCount[slot] -= 1;
  if (state.xCount[slot] <= 0) {
    state.xCount[slot] += state.xPeriod[slot];
    state.xLfsr[slot] = clockLfsr(state.xLfsr[slot] || 1, state.xShort[slot]);
  }
  const bit = (state.xLfsr[slot] & 1) ? 1 : -1;
  const noise = bit * Math.exp(-age * state.noiseDecay[kind]) * state.noiseGain[kind];
  if (!state.noiseTone[kind]) return noise;
  const hz = state.noiseBase[kind] + state.noiseStart[kind] * Math.exp(-age * state.noiseDrop[kind]);
  state.xPhase[slot] += hz / sampleRate;
  if (state.xPhase[slot] >= 1) state.xPhase[slot] -= 1;
  const tone = state.xPhase[slot] < 0.5 ? 1 : -1;
  return noise + tone * Math.exp(-age * state.noiseToneDecay[kind]) * state.noiseToneGain[kind];
}

function noiseVoice(state: SynthState, channel: number): boolean {
  const type = state.type[channel];
  if (type === TYPE_OFF) return false;
  if (drumTrack(channel)) return true;
  return type === TYPE_NOISE;
}

function noiseBit(state: SynthState, channel: number): number {
  state.lfsrCount[channel] -= 1;
  if (state.lfsrCount[channel] <= 0) {
    state.lfsrCount[channel] += state.period[channel];
    state.lfsrReg[channel] = clockLfsr(state.lfsrReg[channel] || 1, state.short[channel]);
  }
  return (state.lfsrReg[channel] & 1) ? 1 : -1;
}

function noiseSample(state: SynthState, channel: number, sampleRate: number, age: number): number {
  const kind = state.drumCur[channel];
  const noise = noiseBit(state, channel) * Math.exp(-age * state.noiseDecay[kind]) * state.noiseGain[kind];
  if (!state.noiseTone[kind]) return noise;
  const hz = state.noiseBase[kind] + state.noiseStart[kind] * Math.exp(-age * state.noiseDrop[kind]);
  state.phase[channel] += hz / sampleRate;
  if (state.phase[channel] >= 1) state.phase[channel] -= 1;
  const tone = state.phase[channel] < 0.5 ? 1 : -1;
  return noise + tone * Math.exp(-age * state.noiseToneDecay[kind]) * state.noiseToneGain[kind];
}

function adsr(state: SynthState, channel: number, dt: number): number {
  let env = state.env[channel];
  let stage = state.envStage[channel];
  if (!state.open[channel]) stage = 3;
  if (stage === 0) {
    const dur = state.attack[channel] > 0.0008 ? state.attack[channel] : 0.0008;
    env += dt / dur;
    if (env >= 1) {
      env = 1;
      stage = 1;
    }
  } else if (stage === 1) {
    const sustain = state.sustain[channel];
    const dur = state.decay[channel] > 0.0008 ? state.decay[channel] : 0.0008;
    env -= (dt / dur) * (1 - sustain);
    if (env <= sustain) {
      env = sustain;
      stage = 2;
    }
  } else if (stage === 2) {
    env = state.sustain[channel];
  } else {
    const dur = state.release[channel] > 0.0008 ? state.release[channel] : 0.0008;
    env -= dt / dur;
    if (env < 0) env = 0;
  }
  state.env[channel] = env;
  state.envStage[channel] = stage;
  return env;
}

function slewTo(current: number, target: number, k: number): number {
  if (current === target) return target;
  const next = current + (target - current) * k;
  if (target === 0 && next > -1e-5 && next < 1e-5) return 0;
  return next;
}

function arpOffset(state: SynthState, channel: number, dt: number): number {
  const origin = state.origin[channel];
  let pattern = state.arp[channel];
  if (origin >= 0) {
    const step = state.stepArp[cell(channel, origin)];
    if (step !== FX_INHERIT) pattern = step;
  }
  if (pattern === ARP_OFF) return 0;
  const rate = state.arpRate[channel];
  if (!(rate > 0)) return 0;
  state.arpPhase[channel] += rate * dt;
  const tick = Math.floor(state.arpPhase[channel]);
  if (pattern === ARP_RANDOM) {
    if (tick !== state.arpTick[channel]) {
      state.arpTick[channel] = tick;
      state.rng[channel] = xorshift(state.rng[channel]);
      state.arpOff[channel] = ARP_SEQ[16 + (state.rng[channel] % 3)];
    }
    return state.arpOff[channel];
  }
  state.arpTick[channel] = tick;
  const len = ARP_LEN[pattern] || 1;
  return ARP_SEQ[pattern * 4 + (tick % len)];
}

function voiceHz(state: SynthState, channel: number, dt: number): number {
  const origin = state.origin[channel];
  const bend = origin >= 0 ? state.pitch[cell(channel, origin)] - PITCH_CENTER : 0;
  const target = state.baseMidi[channel] + bend + arpOffset(state, channel, dt);
  const slide = state.slide[channel];
  if (!(slide > 0) || state.glide[channel] < 0) state.glide[channel] = target;
  else {
    const step = slide * dt;
    const delta = target - state.glide[channel];
    if (delta > step) state.glide[channel] += step;
    else if (delta < -step) state.glide[channel] -= step;
    else state.glide[channel] = target;
  }
  state.vibPhase[channel] += state.vibRate[channel] * dt;
  if (state.vibPhase[channel] >= 1) state.vibPhase[channel] -= 1;
  const vib = state.vibDepth[channel] * Math.sin(state.vibPhase[channel] * Math.PI * 2);
  return 440 * Math.pow(2, (state.glide[channel] + vib - 69) / 12);
}

function slewWave(state: SynthState, channel: number, k: number): void {
  const base = channel * WAVE_LEN;
  for (let i = 0; i < WAVE_LEN; i++) {
    const at = base + i;
    state.waveNow[at] = slewTo(state.waveNow[at], state.wave[at], k);
  }
}

function waveSample(state: SynthState, channel: number): number {
  const pos = state.phase[channel] * WAVE_LEN;
  let index = pos | 0;
  if (index >= WAVE_LEN) index = WAVE_LEN - 1;
  const frac = pos - index;
  const next = index + 1 >= WAVE_LEN ? 0 : index + 1;
  const base = channel * WAVE_LEN;
  const a = state.waveNow[base + index];
  return a + (state.waveNow[base + next] - a) * frac;
}

function channelSample(state: SynthState, channel: number, sampleRate: number, dt: number, k: number): number {
  const type = state.type[channel];
  if (type === TYPE_OFF) return 0;
  state.volNow[channel] = slewTo(state.volNow[channel], state.vol[channel], k);
  state.panNow[channel] = slewTo(state.panNow[channel], state.pan[channel], k);
  if (noiseVoice(state, channel)) {
    if (!state.open[channel] || state.age[channel] > 4) return 0;
    const env = adsr(state, channel, dt);
    const kind = state.drumCur[channel];
    const clock = state.noiseHz[kind] > 1 ? state.noiseHz[kind] : 1;
    const baseHz = 440 * Math.pow(2, (state.baseMidi[channel] - 69) / 12);
    const hz = voiceHz(state, channel, dt);
    const ratio = baseHz > 1 ? hz / baseHz : 1;
    state.period[channel] = Math.max(1, sampleRate / (clock * ratio));
    let raw = noiseSample(state, channel, sampleRate, state.age[channel]);
    const origin = state.origin[channel];
    const mask = origin >= 0 ? state.drumMask[cell(channel, origin)] || 0 : 0;
    if (mask) {
      const age = state.age[channel];
      for (let i = 0; i < DRUM_COUNT; i++) {
        if ((mask & (1 << i)) === 0 || i === kind) continue;
        const slot = channel * DRUM_COUNT + i;
        const extraClock = state.noiseHz[i] > 1 ? state.noiseHz[i] : 1;
        state.xPeriod[slot] = Math.max(1, sampleRate / (extraClock * ratio));
        raw += extraNoise(state, slot, i, sampleRate, age);
      }
    }
    return raw * env * state.level[channel] * state.volNow[channel];
  }
  const env = adsr(state, channel, dt);
  if (!state.open[channel] && env < 1e-4) return 0;
  const hz = voiceHz(state, channel, dt);
  state.freq[channel] = hz;
  state.phase[channel] += hz / sampleRate;
  if (state.phase[channel] >= 1) state.phase[channel] -= 1;
  let raw = 0;
  if (type === TYPE_PULSE) {
    let duty = dutyBase(state, channel);
    const sweep = state.sweep[channel];
    if (sweep !== 0) {
      duty += sweep * state.age[channel];
      if (duty < 0.05) duty = 0.05;
      if (duty > 0.95) duty = 0.95;
    }
    state.dutyNow[channel] = slewTo(state.dutyNow[channel], duty, k);
    const width = state.dutyNow[channel];
    raw = (state.phase[channel] < width ? 1 : -1) - (width * 2 - 1);
  } else {
    slewWave(state, channel, k);
    raw = waveSample(state, channel);
  }
  return raw * env * state.level[channel] * state.volNow[channel];
}

function bindPattern(state: SynthState, pat: number): void {
  if (state.bound === pat) return;
  const source = state.bank[pat];
  if (!source) return;
  copyPattern(source, state);
  state.bound = pat;
}

function midiOf(note: number, type: number, transpose: number): number {
  if (type === TYPE_NOISE) return note;
  let midi = note + transpose;
  if (midi < 0) midi = 0;
  if (midi > 127) midi = 127;
  return midi;
}

function startAt(state: SynthState, channel: number, source: Pattern, step: number, abs: number, transpose: number, sampleRate: number): void {
  const index = cell(channel, step);
  const len = source.length[index] > 0 ? source.length[index] : 1;
  state.holdUntil[channel] = abs + len;
  let midi = midiOf(source.note[index], state.type[channel], transpose);
  if (drumTrack(channel)) midi = DRUM_NOTE;
  startVoice(state, channel, midi, source.volume[index], source.drum[index], sampleRate, step);
}

function fireTick(state: SynthState, abs: number, tick: number, sampleRate: number): void {
  placeClock(
    state.playSong,
    state.steps,
    state.slot,
    state.loopStart,
    state.loopEnd,
    state.orderLen,
    state.orderPat,
    state.orderRep,
    state.orderTr,
    state.bank,
    abs,
    state.here,
  );
  state.lastStep = abs;
  bindPattern(state, state.here.pat);
  const here = state.bank[state.here.pat];
  if (!here) return;
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (state.type[channel] === TYPE_OFF) continue;
    const index = cell(channel, state.here.local);
    let nudge = here.nudge[index];
    if (nudge < 0 && state.here.local === 0) nudge = 0;
    if (tick === 0 && here.note[index] === EMPTY && abs >= state.holdUntil[channel]) state.open[channel] = 0;
    if (here.note[index] !== EMPTY && nudge === tick) {
      startAt(state, channel, here, state.here.local, abs, state.here.tr, sampleRate);
    }
  }
  if (tick < SUB - 2) return;
  placeClock(
    state.playSong,
    state.steps,
    state.slot,
    state.loopStart,
    state.loopEnd,
    state.orderLen,
    state.orderPat,
    state.orderRep,
    state.orderTr,
    state.bank,
    abs + 1,
    state.ahead,
  );
  if (state.ahead.pat !== state.here.pat || state.ahead.local !== state.here.local + 1) return;
  const early = tick - SUB;
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (state.type[channel] === TYPE_OFF) continue;
    const index = cell(channel, state.ahead.local);
    if (here.note[index] === EMPTY || here.nudge[index] !== early) continue;
    startAt(state, channel, here, state.ahead.local, abs + 1, state.ahead.tr, sampleRate);
  }
}

export function noteChannel(
  state: SynthState,
  channel: number,
  note: number,
  volume: number,
  down: number,
  sampleRate: number,
): void {
  if (channel < 0 || channel >= MAX_CHANNELS) return;
  if (state.type[channel] === TYPE_OFF) return;
  if (!down) {
    if (state.open[channel] && state.baseMidi[channel] === note) state.open[channel] = 0;
    return;
  }
  let midi = Math.round(note);
  if (midi < 0) midi = 0;
  if (midi > 127) midi = 127;
  startVoice(state, channel, midi, volume, state.drumCur[channel], sampleRate, -1);
  state.holdUntil[channel] = state.lastStep >= 0 ? state.lastStep + 2 : 1;
}

export function hitChannel(
  state: SynthState,
  channel: number,
  drum: number,
  volume: number,
  sampleRate: number,
): void {
  if (channel < 0 || channel >= MAX_CHANNELS) return;
  if (state.type[channel] === TYPE_OFF) return;
  if (!drumTrack(channel) && state.type[channel] !== TYPE_NOISE) return;
  startVoice(state, channel, DRUM_NOTE, volume, drum, sampleRate, -1);
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
  const k = 1 - Math.exp(-dt / SMOOTH);
  const peakK = Math.exp(-dt / 0.05);
  for (let i = 0; i < frames; i++) {
    if (playing) {
      const elapsed = time + i * dt - state.startTime;
      const abs = absStepAt(elapsed, state.bpm, state.swing);
      let tick = 0;
      if (abs >= 0) {
        const dur = swingSeconds(state.bpm, state.swing, abs);
        const into = dur > 0 ? (elapsed - stepStart(abs, state.bpm, state.swing)) / dur : 0;
        tick = into <= 0 ? 0 : Math.floor(into * SUB);
        if (tick >= SUB) tick = SUB - 1;
        if (tick < 0) tick = 0;
      }
      const key = abs < 0 ? -1 : abs * SUB + tick;
      if (key < 0) {
        state.lastKey = -1;
      } else if (key !== state.lastKey) {
        const forward = state.lastKey >= 0 && key > state.lastKey && key - state.lastKey <= 48;
        const from = forward ? state.lastKey + 1 : key;
        for (let at = from; at <= key; at++) fireTick(state, (at / SUB) | 0, at % SUB, sampleRate);
        state.lastKey = key;
      }
    }
    let accL = 0;
    let accR = 0;
    for (let channel = 0; channel < MAX_CHANNELS; channel++) {
      if (state.type[channel] === TYPE_OFF) continue;
      const sample = channelSample(state, channel, sampleRate, dt, k);
      if (state.age[channel] < 10) state.age[channel] += dt;
      const mag = sample < 0 ? -sample : sample;
      if (state.audible[channel]) {
        state.peak[channel] = mag > state.peak[channel] ? mag : state.peak[channel] * peakK;
        const pan = state.panNow[channel];
        if (pan === 0) {
          accL += sample;
          accR += sample;
        } else {
          const angle = (pan + 1) * (Math.PI * 0.25);
          accL += sample * Math.cos(angle);
          accR += sample * Math.sin(angle);
        }
      } else {
        state.peak[channel] *= peakK;
      }
    }
    state.delayNow = slewTo(state.delayNow, state.delay, k);
    state.crushNow = slewTo(state.crushNow, state.crush, k);
    const send = state.delayNow;
    const pos = state.delayPos;
    const wetL = state.delayL[pos];
    const wetR = state.delayR[pos];
    const open = send > 0.003 ? 1 : 0;
    state.delayL[pos] = accL * open + wetL * (open ? 0.28 : 0.9);
    state.delayR[pos] = accR * open + wetR * (open ? 0.28 : 0.9);
    const next = pos + 1;
    state.delayPos = next < DELAY_LEN ? next : 0;
    accL += wetL * send;
    accR += wetR * send;
    const crush = state.crushNow;
    if (crush > 0.003) {
      const hold = 1 + (crush * 5) | 0;
      state.crushPhase += 1;
      if (state.crushPhase >= hold) {
        state.crushPhase = 0;
        let bits = 12 - (crush * 7) | 0;
        if (bits < 4) bits = 4;
        const steps = 1 << bits;
        state.crushL = Math.round(accL * steps) / steps;
        state.crushR = Math.round(accR * steps) / steps;
      }
      accL = state.crushL;
      accR = state.crushR;
    } else if (state.crushPhase !== 0) {
      state.crushPhase = 0;
    }
    accL *= 0.9;
    accR *= 0.9;
    if (accL > 1) accL = 1;
    else if (accL < -1) accL = -1;
    if (accR > 1) accR = 1;
    else if (accR < -1) accR = -1;
    left[i] = accL;
    if (stereo) right[i] = accR;
    const scope = state.scope;
    const scopeWrite = state.scopeWrite;
    if (scope && scopeWrite) {
      state.scopeDiv += 1;
      if (state.scopeDiv >= 16) {
        state.scopeDiv = 0;
        const at = Atomics.load(scopeWrite, 0);
        scope[at] = (accL + accR) * 0.5;
        Atomics.store(scopeWrite, 0, (at + 1) % SCOPE_LEN);
      }
    }
  }
}
