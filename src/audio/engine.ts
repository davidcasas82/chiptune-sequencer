import {
  beginEdit,
  canRedo,
  canUndo,
  cancelEdit,
  commitEdit,
  copyRect,
  createHistory,
  pasteRect,
  previewEdit,
  redoEdit,
  setPatternSteps,
  undoEdit,
  type Clip,
  type History,
} from './edit';
import {
  DEMO_BPM,
  MAX_CHANNELS,
  SCOPE_LEN,
  SOUNDING_CHANNELS,
  type HitMsg,
  type Pattern,
  type WorkletMsg,
  capture,
  clampBpm,
  clampDrum,
  clampVol,
  clonePattern,
  createPattern,
  loopSeconds,
  patternMessage,
  rebaseStart,
  writeDemo,
} from './synth';
import { encodeWav } from './wav';

const LOOKAHEAD = 0.05;

function playbackSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'playback';
}

function workletUrl(): string {
  return new URL('chiptune-worklet.js', document.baseURI).href;
}

export type Engine = {
  pattern: Pattern;
  readonly mute: Uint8Array;
  readonly solo: Uint8Array;
  readonly bpm: number;
  readonly playing: boolean;
  readonly startTime: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasClip: boolean;
  resume: () => Promise<void>;
  play: () => Promise<void>;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setSteps: (steps: number) => void;
  begin: () => void;
  preview: (edit: (pattern: Pattern) => void) => void;
  apply: (edit: (pattern: Pattern) => void) => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  copy: (c0: number, s0: number, c1: number, s1: number) => void;
  paste: (channel: number, step: number) => boolean;
  setMute: (channel: number, on: boolean) => void;
  setSolo: (channel: number, on: boolean) => void;
  hit: (drum: number, volume: number) => void;
  now: () => number;
  readonly peaks: Float32Array;
  readonly scope: Float32Array | null;
  readonly scopePos: Int32Array | null;
};

