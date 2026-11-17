import {
  DEMO_BPM,
  SOUNDING_CHANNELS,
  STEP_COUNT,
  type Pattern,
  type WorkletMsg,
  capture,
  clampBpm,
  createPattern,
  encodeWav,
  loopSeconds,
  rebaseStart,
  toggleStep,
  writeDemo,
} from './synth';

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
  readonly bpm: number;
  readonly playing: boolean;
  readonly startTime: number;
  resume: () => Promise<void>;
  play: () => Promise<void>;
  stop: () => void;
  setBpm: (bpm: number) => void;
  toggle: (channel: number, step: number) => void;
  now: () => number;
};

export function createEngine(): Engine {
  const pattern = createPattern();
  writeDemo(pattern);
  let bpm = DEMO_BPM;
  let playing = false;
  let startTime = 0;
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let booting: Promise<void> | null = null;

  function post(message: WorkletMsg): void {
    node?.port.postMessage(message);
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
        processorOptions: capture(pattern, bpm, playing ? 1 : 0, startTime),
      });
      created.onprocessorerror = () => {
        console.error('audio processor error');
      };
      created.connect(audio.destination);
      node = created;
    })();
    return booting;
  }

  async function play(): Promise<void> {
    await resume();
    if (!ctx || !node) return;
    if (ctx.state !== 'running') await ctx.resume();
    startTime = ctx.currentTime + LOOKAHEAD;
    playing = true;
    post({ kind: 'transport', bpm, playing: 1, startTime, reset: 1 });
  }

  function stop(): void {
    playing = false;
    startTime = 0;
    post({ kind: 'transport', bpm, playing: 0, startTime: 0, reset: 1 });
  }

  function setBpm(next: number): void {
    const value = clampBpm(next);
    if (playing && ctx) {
      const now = ctx.currentTime;
      startTime = rebaseStart(now, startTime, bpm, value);
      bpm = value;
      post({ kind: 'transport', bpm, playing: 1, startTime, reset: 0 });
      return;
    }
    bpm = value;
    post({ kind: 'transport', bpm, playing: 0, startTime, reset: 0 });
  }

  function toggle(channel: number, step: number): void {
    if (channel < 0 || channel >= SOUNDING_CHANNELS || step < 0 || step >= STEP_COUNT) return;
    toggleStep(pattern, channel, step);
    post({
      kind: 'pattern',
      type: pattern.type,
      duty: pattern.duty,
      gate: pattern.gate,
      note: pattern.note,
      drum: pattern.drum,
    });
  }

  return {
    pattern,
    get bpm() {
      return bpm;
    },
    get playing() {
      return playing;
    },
    get startTime() {
      return startTime;
    },
    resume,
    play,
    stop,
    setBpm,
    toggle,
    now: () => ctx?.currentTime ?? 0,
  };
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

export async function renderDemoWav(): Promise<string> {
  const pattern = createPattern();
  writeDemo(pattern);
  const sampleRate = 44100;
  const frames = Math.round(loopSeconds(DEMO_BPM, 2) * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);
  await offline.audioWorklet.addModule(workletUrl());
  const node = new AudioWorkletNode(offline, 'chiptune', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: capture(pattern, DEMO_BPM, 1, 0),
  });
  node.connect(offline.destination);
  const rendered = await offline.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), sampleRate);
  return bytesToB64(wav);
}
