import { copyRect, pasteRect, setPatternSteps, type Clip } from './edit';
import { GUIDE_BPM, guideParts } from './demo';
import { applyProject, projectFrom, type ProjectFile } from './project';
import {
  addPattern,
  applyArp,
  applyChord,
  beginSong,
  canRedoSong,
  canUndoSong,
  cancelSong,
  cloneSong,
  clearPatternNotes,
  commitSong,
  createBlankSong,
  createSong,
  createSongHistory,
  duplicateNotes,
  fillSteps,
  humanize,
  orderSteps,
  placeSong,
  previewSong,
  quantizeNotes,
  randomizeNotes,
  redoSong,
  scaleMask,
  selectPattern,
  setEntryTranspose,
  setLoop,
  setRepeat,
  setRoot,
  setScale,
  shiftNotes,
  toggleMarker,
  togglePitch,
  transposeNotes,
  undoSong,
  vary,
  type Box,
  type Song,
  type SongHistory,
} from './song';
import {
  DEMO_BPM,
  MAX_CHANNELS,
  SCOPE_LEN,
  SWING_STRAIGHT,
  absStepAt,
  capture,
  clampBpm,
  clampDrum,
  clampSwing,
  clampVol,
  clonePattern,
  loopSeconds,
  patternMessage,
  rebaseStart,
  stepSeconds,
  stepStart,
  swingSeconds,
  type HitMsg,
  type NoteMsg,
  type Pattern,
  type Place,
  type SongBoot,
  type WorkletMsg,
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

function boot(song: Song): SongBoot {
  return {
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
    patterns: song.patterns.slice(0, song.count),
  };
}

function rebaseSong(now: number, start: number, oldBpm: number, newBpm: number, oldSwing: number, newSwing: number): number {
  const elapsed = now - start;
  const abs = absStepAt(elapsed, oldBpm, oldSwing);
  if (abs < 0) return now;
  const oldDur = swingSeconds(oldBpm, oldSwing, abs);
  const into = oldDur > 0 ? (elapsed - stepStart(abs, oldBpm, oldSwing)) / oldDur : 0;
  return now - (stepStart(abs, newBpm, newSwing) + into * swingSeconds(newBpm, newSwing, abs));
}

export type Engine = {
  readonly song: Song;
  readonly pattern: Pattern;
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
  setSwing: (swing: number) => void;
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
  hit: (drum: number, volume: number, channel?: number) => void;
  noteOn: (channel: number, note: number, volume: number) => void;
  noteOff: (channel: number, note: number) => void;
  localStep: () => number;
  orderNow: () => number;
  editSong: (edit: (song: Song) => void) => void;
  setPlaySong: (on: boolean) => void;
  selectPattern: (index: number) => void;
  newPattern: () => void;
  dupPattern: () => void;
  selectEntry: (index: number) => void;
  nudgeRepeat: (delta: number) => void;
  nudgeTranspose: (delta: number) => void;
  markEntry: () => void;
  loopEntry: (edge: 'in' | 'out' | 'all') => void;
  hearEntry: () => Promise<void>;
  setScaleKind: (scale: number) => void;
  nudgeRoot: (delta: number) => void;
  toggleClass: (pitchClass: number) => void;
  runArp: (box: Box | null) => void;
  runChord: (box: Box | null, shape: number) => void;
  runRandom: (box: Box | null) => void;
  runHumanize: (box: Box | null) => void;
  runVary: (box: Box | null) => void;
  runFill: (box: Box | null) => void;
  runTranspose: (box: Box | null, semis: number) => void;
  runDuplicate: (box: Box | null) => void;
  runOffset: (box: Box | null, delta: number) => void;
  runQuantize: (box: Box | null) => void;
  clearPattern: () => void;
  newSong: () => void;
  setOnion: (on: boolean) => void;
  setRecord: (on: boolean) => void;
  now: () => number;
  readonly peaks: Float32Array;
  readonly scope: Float32Array | null;
  readonly scopePos: Int32Array | null;
  readonly delay: number;
  readonly crush: number;
  readonly revision: number;
  readonly title: string;
  setDelay: (value: number) => void;
  setCrush: (value: number) => void;
  setTitle: (name: string) => void;
  snapshot: () => ProjectFile;
  loadProject: (file: ProjectFile) => void;
  exportWav: (mode: 'pattern' | 'song') => Promise<Uint8Array>;
};

export function createEngine(): Engine {
  const song = createSong();
  const mute = song.mute;
  const solo = song.solo;
  const history: SongHistory = createSongHistory();
  let clip: Clip | null = null;
  let bpm = DEMO_BPM;
  let playing = false;
  let startTime = 0;
  let delay = 0;
  let crush = 0;
  let title = 'Demo';
  let revision = 0;
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
  const scratch: Place = { index: -1, pat: 0, local: 0, tr: 0 };

  function post(message: WorkletMsg): void {
    node?.port.postMessage(message);
  }

  function touch(): void {
    revision += 1;
  }

  function unit(value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function postPattern(index = song.current): void {
    post(patternMessage(song.patterns[index], index));
  }

  function postSong(): void {
    post({
      kind: 'song',
      playSong: song.playSong,
      swing: song.swing,
      loopStart: song.loopStart,
      loopEnd: song.loopEnd,
      orderLen: song.orderLen,
      slot: song.current,
      orderPat: song.orderPat,
      orderRep: song.orderRep,
      orderTr: song.orderTr,
    });
  }

  function postAll(): void {
    for (let i = 0; i < song.count; i++) postPattern(i);
    postSong();
  }

  function postMix(): void {
    post({ kind: 'mix', mute, solo });
  }

  function postFx(): void {
    post({ kind: 'fx', delay, crush });
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
        processorOptions: capture(song.patterns[song.current], bpm, playing ? 1 : 0, startTime, mute, solo, scopeSab, boot(song), delay, crush),
      });
      created.onprocessorerror = () => {
        console.error('audio processor error');
      };
      created.connect(audio.destination);
      node = created;
      postAll();
      postMix();
      postFx();
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

  function retarget(nextBpm: number, nextSwing: number): void {
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    const oldSwing = song.swing;
    if (song.playSong || oldSwing !== SWING_STRAIGHT || nextSwing !== SWING_STRAIGHT) {
      startTime = rebaseSong(now, startTime, bpm, nextBpm, oldSwing, nextSwing);
    } else {
      startTime = rebaseStart(now, startTime, bpm, nextBpm, song.patterns[song.current].steps);
    }
    bpm = nextBpm;
    song.swing = nextSwing;
  }

  function setBpm(next: number): void {
    const value = clampBpm(next);
    if (playing && ctx) {
      retarget(value, song.swing);
      postTransport(0);
      touch();
      return;
    }
    bpm = value;
    postTransport(0);
    touch();
  }

  function setSwing(next: number): void {
    const value = clampSwing(next);
    if (playing && ctx) {
      retarget(bpm, value);
      postSong();
      postTransport(0);
      touch();
      return;
    }
    song.swing = value;
    postSong();
    touch();
  }

  function setSteps(steps: number): void {
    beginSong(history, song);
    setPatternSteps(song.patterns[song.current], steps);
    commitSong(history, song);
    postPattern();
    touch();
  }

  function setDelay(value: number): void {
    delay = unit(value);
    postFx();
    touch();
  }

  function setCrush(value: number): void {
    crush = unit(value);
    postFx();
    touch();
  }

  function begin(): void {
    beginSong(history, song);
  }

  function preview(edit: (pattern: Pattern) => void): void {
    previewSong(history, song, (doc) => edit(doc.patterns[doc.current]));
    postPattern();
  }

  function apply(edit: (pattern: Pattern) => void): void {
    beginSong(history, song);
    edit(song.patterns[song.current]);
    postPattern();
  }

  function commit(): void {
    commitSong(history, song);
    postPattern();
    touch();
  }

  function cancel(): void {
    cancelSong(history, song);
    postPattern();
    touch();
  }

  function undo(): void {
    if (!undoSong(history, song)) return;
    postAll();
    postMix();
    touch();
  }

  function redo(): void {
    if (!redoSong(history, song)) return;
    postAll();
    postMix();
    touch();
  }

  function copy(c0: number, s0: number, c1: number, s1: number): void {
    clip = copyRect(song.patterns[song.current], c0, s0, c1, s1);
  }

  function paste(channel: number, step: number): boolean {
    if (!clip) return false;
    beginSong(history, song);
    pasteRect(song.patterns[song.current], clip, channel, step);
    commitSong(history, song);
    postPattern();
    touch();
    return true;
  }

  function setMute(channel: number, on: boolean): void {
    if (channel < 0 || channel >= MAX_CHANNELS) return;
    const next = on ? 1 : 0;
    if (mute[channel] === next) return;
    beginSong(history, song);
    mute[channel] = next;
    commitSong(history, song);
    postMix();
    touch();
  }

  function setSolo(channel: number, on: boolean): void {
    if (channel < 0 || channel >= MAX_CHANNELS) return;
    const next = on ? 1 : 0;
    if (solo[channel] === next) return;
    beginSong(history, song);
    solo[channel] = next;
    commitSong(history, song);
    postMix();
    touch();
  }

  function hit(drum: number, volume: number, channel = 3): void {
    const voice = channel >= 0 && channel < MAX_CHANNELS ? channel : 3;
    const message: HitMsg = {
      kind: 'hit',
      channel: voice,
      drum: clampDrum(drum),
      volume: clampVol(volume),
    };
    if (!node) {
      queuedHit = message;
      return;
    }
    post(message);
  }

  function noteOn(channel: number, note: number, volume: number): void {
    const message: NoteMsg = {
      kind: 'note',
      channel,
      note,
      volume: clampVol(volume),
      down: 1,
    };
    post(message);
  }

  function noteOff(channel: number, note: number): void {
    const message: NoteMsg = { kind: 'note', channel, note, volume: 0, down: 0 };
    post(message);
  }

  function placeNow(): Place | null {
    if (!playing || !ctx) return null;
    const abs = absStepAt(ctx.currentTime - startTime, bpm, song.swing);
    if (abs < 0) return null;
    return placeSong(song, abs, scratch);
  }

  function editSong(edit: (song: Song) => void): void {
    beginSong(history, song);
    edit(song);
    commitSong(history, song);
    postAll();
    touch();
  }

  function mask(): number {
    return scaleMask(song.scale, song.custom);
  }

  async function hearEntry(): Promise<void> {
    const entry = song.entry;
    editSong((doc) => {
      doc.playSong = 1;
      setLoop(doc, entry, entry + 1);
      selectPattern(doc, doc.orderPat[entry] || 0);
    });
    if (playing) stop();
    await play();
  }

  function writeMix(bits: ArrayLike<number>, into: Uint8Array): void {
    for (let i = 0; i < into.length; i++) into[i] = bits[i] ? 1 : 0;
  }

  function replaceProject(file: ProjectFile): void {
    const next = applyProject(file, song);
    bpm = next.bpm;
    delay = next.delay;
    crush = next.crush;
    title = next.name;
    writeMix(next.mute, mute);
    writeMix(next.solo, solo);
    history.undo.length = 0;
    history.redo.length = 0;
    history.base = null;
    playing = false;
    startTime = 0;
    postAll();
    postMix();
    postFx();
    postTransport(1);
    touch();
  }

  return {
    get song() {
      return song;
    },
    get pattern() {
      return song.patterns[song.current];
    },
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
      return canUndoSong(history);
    },
    get canRedo() {
      return canRedoSong(history);
    },
    get hasClip() {
      return clip !== null;
    },
    resume,
    play,
    stop,
    setBpm,
    setSwing,
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
    noteOn,
    noteOff,
    localStep: () => {
      const place = placeNow();
      if (!place) return -1;
      if (song.playSong && place.pat !== song.current) return -1;
      return place.local;
    },
    orderNow: () => {
      const place = placeNow();
      if (!place || !song.playSong) return -1;
      return place.index;
    },
    editSong,
    setPlaySong: (on) => {
      song.playSong = on ? 1 : 0;
      postSong();
    },
    selectPattern: (index) => {
      selectPattern(song, index);
      postSong();
      postPattern(song.current);
    },
    newPattern: () => editSong((doc) => addPattern(doc, false)),
    dupPattern: () => editSong((doc) => addPattern(doc, true)),
    selectEntry: (index) => {
      if (index < 0 || index >= song.orderLen) return;
      song.entry = index;
      selectPattern(song, song.orderPat[index] || 0);
      postSong();
      postPattern(song.current);
    },
    nudgeRepeat: (delta) => editSong((doc) => setRepeat(doc, doc.entry, doc.orderRep[doc.entry] + delta)),
    nudgeTranspose: (delta) => editSong((doc) => setEntryTranspose(doc, doc.entry, doc.orderTr[doc.entry] + delta)),
    markEntry: () => editSong((doc) => toggleMarker(doc, doc.entry)),
    loopEntry: (edge) => editSong((doc) => {
      if (edge === 'all') setLoop(doc, 0, doc.orderLen);
      else if (edge === 'in') setLoop(doc, doc.entry, doc.loopEnd);
      else setLoop(doc, doc.loopStart, doc.entry + 1);
    }),
    hearEntry,
    setScaleKind: (scale) => editSong((doc) => setScale(doc, scale)),
    nudgeRoot: (delta) => editSong((doc) => setRoot(doc, doc.root + delta)),
    toggleClass: (pitchClass) => editSong((doc) => togglePitch(doc, pitchClass)),
    runArp: (box) => {
      apply((pattern) => applyArp(pattern, box));
      commit();
    },
    runChord: (box, shape) => {
      apply((pattern) => applyChord(pattern, box, shape));
      commit();
    },
    runRandom: (box) => {
      apply((pattern) => randomizeNotes(pattern, box, song.root, mask(), Math.random));
      commit();
    },
    runHumanize: (box) => {
      apply((pattern) => humanize(pattern, box, Math.random));
      commit();
    },
    runVary: (box) => {
      apply((pattern) => vary(pattern, box, song.root, mask(), Math.random));
      commit();
    },
    runFill: (box) => {
      apply((pattern) => fillSteps(pattern, box, song.root, mask()));
      commit();
    },
    runTranspose: (box, semis) => {
      apply((pattern) => transposeNotes(pattern, box, semis, song.root, mask()));
      commit();
    },
    runDuplicate: (box) => {
      apply((pattern) => duplicateNotes(pattern, box));
      commit();
    },
    runOffset: (box, delta) => {
      apply((pattern) => shiftNotes(pattern, box, delta));
      commit();
    },
    runQuantize: (box) => {
      apply((pattern) => quantizeNotes(pattern, box));
      commit();
    },
    clearPattern: () => editSong((doc) => clearPatternNotes(doc.patterns[doc.current])),
    newSong: () => replaceProject(projectFrom(createBlankSong(), DEMO_BPM, 0, 0, 'Song')),
    setOnion: (on) => {
      song.onion = on ? 1 : 0;
      touch();
    },
    setRecord: (on) => {
      song.record = on ? 1 : 0;
      touch();
    },
    now: () => ctx?.currentTime ?? 0,
    peaks,
    scope,
    scopePos,
    get delay() {
      return delay;
    },
    get crush() {
      return crush;
    },
    get revision() {
      return revision;
    },
    get title() {
      return title;
    },
    setDelay,
    setCrush,
    setTitle: (name) => {
      title = name.trim().slice(0, 40) || 'Demo';
      touch();
    },
    snapshot: () => projectFrom(song, bpm, delay, crush, title, mute, solo),
    loadProject: (file) => replaceProject(file),
    exportWav: (mode) => renderProjectWav(song, bpm, mode, delay, crush),
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
  const worklet = new AudioWorkletNode(offline, 'chiptune', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: capture(copy, bpm, 1, 0, mute, solo, null),
  });
  worklet.connect(offline.destination);
  const rendered = await offline.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), sampleRate);
  return bytesToB64(wav);
}