export function createEngine(): Engine {
  const pattern = createPattern();
  writeDemo(pattern);
  const mute = new Uint8Array(MAX_CHANNELS);
  const solo = new Uint8Array(MAX_CHANNELS);
  const history: History = createHistory();
  let clip: Clip | null = null;
  let bpm = DEMO_BPM;
  let playing = false;
  let startTime = 0;
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let booting: Promise<void> | null = null;
  let queuedHit: HitMsg | null = null;
  const scopeSab = createScope();
  const scopePos = scopeSab ? new Int32Array(scopeSab, 0, 1) : null;
  const scope = scopeSab ? new Float32Array(scopeSab, 4, SCOPE_LEN) : null;
  const peaks = scopeSab
    ? new Float32Array(scopeSab, 4 + SCOPE_LEN * 4, MAX_CHANNELS)
    : new Float32Array(MAX_CHANNELS);

  function post(message: WorkletMsg): void {
    node?.port.postMessage(message);
  }

  function postPattern(): void {
    post(patternMessage(pattern));
  }

  function postMix(): void {
    post({ kind: 'mix', mute, solo });
  }

  function postTransport(reset: number): void {
    post({ kind: 'transport', bpm, playing: playing ? 1 : 0, startTime, reset });
  }

  function resume(): Promise<void> {
    if (booting) return booting;
    playbackSession();
    const audio = new AudioContext();
    ctx = audio;
    void audio.resume();
    booting = (async () => {
      await audio.audioWorklet.addModule(workletUrl());
      const created = new AudioWorkletNode(audio, 'chiptune', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: capture(pattern, bpm, playing ? 1 : 0, startTime, mute, solo, scopeSab),
      });
      created.onprocessorerror = () => {
        console.error('audio processor error');
      };
      created.connect(audio.destination);
      node = created;
      postPattern();
      postMix();
      if (queuedHit) {
        post(queuedHit);
        queuedHit = null;
      }
    })();
    return booting;
  }

  async function play(): Promise<void> {
    await resume();
    if (!ctx || !node) return;
    if (ctx.state !== 'running') await ctx.resume();
    startTime = ctx.currentTime + LOOKAHEAD;
    playing = true;
    postTransport(1);
  }

  function stop(): void {
    playing = false;
    startTime = 0;
    postTransport(1);
  }

  function setBpm(next: number): void {
    const value = clampBpm(next);
    if (playing && ctx) {
      const now = ctx.currentTime;
      startTime = rebaseStart(now, startTime, bpm, value, pattern.steps);
      bpm = value;
      postTransport(0);
      return;
    }
    bpm = value;
    postTransport(0);
  }

  function setSteps(steps: number): void {
    beginEdit(history, pattern);
    setPatternSteps(pattern, steps);
    commitEdit(history, pattern);
    postPattern();
  }

  function begin(): void {
    beginEdit(history, pattern);
  }

  function preview(edit: (pattern: Pattern) => void): void {
    previewEdit(history, pattern, edit);
    postPattern();
  }

  function apply(edit: (pattern: Pattern) => void): void {
    beginEdit(history, pattern);
    edit(pattern);
    postPattern();
  }

  function commit(): void {
    commitEdit(history, pattern);
    postPattern();
  }

  function cancel(): void {
    cancelEdit(history, pattern);
    postPattern();
  }

  function undo(): void {
    if (!undoEdit(history, pattern)) return;
    postPattern();
  }

  function redo(): void {
    if (!redoEdit(history, pattern)) return;
    postPattern();
  }

  function copy(c0: number, s0: number, c1: number, s1: number): void {
    clip = copyRect(pattern, c0, s0, c1, s1);
  }

  function paste(channel: number, step: number): boolean {
    if (!clip) return false;
    beginEdit(history, pattern);
    pasteRect(pattern, clip, channel, step);
    commitEdit(history, pattern);
    postPattern();
    return true;
  }

  function setMute(channel: number, on: boolean): void {
    if (channel < 0 || channel >= SOUNDING_CHANNELS) return;
    mute[channel] = on ? 1 : 0;
    postMix();
  }

  function setSolo(channel: number, on: boolean): void {
    if (channel < 0 || channel >= SOUNDING_CHANNELS) return;
    solo[channel] = on ? 1 : 0;
    postMix();
  }

  function hit(drum: number, volume: number): void {
    const message: HitMsg = {
      kind: 'hit',
      channel: 3,
      drum: clampDrum(drum),
      volume: clampVol(volume),
    };
    if (!node) {
      queuedHit = message;
      return;
    }
    post(message);
  }

  return {
    pattern,
    mute,
    solo,
    get bpm() {
      return bpm;
    },
    get playing() {
      return playing;
    },
    get startTime() {
      return startTime;
    },
    get canUndo() {
      return canUndo(history);
    },
    get canRedo() {
      return canRedo(history);
    },
    get hasClip() {
      return clip !== null;
    },
    resume,
    play,
    stop,
    setBpm,
    setSteps,
    begin,
    preview,
    apply,
    commit,
    cancel,
    undo,
    redo,
    copy,
    paste,
    setMute,
    setSolo,
    hit,
    now: () => ctx?.currentTime ?? 0,
    peaks,
    scope,
    scopePos,
  };
}

function createScope(): SharedArrayBuffer | null {
  if (typeof SharedArrayBuffer === 'undefined') return null;
  if (typeof crossOriginIsolated !== 'boolean' || !crossOriginIsolated) return null;
  const bytes = 4 + SCOPE_LEN * 4 + MAX_CHANNELS * 4;
  try {
    return new SharedArrayBuffer(bytes);
  } catch {
    return null;
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  const size = 8192;
  for (let i = 0; i < bytes.length; i += size) {
    const end = Math.min(i + size, bytes.length);
    let chunk = '';
    for (let j = i; j < end; j++) chunk += String.fromCharCode(bytes[j]);
    binary += chunk;
  }
  return btoa(binary);
}

export async function renderPatternWav(pattern: Pattern, bpm: number): Promise<string> {
  const copy = clonePattern(pattern);
  const mute = new Uint8Array(MAX_CHANNELS);
  const solo = new Uint8Array(MAX_CHANNELS);
  const sampleRate = 44100;
  const frames = Math.round(loopSeconds(bpm, 2, copy.steps) * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);
  await offline.audioWorklet.addModule(workletUrl());
  const node = new AudioWorkletNode(offline, 'chiptune', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: capture(copy, bpm, 1, 0, mute, solo, null),
  });
  node.connect(offline.destination);
  const rendered = await offline.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), sampleRate);
  return bytesToB64(wav);
}