export async function renderSongPcm(
  song: Song,
  bpm: number,
  bars: number,
  swing: number,
  delay = 0,
  crush = 0,
): Promise<{ left: Float32Array; right: Float32Array; rate: number }> {
  const copy = { ...song, playSong: 1, swing };
  const rate = 44100;
  const frames = Math.max(1, Math.round(bars * 16 * stepSeconds(bpm) * rate));
  const offline = new OfflineAudioContext(2, frames, rate);
  await offline.audioWorklet.addModule(workletUrl());
  const mute = new Uint8Array(MAX_CHANNELS);
  const solo = new Uint8Array(MAX_CHANNELS);
  const worklet = new AudioWorkletNode(offline, 'chiptune', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: capture(copy.patterns[copy.current], bpm, 1, 0, mute, solo, null, boot(copy), delay, crush),
  });
  worklet.connect(offline.destination);
  const rendered = await offline.startRendering();
  return { left: rendered.getChannelData(0), right: rendered.getChannelData(1), rate };
}

export async function renderProjectWav(
  song: Song,
  bpm: number,
  mode: 'pattern' | 'song',
  delay: number,
  crush: number,
): Promise<Uint8Array> {
  const copy = cloneSong(song);
  const steps = mode === 'song' ? orderSteps(copy) : copy.patterns[copy.current].steps;
  if (mode === 'song') {
    copy.playSong = 1;
    copy.loopStart = 0;
    copy.loopEnd = copy.orderLen;
  } else {
    copy.playSong = 0;
  }
  const rate = 44100;
  const frames = Math.max(1, Math.round(steps * stepSeconds(bpm) * rate));
  const offline = new OfflineAudioContext(2, frames, rate);
  await offline.audioWorklet.addModule(workletUrl());
  const worklet = new AudioWorkletNode(offline, 'chiptune', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: capture(copy.patterns[copy.current], bpm, 1, 0, copy.mute, copy.solo, null, boot(copy), delay, crush),
  });
  worklet.connect(offline.destination);
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), rate);
}

export async function renderGuidedWav(): Promise<string> {
  const parts = guideParts();
  const chunks: { left: Float32Array; right: Float32Array }[] = [];
  let total = 0;
  for (const part of parts) {
    const pcm = await renderSongPcm(part.song, GUIDE_BPM, part.bars, part.swing, part.delay, part.crush);
    chunks.push(pcm);
    total += pcm.left.length;
  }
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  let offset = 0;
  for (const pcm of chunks) {
    left.set(pcm.left, offset);
    right.set(pcm.right, offset);
    offset += pcm.left.length;
  }
  return bytesToB64(encodeWav(left, right, 44100));
}

