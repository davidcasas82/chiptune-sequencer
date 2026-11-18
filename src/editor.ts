import {
  clearNote,
  clearSelection,
  drumName,
  findNote,
  moveNote,
  noteName,
  penHovering,
  penStrokeVolume,
  penVolume,
  auditionPenTap,
  putNote,
  type PenSample,
  repeatTap,
  resizeNote,
  type Hit,
  type NoteTap,
} from './audio/edit';
import type { Engine } from './audio/engine';
import { audibleBand, clampAudible, dragHeldPitch, holdPitchView, inAudible, pitchSpan, strokeOnGrid, type PitchView } from './grid-stroke';
import { penMenuHold } from './pen-hold';
import { mountInspector } from './inspector';
import { ink } from './palette';
import type { Box } from './audio/song';
import { followView, inScale, rootName, scaleMask, snapNote } from './audio/song';
import {
  DRUM_COUNT,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_LONG,
  DRUM_NOTE,
  DRUM_SHORT,
  DRUM_SNARE,
  EMPTY,
  FX_INHERIT,
  PITCH_CENTER,
  MAX_CHANNELS,
  TYPE_OFF,
  SUB,
  TYPE_NOISE,
  VOL_MAX,
  cell,
  clampVol,
} from './audio/synth';

const LABEL = 84;
const GUTTER = 12;
const RULER = 16;
const MIN_STEP = 30;
const MAX_STEP = 88;
const TRACKS = [
  { name: 'Melody', code: 'P1' },
  { name: 'Harmony', code: 'P2' },
  { name: 'Bass', code: 'TRI' },
  { name: 'Drums', code: 'NSE' },
  { name: 'Extra Bass', code: 'T2' },
  { name: 'Extra Drums', code: 'N2' },
];
const DRUM_PLAIN = ['Kick', 'Snare', 'Hat', 'Short', 'Long'];
const DRUMS = [DRUM_KICK, DRUM_SNARE, DRUM_HAT, DRUM_SHORT, DRUM_LONG];
const DUTY_MARK = ['12', '25', '50', '75'];
const ARP_MARK = ['--', 'UP', 'DN', 'UD', 'RN'];
const KEYS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p'];

type Tool = 'draw' | 'select';
type Surface = 'grid' | 'roll';
type Selection = { c0: number; s0: number; c1: number; s1: number };

type Drag =
  | { kind: 'draw'; channel: number; anchor: number; note: number; drum: number; volume: number; samples: PenSample[] }
  | { kind: 'move'; fromCh: number; fromStep: number; grab: number; note: number; drum: number }
  | { kind: 'resize'; channel: number; start: number }
  | { kind: 'select'; channel: number; step: number }
  | { kind: 'bar'; axis: 'x' | 'y' };

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function mountEditor(engine: Engine): { fresh: () => void } {
  const playButton = required(document.querySelector<HTMLButtonElement>('#play'), 'play');
  const bpmInput = required(document.querySelector<HTMLInputElement>('#bpm'), 'bpm');
  const bpmOut = required(document.querySelector<HTMLOutputElement>('#bpm-out'), 'bpm-out');
  const headOut = required(document.querySelector<HTMLOutputElement>('#head'), 'head');
  const grid = required(document.querySelector<HTMLCanvasElement>('#grid'), 'grid');
  const roll = required(document.querySelector<HTMLCanvasElement>('#roll'), 'roll');
  const undoButton = required(document.querySelector<HTMLButtonElement>('#undo'), 'undo');
  const redoButton = required(document.querySelector<HTMLButtonElement>('#redo'), 'redo');
  const copyButton = required(document.querySelector<HTMLButtonElement>('#copy'), 'copy');
  const pasteButton = required(document.querySelector<HTMLButtonElement>('#paste'), 'paste');
  const deleteButton = required(document.querySelector<HTMLButtonElement>('#delete-selection'), 'delete-selection');
  const volInput = required(document.querySelector<HTMLInputElement>('#vol'), 'vol');
  const volOut = required(document.querySelector<HTMLOutputElement>('#vol-out'), 'vol-out');
  const volRead = required(document.querySelector<HTMLOutputElement>('#vol-read'), 'vol-read');
  const stepOut = required(document.querySelector<HTMLOutputElement>('#step-out'), 'step-out');
  const noteOut = required(document.querySelector<HTMLOutputElement>('#note-out'), 'note-out');
  const lenOut = required(document.querySelector<HTMLOutputElement>('#len-out'), 'len-out');
  const noteDec = required(document.querySelector<HTMLButtonElement>('#note-dec'), 'note-dec');
  const noteInc = required(document.querySelector<HTMLButtonElement>('#note-inc'), 'note-inc');
  const lenDec = required(document.querySelector<HTMLButtonElement>('#len-dec'), 'len-dec');
  const lenInc = required(document.querySelector<HTMLButtonElement>('#len-inc'), 'len-inc');
  const volDec = required(document.querySelector<HTMLButtonElement>('#vol-dec'), 'vol-dec');
  const volInc = required(document.querySelector<HTMLButtonElement>('#vol-inc'), 'vol-inc');
  const lengthButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-steps]')];
  const toolButtons = {
    draw: required(document.querySelector<HTMLButtonElement>('#tool-draw'), 'tool-draw'),
    erase: required(document.querySelector<HTMLButtonElement>('#tool-erase'), 'tool-erase'),
    select: required(document.querySelector<HTMLButtonElement>('#tool-select'), 'tool-select'),
  };
  const drumButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-drum]')];
  const channelButtons = [...document.querySelectorAll<HTMLButtonElement>('#channels [data-channel]')];
  const strips = [...document.querySelectorAll<HTMLElement>('.strip')];
  const editingOut = required(document.querySelector<HTMLElement>('#editing'), 'editing');
  const soundTitle = required(document.querySelector<HTMLElement>('#sound-title'), 'sound-title');

  let tool: Tool = 'draw';
  let channel = 0;
  let step = 0;
  let pencilNote = 72;
  let pencilDrum = DRUM_KICK;
  let pencilVol = VOL_MAX;
  let penGen = 0;
  let penHeard = -1;
  let penLifted = false;
  let penVoice: { channel: number; note: number; drums: boolean } | null = null;
  let stepW = 48;
  let keyH = 14;
  let scrollX = 0;
  let scrollY = 0;
  let heldRoll: (PitchView & { keyH: number }) | null = null;
  let customView = false;
  let selection: Selection | null = null;
  let drag: Drag | null = null;
  let hold: {
    x: number;
    y: number;
    sx: number;
    sy: number;
    t: number;
    surface: Surface;
    fired: boolean;
    pointerType: string;
    pressure: number;
  } | null = null;
  let moved = false;
  let lastTap: NoteTap | null = null;
  let tapStart: { channel: number; start: number } | null = null;
  let gesture: { x: number; y: number } | null = null;
  let mode: 'none' | 'edit' | 'pinch' = 'none';
  const points = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; midX: number; midY: number; stepW: number; keyH: number; scrollX: number; scrollY: number } | null = null;
  let octave = 4;
  const held = new Set<string>();
  let laneSig = '';
  let patButtons: HTMLButtonElement[] = [];
  let laneButtons: HTMLButtonElement[] = [];
  let follow = true;
  let followButton: HTMLButtonElement | null = null;

  const gridGfx = required(grid.getContext('2d'), 'grid');
  const rollGfx = required(roll.getContext('2d'), 'roll');

  function noise(ch = channel): boolean {
    return engine.pattern.type[ch] === TYPE_NOISE;
  }

  function noteGesture(): boolean {
    return drag?.kind === 'draw' || drag?.kind === 'move' || drag?.kind === 'resize';
  }

  function liveSpan(): { lo: number; hi: number } {
    if (noise()) return { lo: 0, hi: DRUM_COUNT - 1 };
    const span = pitchSpan(channel);
    if (!span) return { lo: 60, hi: 84 };
    return span;
  }

  function pitchWindow(): { lo: number; hi: number } {
    if (heldRoll) return { lo: heldRoll.lo, hi: heldRoll.hi };
    return liveSpan();
  }

  function freezeRoll(): void {
    if (heldRoll) return;
    const span = liveSpan();
    heldRoll = { ...holdPitchView({ lo: span.lo, hi: span.hi, scrollTop: scrollY }), keyH };
  }

  function thawRoll(): void {
    heldRoll = null;
  }

  function restoreRoll(): void {
    if (!heldRoll) return;
    scrollY = heldRoll.scrollTop;
    keyH = heldRoll.keyH;
  }

  function centerPitch(): void {
    if (heldRoll) {
      restoreRoll();
      return;
    }
    if (noise()) {
      scrollY = 0;
      return;
    }
    const band = audibleBand(channel);
    if (!band) {
      scrollY = 0;
      return;
    }
    const span = pitchWindow();
    const row = span.hi - band.center;
    const inner = Math.max(1, (roll.getBoundingClientRect().height - GUTTER) / keyH);
    scrollY = clamp(row - inner / 2, 0, maxScrollY());
  }

  function rows(): number {
    if (noise()) return DRUM_COUNT;
    const span = pitchWindow();
    return span.hi - span.lo + 1;
  }

  function pitchAt(row: number): number {
    return pitchWindow().hi - row;
  }

  function maxScrollX(): number {
    const inner = Math.max(1, grid.getBoundingClientRect().width - LABEL - GUTTER);
    return Math.max(0, engine.pattern.steps - inner / stepW);
  }

  function maxScrollY(): number {
    const inner = Math.max(1, roll.getBoundingClientRect().height - GUTTER);
    return Math.max(0, rows() - inner / keyH);
  }

  function clampView(): void {
    scrollX = clamp(scrollX, 0, maxScrollX());
    scrollY = clamp(scrollY, 0, maxScrollY());
  }

  function fit(): void {
    if (heldRoll) {
      restoreRoll();
      return;
    }
    const gridRect = grid.getBoundingClientRect();
    const rollRect = roll.getBoundingClientRect();
    if (gridRect.width < 40 || rollRect.height < 40) return;
    const fitted = (gridRect.width - LABEL - GUTTER) / engine.pattern.steps;
    stepW = fitted >= MIN_STEP ? Math.min(MAX_STEP, fitted) : MIN_STEP;
    const fittedKey = (rollRect.height - GUTTER) / rows();
    keyH = clamp(fittedKey, 11, 28);
    scrollX = 0;
    scrollY = 0;
    clampView();
    centerPitch();
  }

  function zoomBy(factor: number): void {
    customView = true;
    const inner = Math.max(1, grid.getBoundingClientRect().width - LABEL - GUTTER);
    const center = scrollX + inner / stepW / 2;
    stepW = clamp(stepW * factor, MIN_STEP, MAX_STEP);
    keyH = clamp(keyH * factor, 11, 30);
    scrollX = center - inner / stepW / 2;
    clampView();
  }

  function stepAt(canvas: HTMLCanvasElement, clientX: number): number {
    const rect = canvas.getBoundingClientRect();
    return Math.floor(scrollX + (clientX - rect.left - LABEL) / stepW);
  }

  function channelAt(clientY: number): number {
    const rect = grid.getBoundingClientRect();
    const rowH = (rect.height - RULER - GUTTER) / MAX_CHANNELS;
    return Math.floor((clientY - rect.top - RULER) / rowH);
  }

  function rollRow(clientY: number): number {
    const rect = roll.getBoundingClientRect();
    return Math.floor(scrollY + (clientY - rect.top) / keyH);
  }

  function clampStep(value: number): number {
    return clamp(value, 0, engine.pattern.steps - 1);
  }

  function volumeOf(event: PointerEvent): number {
    return penVolume(event.pointerType, event.pressure, pencilVol);
  }

  function pushPenSample(samples: PenSample[], event: PointerEvent, phase: 'down' | 'move'): void {
    if (event.pointerType !== 'pen' || event.buttons === 0) return;
    samples.push({ phase, pressure: event.pressure, t: event.timeStamp, buttons: event.buttons });
  }

  function hearPen(draw: { channel: number; note: number; drum: number; volume: number }): void {
    if (draw.volume <= penHeard) return;
    penHeard = draw.volume;
    const gen = ++penGen;
    penLifted = false;
    const channel = draw.channel;
    const note = draw.note;
    const drum = draw.drum;
    const volume = draw.volume;
    const drums = noise(channel);
    penVoice = { channel, note, drums };
    void engine.resume().then(() => {
      if (gen !== penGen) return;
      auditionPenTap(engine, channel, note, volume, drum, drums);
      if (penLifted && !drums) engine.noteOff(channel, note);
    });
  }

  function releasePen(): void {
    penLifted = true;
    const voice = penVoice;
    if (!voice || voice.drums) return;
    engine.noteOff(voice.channel, voice.note);
  }

  function startDraw(channel: number, anchor: number, note: number, drum: number, event: PointerEvent): void {
    const samples: PenSample[] = [];
    const pen = event.pointerType === 'pen';
    if (pen) {
      penHeard = -1;
      pushPenSample(samples, event, 'down');
    }
    const volume = pen ? penStrokeVolume(samples) : volumeOf(event);
    const draw = { kind: 'draw' as const, channel, anchor, note, drum, volume, samples };
    drag = draw;
    engine.preview((pattern) => putNote(pattern, channel, anchor, 1, note, volume, drum));
    if (pen) hearPen(draw);
  }

  function mask(): number {
    return scaleMask(engine.song.scale, engine.song.custom);
  }

  function snap(note: number): number {
    return snapNote(note, engine.song.root, mask());
  }

  function neighbor(note: number, dir: number): number {
    const scale = mask();
    if (scale === 0xfff) return clamp(note + dir, 0, 127);
    let next = note + dir;
    while (next >= 0 && next <= 127 && !inScale(next, engine.song.root, scale)) next += dir;
    if (next < 0 || next > 127) return note;
    return next;
  }

  function selectionBox(): Box | null {
    if (!selection) return null;
    return { c0: selection.c0, c1: selection.c1, s0: selection.s0, s1: selection.s1 };
  }

  function craftBox(): Box {
    const picked = selectionBox();
    if (picked) return picked;
    return { c0: channel, c1: channel, s0: 0, s1: Math.max(0, engine.pattern.steps - 1) };
  }

  function fresh(): void {
    tool = 'draw';
    selection = null;
    lastTap = null;
    tapStart = null;
    drag = null;
    moved = false;
    follow = true;
  }

  function placeNote(ch: number, row: number): { note: number; drum: number } {
    if (noise(ch)) {
      const drum = row >= 0 && row < DRUM_COUNT ? DRUMS[row] : pencilDrum;
      return { note: DRUM_NOTE, drum };
    }
    const note = row >= 0 ? pitchAt(row) : pencilNote;
    return { note: clampAudible(ch, snap(clamp(note, 0, 127))), drum: pencilDrum };
  }

  function gridPart(ch: number, at: number, clientX: number): 'empty' | 'body' | 'edge' {
    const found = findNote(engine.pattern, ch, at);
    if (!found) return 'empty';
    const rect = grid.getBoundingClientRect();
    const endX = LABEL + (found.start + found.length - scrollX) * stepW;
    if (clientX - rect.left > endX - Math.min(12, stepW * 0.35)) return 'edge';
    return 'body';
  }

  function rollHit(clientX: number, clientY: number): { step: number; row: number; part: 'empty' | 'body' | 'edge'; found: Hit | null } {
    const at = clampStep(stepAt(roll, clientX));
    const row = rollRow(clientY);
    const found = findNote(engine.pattern, channel, at);
    if (!found) return { step: at, row, part: 'empty', found: null };
    const noteRow = noise() ? found.drum : pitchWindow().hi - found.note;
    if (noteRow !== row) return { step: at, row, part: 'empty', found: null };
    const rect = roll.getBoundingClientRect();
    const endX = LABEL + (found.start + found.length - scrollX) * stepW;
    const part = clientX - rect.left > endX - Math.min(12, stepW * 0.35) ? 'edge' : 'body';
    return { step: at, row, part, found };
  }

  function remember(found: Hit | null): void {
    if (!found) return;
    if (!noise()) pencilNote = found.note;
    pencilDrum = found.drum;
    pencilVol = found.volume;
  }

  function finish(): void {
    if (!drag) return;
    if (drag.kind === 'move' && !moved) engine.cancel();
    else if (drag.kind === 'resize' && !moved) engine.cancel();
    else if (drag.kind !== 'select' && drag.kind !== 'bar') engine.commit();
    drag = null;
    moved = false;
  }

  function startEdit(surface: Surface, event: PointerEvent): void {
    const canvas = surface === 'grid' ? grid : roll;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (surface === 'grid' && y >= rect.height - GUTTER && x >= LABEL) {
      drag = { kind: 'bar', axis: 'x' };
      customView = true;
      return;
    }
    if (surface === 'roll' && x >= rect.width - GUTTER) {
      drag = { kind: 'bar', axis: 'y' };
      customView = true;
      return;
    }
    if (x < LABEL) {
      if (surface === 'grid') {
        const ch = channelAt(event.clientY);
        if (ch >= 0 && ch < MAX_CHANNELS) channel = ch;
      }
      return;
    }
    if (surface === 'grid' && y < RULER) {
      step = clampStep(stepAt(grid, event.clientX));
      return;
    }

    if (surface === 'grid') {
      const ch = channelAt(event.clientY);
      const at = clampStep(stepAt(grid, event.clientX));
      if (ch < 0 || ch >= MAX_CHANNELS) return;
      channel = ch;
      step = at;
      const found = findNote(engine.pattern, ch, at);
      remember(found);
      tapStart = found ? { channel: ch, start: found.start } : null;
      if (tool === 'select') {
        drag = { kind: 'select', channel: ch, step: at };
        selection = { c0: ch, s0: at, c1: ch, s1: at };
        return;
      }
      const part = gridPart(ch, at, event.clientX);
      if (part === 'body' && found) {
        drag = { kind: 'move', fromCh: ch, fromStep: found.start, grab: at - found.start, note: found.note, drum: found.drum };
        return;
      }
      if (part === 'edge' && found) {
        drag = { kind: 'resize', channel: ch, start: found.start };
        return;
      }
      const placed = noise(ch) ? { note: DRUM_NOTE, drum: pencilDrum } : { note: pencilNote, drum: pencilDrum };
      startDraw(ch, at, placed.note, placed.drum, event);
      return;
    }

    const hit = rollHit(event.clientX, event.clientY);
    step = hit.step;
    remember(hit.found);
    tapStart = hit.found ? { channel, start: hit.found.start } : null;
    if (tool === 'select') {
      drag = { kind: 'select', channel, step: hit.step };
      selection = { c0: channel, s0: hit.step, c1: channel, s1: hit.step };
      return;
    }
    if (hit.part === 'body' && hit.found) {
      drag = {
        kind: 'move',
        fromCh: channel,
        fromStep: hit.found.start,
        grab: hit.step - hit.found.start,
        note: hit.found.note,
        drum: hit.found.drum,
      };
      return;
    }
    if (hit.part === 'edge' && hit.found) {
      drag = { kind: 'resize', channel, start: hit.found.start };
      return;
    }
    const placed = placeNote(channel, hit.row);
    pencilNote = placed.note;
    pencilDrum = placed.drum;
    startDraw(channel, hit.step, placed.note, placed.drum, event);
  }

  function moveEdit(surface: Surface, event: PointerEvent): void {
    if (!drag) return;
    if (heldRoll && drag.kind !== 'bar') restoreRoll();
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 0) moved = true;
    if (drag.kind === 'bar') {
      customView = true;
      if (drag.axis === 'x') {
        const rect = grid.getBoundingClientRect();
        const inner = rect.width - LABEL - GUTTER;
        const span = engine.pattern.steps * stepW;
        const thumb = Math.max(20, inner * (inner / Math.max(inner, span)));
        const travel = Math.max(1, inner - thumb);
        const ratio = clamp((event.clientX - rect.left - LABEL - thumb / 2) / travel, 0, 1);
        scrollX = ratio * maxScrollX();
      } else {
        const rect = roll.getBoundingClientRect();
        const inner = rect.height - GUTTER;
        const span = rows() * keyH;
        const thumb = Math.max(20, inner * (inner / Math.max(inner, span)));
        const travel = Math.max(1, inner - thumb);
        const ratio = clamp((event.clientY - rect.top - thumb / 2) / travel, 0, 1);
        scrollY = ratio * maxScrollY();
      }
      return;
    }
    const at = clampStep(stepAt(surface === 'grid' ? grid : roll, event.clientX));
    step = at;
    if (drag.kind === 'select') {
      const ch = surface === 'grid' ? channelAt(event.clientY) : channel;
      selection = { c0: drag.channel, s0: drag.step, c1: clamp(ch, 0, MAX_CHANNELS - 1), s1: at };
      return;
    }
    if (!moved && (drag.kind === 'move' || drag.kind === 'resize')) return;
    if (drag.kind === 'draw') {
      if (event.pointerType === 'pen' && event.type !== 'pointerup' && event.type !== 'pointercancel') {
        pushPenSample(drag.samples, event, 'move');
        const next = penStrokeVolume(drag.samples);
        if (next > drag.volume) drag.volume = next;
        hearPen(drag);
      }
      const ch = drag.channel;
      const a = Math.min(drag.anchor, at);
      const len = Math.abs(at - drag.anchor) + 1;
      let note = drag.note;
      let drum = drag.drum;
      if (surface === 'roll') {
        restoreRoll();
        const around = liveSpan();
        const proposed: PitchView = {
          lo: drag.note - 12,
          hi: drag.note + 12,
          scrollTop: scrollY + 1,
        };
        const held = heldRoll
          ? dragHeldPitch(
            { lo: heldRoll.lo, hi: heldRoll.hi, scrollTop: heldRoll.scrollTop },
            drag.note,
            proposed,
          )
          : { view: { lo: around.lo, hi: around.hi, scrollTop: scrollY }, pitch: drag.note };
        if (heldRoll) {
          heldRoll.scrollTop = held.view.scrollTop;
          heldRoll.lo = held.view.lo;
          heldRoll.hi = held.view.hi;
        }
        scrollY = held.view.scrollTop;
        note = clampAudible(ch, held.pitch);
        drum = drag.drum;
        drag.note = note;
        pencilNote = note;
        pencilDrum = drum;
      }
      const volume = drag.volume;
      engine.preview((pattern) => putNote(pattern, ch, a, len, note, volume, drum));
      return;
    }
    if (drag.kind === 'resize') {
      const resizeChannel = drag.channel;
      const resizeStart = drag.start;
      engine.preview((pattern) => resizeNote(pattern, resizeChannel, resizeStart, at - resizeStart + 1));
      return;
    }
    const ch = surface === 'grid' ? clamp(channelAt(event.clientY), 0, MAX_CHANNELS - 1) : drag.fromCh;
    let note = drag.note;
    let drum = drag.drum;
    const sourceNoise = noise(drag.fromCh);
    const destNoise = noise(ch);
    if (destNoise) {
      note = DRUM_NOTE;
      drum = sourceNoise ? drag.drum : pencilDrum;
      if (surface === 'roll') drum = placeNote(ch, rollRow(event.clientY)).drum;
    } else if (sourceNoise) {
      note = pencilNote;
      if (surface === 'roll') note = placeNote(ch, rollRow(event.clientY)).note;
    } else if (surface === 'roll') {
      restoreRoll();
      note = placeNote(ch, rollRow(event.clientY)).note;
    }
    const fromCh = drag.fromCh;
    const fromStep = drag.fromStep;
    const dest = clampStep(at - drag.grab);
    engine.preview((pattern) => moveNote(pattern, fromCh, fromStep, ch, dest, note, drum));
  }

  function updatePinch(event: PointerEvent): void {
    const list = [...points.values()];
    if (list.length < 2) return;
    const a = list[0];
    const b = list[1];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (!pinch) {
      pinch = { dist, midX, midY, stepW, keyH, scrollX, scrollY };
      return;
    }
    customView = true;
    const scale = dist / pinch.dist;
    stepW = clamp(pinch.stepW * scale, MIN_STEP, MAX_STEP);
    keyH = clamp(pinch.keyH * scale, 11, 30);
    const canvas = event.currentTarget instanceof HTMLCanvasElement ? event.currentTarget : grid;
    const rect = canvas.getBoundingClientRect();
    const content = pinch.scrollX + (pinch.midX - rect.left - LABEL) / pinch.stepW;
    scrollX = content - (midX - rect.left - LABEL) / stepW;
    scrollY = pinch.scrollY - (midY - pinch.midY) / keyH;
    clampView();
  }

  function bind(canvas: HTMLCanvasElement, surface: Surface): void {
    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.preventDefault();
      if (penHovering(event.pointerType, event.buttons)) {
        points.delete(event.pointerId);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        return;
      }
      if (points.size >= 2) {
        if (mode === 'edit') {
          engine.cancel();
          drag = null;
        }
        thawRoll();
        mode = 'pinch';
        hold = null;
        pinch = null;
        updatePinch(event);
        return;
      }
      if (mode === 'pinch') return;
      mode = 'edit';
      moved = false;
      tapStart = null;
      gesture = { x: event.clientX, y: event.clientY };
      startEdit(surface, event);
      if (surface === 'roll' && noteGesture()) freezeRoll();
      hold = {
        x: event.clientX,
        y: event.clientY,
        sx: event.clientX,
        sy: event.clientY,
        t: performance.now(),
        surface,
        fired: false,
        pointerType: event.pointerType,
        pressure: event.pressure,
      };
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (hold && !hold.fired) {
        hold.x = event.clientX;
        hold.y = event.clientY;
        const movedPx = Math.hypot(hold.x - hold.sx, hold.y - hold.sy);
        const pressure = event.pointerType === 'pen' ? event.pressure : hold.pressure;
        if (!penMenuHold({
          pointerType: hold.pointerType,
          startPressure: hold.pressure,
          pressure,
          movedPx,
        })) hold = null;
      }
      if (mode === 'pinch') {
        updatePinch(event);
        return;
      }
      if (event.pointerType === 'pen' || event.pointerType === 'touch') event.preventDefault();
      if (mode === 'edit') moveEdit(surface, event);
    });
    const blockNativeScroll = (event: TouchEvent) => {
      event.preventDefault();
    };
    canvas.addEventListener('touchstart', blockNativeScroll, { passive: false });
    canvas.addEventListener('touchmove', blockNativeScroll, { passive: false });
    const end = (event: PointerEvent) => {
      points.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (points.size === 0) {
        const opened = hold?.fired === true;
        const travel = gesture ? Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) : 99;
        const tap = mode === 'edit' && !opened && travel <= 12 && event.type !== 'pointercancel';
        const now = performance.now();
        if (mode === 'edit' && !opened && drag?.kind === 'draw' && event.pointerType === 'pen' && event.type !== 'pointercancel') hearPen(drag);
        if (mode === 'edit' && drag?.kind === 'draw' && event.pointerType === 'pen') releasePen();
        if (mode === 'edit' && !opened && drag?.kind === 'draw' && event.type !== 'pointercancel') moveEdit(surface, event);
        if (mode === 'edit' && !opened) {
          if (tap && drag && (drag.kind === 'move' || drag.kind === 'resize')) {
            engine.cancel();
            drag = null;
            moved = false;
          } else finish();
        }
        if (tap && tapStart && repeatTap(lastTap, now, tapStart.channel, tapStart.start)) {
          const hit = tapStart;
          engine.apply((pattern) => clearNote(pattern, hit.channel, hit.start));
          engine.commit();
          lastTap = null;
        } else if (tap && tapStart) {
          lastTap = { at: now, channel: tapStart.channel, start: tapStart.start };
        } else lastTap = null;
        thawRoll();
        mode = 'none';
        pinch = null;
        drag = null;
        hold = null;
        tapStart = null;
        gesture = null;
        return;
      }
      if (mode === 'pinch') pinch = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (heldRoll) return;
      customView = true;
      if (event.ctrlKey) {
        zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
        return;
      }
      const dx = (event.shiftKey ? event.deltaY : event.deltaX) / stepW;
      const dy = (event.shiftKey ? 0 : event.deltaY) / keyH;
      scrollX += dx;
      if (surface === 'roll') scrollY += dy;
      clampView();
    }, { passive: false });
  }

  function doCopy(): void {
    if (selection) engine.copy(selection.c0, selection.s0, selection.c1, selection.s1);
    else engine.copy(channel, step, channel, step);
  }

  function doPaste(): void {
    const ch = selection ? Math.min(selection.c0, selection.c1) : channel;
    const at = selection ? Math.min(selection.s0, selection.s1) : step;
    engine.paste(ch, at);
  }

  function doDelete(): void {
    if (!selection) return;
    const box = selection;
    engine.apply((pattern) => {
      clearSelection(pattern, box);
    });
    engine.commit();
  }

  function writeSelected(edit: (found: Hit) => void): void {
    const found = findNote(engine.pattern, channel, step);
    if (!found) return;
    engine.apply(() => edit(found));
    engine.commit();
  }

  async function togglePlay(): Promise<void> {
    await engine.resume();
    if (engine.playing) engine.stop();
    else await engine.play();
  }

  async function onDrum(drum: number): Promise<void> {
    pencilDrum = drum;
    if (!noise()) channel = 3;
    const voice = channel;
    const at = step;
    await engine.resume();
    engine.hit(drum, pencilVol, voice);
    engine.apply((pattern) => putNote(pattern, voice, at, 1, DRUM_NOTE, pencilVol, drum));
    engine.commit();
    step = Math.min(engine.pattern.steps - 1, at + 1);
  }

  function setOn(element: HTMLElement, on: boolean): void {
    const next = on ? '1' : '0';
    if (element.dataset.on !== next) element.dataset.on = next;
    if (element instanceof HTMLButtonElement) {
      const pressed = on ? 'true' : 'false';
      if (element.getAttribute('aria-pressed') !== pressed) element.setAttribute('aria-pressed', pressed);
    }
  }

  function sync(): void {
    const playing = engine.playing ? 'Stop' : 'Play';
    if (playButton.textContent !== playing) playButton.textContent = playing;
    setOn(playButton, engine.playing);
    if (document.activeElement !== bpmInput) bpmInput.value = String(engine.bpm);
    bpmOut.textContent = String(engine.bpm);
    const live = engine.localStep();
    const cursor = live >= 0 ? live : step;
    headOut.textContent = String(cursor < 0 ? 0 : cursor).padStart(2, '0');
    stepOut.textContent = String(step).padStart(2, '0');
    const found = findNote(engine.pattern, channel, step);
    noteOut.textContent = noise() ? drumName(found ? found.drum : pencilDrum) : noteName(found ? found.note : pencilNote);
    lenOut.textContent = String(found ? found.length : 1).padStart(2, '0');
    const shown = found ? found.volume : pencilVol;
    const hex = shown.toString(16).toUpperCase();
    volOut.textContent = hex;
    volRead.textContent = hex.padStart(2, '0');
    if (document.activeElement !== volInput) volInput.value = String(shown);
    noteDec.disabled = noise();
    noteInc.disabled = noise();
    undoButton.disabled = !engine.canUndo;
    redoButton.disabled = !engine.canRedo;
    pasteButton.disabled = !engine.hasClip;
    deleteButton.disabled = selection === null;
    for (const button of lengthButtons) setOn(button, Number(button.dataset.steps) === engine.pattern.steps);
    setOn(toolButtons.draw, tool === 'draw');
    setOn(toolButtons.erase, false);
    setOn(toolButtons.select, tool === 'select');
    for (const button of drumButtons) setOn(button, Number(button.dataset.drum) === pencilDrum);
    for (const button of channelButtons) setOn(button, Number(button.dataset.channel) === channel);
    const track = TRACKS[channel] ?? TRACKS[0];
    const editing = `Editing: ${track.name}`;
    if (editingOut.textContent !== editing) editingOut.textContent = editing;
    const sound = `Sound for ${track.name}`;
    if (soundTitle.textContent !== sound) soundTitle.textContent = sound;
    strips.forEach((strip, index) => {
      const muted = engine.mute[index] === 1;
      const soloed = engine.solo[index] === 1;
      if (strip.dataset.mute !== (muted ? '1' : '0')) strip.dataset.mute = muted ? '1' : '0';
      if (strip.dataset.solo !== (soloed ? '1' : '0')) strip.dataset.solo = soloed ? '1' : '0';
      const muteButton = strip.querySelector<HTMLButtonElement>('[data-mute]');
      const soloButton = strip.querySelector<HTMLButtonElement>('[data-solo]');
      if (muteButton) setOn(muteButton, muted);
      if (soloButton) setOn(soloButton, soloed);
    });
    const doc = engine.song;
    patOut.textContent = String(doc.current + 1).padStart(2, '0');
    setOn(required(document.querySelector<HTMLButtonElement>('#mode-pat'), 'mode-pat'), doc.playSong === 0);
    setOn(required(document.querySelector<HTMLButtonElement>('#mode-song'), 'mode-song'), doc.playSong === 1);
    if (followButton) setOn(followButton, follow);
    rebuildLane();
    const playingEntry = engine.orderNow();
    patButtons.forEach((button, index) => setOn(button, index === doc.current));
    laneButtons.forEach((button, index) => {
      setOn(button, index === doc.entry);
      button.dataset.play = playingEntry === index ? '1' : '0';
      button.dataset.loop = index >= doc.loopStart && index < doc.loopEnd ? '1' : '0';
    });
    const entry = doc.entry;
    repOut.textContent = String(doc.orderRep[entry] || 1);
    const tr = doc.orderTr[entry] || 0;
    trOut.textContent = `${tr >= 0 ? '+' : ''}${tr}`;
    setOn(required(document.querySelector<HTMLButtonElement>('#mark'), 'mark'), doc.marker[entry] === 1);
    for (const button of scaleButtons) setOn(button, Number(button.dataset.scale) === doc.scale);
    rootOut.textContent = rootName(doc.root);
    pcs.hidden = doc.scale !== 4;
    pcButtons.forEach((button, index) => setOn(button, (doc.custom & (1 << index)) !== 0));
    if (document.activeElement !== swingInput) swingInput.value = String(doc.swing);
    swingOut.textContent = String(doc.swing);
    setOn(required(document.querySelector<HTMLButtonElement>('#onion'), 'onion'), doc.onion === 1);
    setOn(required(document.querySelector<HTMLButtonElement>('#rec'), 'rec'), doc.record === 1);
  }

  function size(canvas: HTMLCanvasElement, gfx: CanvasRenderingContext2D): { w: number; h: number } {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const sx = width / Math.max(1, rect.width);
    const sy = height / Math.max(1, rect.height);
    gfx.setTransform(sx, 0, 0, sy, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function dimmed(ch: number): boolean {
    let any = false;
    for (let i = 0; i < MAX_CHANNELS; i++) if (engine.solo[i]) any = true;
    if (engine.mute[ch]) return true;
    return any && engine.solo[ch] === 0;
  }

  function paintGrid(): void {
    const { w, h } = size(grid, gridGfx);
    const gfx = gridGfx;
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    const innerH = h - RULER - GUTTER;
    const rowH = innerH / MAX_CHANNELS;
    const steps = engine.pattern.steps;
    const head = engine.localStep();
    const first = Math.max(0, Math.floor(scrollX));
    const last = Math.min(steps, Math.ceil(scrollX + (w - LABEL - GUTTER) / stepW) + 1);
    for (let at = first; at < last; at++) {
      const x = LABEL + (at - scrollX) * stepW;
      if (Math.floor(at / 4) % 2 === 0) {
        gfx.fillStyle = ink.alt;
        gfx.fillRect(x, RULER, stepW, innerH);
      }
    }
    gfx.strokeStyle = ink.grid;
    gfx.lineWidth = 1;
    gfx.beginPath();
    for (let at = first; at <= last; at++) {
      const x = LABEL + (at - scrollX) * stepW;
      gfx.moveTo(x, RULER);
      gfx.lineTo(x, RULER + innerH);
    }
    gfx.stroke();
    gfx.save();
    gfx.beginPath();
    gfx.rect(LABEL, RULER, Math.max(0, w - LABEL - GUTTER), innerH);
    gfx.clip();
    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      const y = RULER + ch * rowH;
      for (let at = 0; at < steps; at++) {
        const index = cell(ch, at);
        if (engine.pattern.note[index] === EMPTY) continue;
        const len = engine.pattern.length[index];
        const x = LABEL + (at + engine.pattern.nudge[index] / SUB - scrollX) * stepW;
        const live = head >= at && head < at + len;
        gfx.fillStyle = dimmed(ch) ? ink.dim : live ? ink.live : ink.green;
        const noteX = x + 2;
        const noteY = y + 3;
        const noteW = Math.max(4, len * stepW - 4);
        const noteH = rowH - 6;
        gfx.fillRect(noteX, noteY, noteW, noteH);
        paintLoudness(gfx, noteX, noteY, noteW, noteH, engine.pattern.volume[index]);
        if (effectLabel(ch, index)) {
          gfx.fillStyle = ink.amber;
          gfx.fillRect(x + 2, y + rowH - 5, Math.max(4, Math.min(stepW, len * stepW) - 4), 2);
        }
        if (stepW < 28) continue;
        const name = engine.pattern.type[ch] === TYPE_NOISE ? drumName(engine.pattern.drum[index]) : noteName(engine.pattern.note[index]);
        const fx = effectLabel(ch, index);
        const meta = engine.pattern.length[index].toString(16).toUpperCase().padStart(2, '0')
          + ' '
          + engine.pattern.volume[index].toString(16).toUpperCase()
          + (fx && stepW >= 52 ? ' ' + fx : '');
        gfx.fillStyle = ink.ink;
        gfx.textAlign = 'left';
        gfx.textBaseline = 'middle';
        gfx.font = stepW >= 44 ? '12px ui-monospace, monospace' : '10px ui-monospace, monospace';
        gfx.fillText(name, x + 5, y + rowH * 0.36);
        if (rowH > 40) gfx.fillText(meta, x + 5, y + rowH * 0.7);
      }
    }
    gfx.restore();
    gfx.textBaseline = 'top';
    gfx.textAlign = 'left';
    for (let ch = 0; ch < MAX_CHANNELS; ch++) {
      const y = RULER + ch * rowH;
      const track = TRACKS[ch] ?? TRACKS[0];
      gfx.fillStyle = ch === channel ? ink.fill : ink.bg;
      gfx.fillRect(0, y, LABEL, rowH);
      const off = engine.pattern.type[ch] === TYPE_OFF;
      gfx.fillStyle = ch === channel ? ink.amber : off ? ink.dim : ink.amberDim;
      gfx.font = '10px ui-monospace, monospace';
      gfx.fillText(track.name, 8, y + 2);
      gfx.font = '8px ui-monospace, monospace';
      gfx.fillStyle = ch === channel ? ink.amber : ink.amberDim;
      gfx.fillText(track.code, 8, y + 13);
      if (ch === channel) {
        gfx.fillStyle = ink.amber;
        gfx.fillRect(0, y, 3, rowH);
      }
      gfx.strokeStyle = ink.line;
      gfx.beginPath();
      gfx.moveTo(0, y + rowH);
      gfx.lineTo(w - GUTTER, y + rowH);
      gfx.stroke();
    }
    if (head >= 0) {
      gfx.fillStyle = ink.amber;
      gfx.fillRect(LABEL + (head - scrollX) * stepW, RULER, 2, innerH);
    }
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, RULER);
    gfx.textAlign = 'center';
    gfx.fillStyle = ink.amber;
    for (let at = first; at < last; at++) {
      if (at % 4 !== 0 && stepW < 36) continue;
      gfx.fillText(String(at).padStart(2, '0'), LABEL + (at - scrollX) * stepW + stepW / 2, RULER / 2);
    }
    const mark = LABEL + (step - scrollX) * stepW;
    gfx.strokeStyle = ink.green;
    gfx.strokeRect(mark + 1, RULER + channel * rowH + 1, stepW - 2, rowH - 2);
    if (selection) {
      const c0 = Math.min(selection.c0, selection.c1);
      const c1 = Math.max(selection.c0, selection.c1);
      const s0 = Math.min(selection.s0, selection.s1);
      const s1 = Math.max(selection.s0, selection.s1);
      gfx.strokeStyle = ink.amber;
      gfx.lineWidth = 2;
      gfx.strokeRect(
        LABEL + (s0 - scrollX) * stepW + 1,
        RULER + c0 * rowH + 1,
        (s1 - s0 + 1) * stepW - 2,
        (c1 - c0 + 1) * rowH - 2,
      );
    }
    paintBar(gfx, w, h, true);
  }

  function paintRoll(): void {
    const { w, h } = size(roll, rollGfx);
    const gfx = rollGfx;
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    const drum = noise();
    const count = rows();
    const span = pitchWindow();
    const steps = engine.pattern.steps;
    const head = engine.localStep();
    const scale = mask();
    const locked = scale !== 0xfff;
    const first = Math.max(0, Math.floor(scrollY) - 1);
    const visible = Math.ceil((h - GUTTER) / keyH) + 2;
    for (let row = first; row < first + visible && row < count + 2; row++) {
      if (row < 0) continue;
      const y = (row - scrollY) * keyH;
      let alt = row % 2 === 1;
      let outside = false;
      if (!drum && row >= 0 && row < count) {
        const pitch = span.hi - row;
        const pc = ((pitch % 12) + 12) % 12;
        alt = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
        outside = (locked && !inScale(pitch, engine.song.root, scale)) || !inAudible(channel, pitch);
      }
      gfx.fillStyle = outside ? ink.outside : alt ? ink.black : ink.alt;
      gfx.fillRect(LABEL, y, Math.max(0, w - LABEL - GUTTER), keyH);
    }
    gfx.save();
    gfx.beginPath();
    gfx.rect(LABEL, 0, Math.max(0, w - LABEL - GUTTER), Math.max(0, h - GUTTER));
    gfx.clip();
    if (engine.song.onion && !drum) {
      for (let ch = 0; ch < MAX_CHANNELS; ch++) {
        if (ch === channel || engine.pattern.type[ch] === TYPE_NOISE) continue;
        for (let at = 0; at < steps; at++) {
          const index = cell(ch, at);
          const note = engine.pattern.note[index];
          if (note === EMPTY) continue;
          const row = span.hi - note;
          const x = LABEL + (at + engine.pattern.nudge[index] / SUB - scrollX) * stepW;
          const y = (row - scrollY) * keyH;
          gfx.fillStyle = ink.ghost;
          gfx.fillRect(x + 1, y + 2, Math.max(4, engine.pattern.length[index] * stepW - 2), Math.max(4, keyH - 4));
        }
      }
    }
    for (let at = 0; at < steps; at++) {
      const index = cell(channel, at);
      if (engine.pattern.note[index] === EMPTY) continue;
      const row = drum ? engine.pattern.drum[index] : span.hi - engine.pattern.note[index];
      const x = LABEL + (at + engine.pattern.nudge[index] / SUB - scrollX) * stepW;
      const y = (row - scrollY) * keyH;
      const len = engine.pattern.length[index];
      const live = head >= at && head < at + len;
      gfx.fillStyle = dimmed(channel) ? ink.dim : live ? ink.live : ink.green;
      const noteX = x + 1;
      const noteY = y + 2;
      const noteW = Math.max(4, len * stepW - 2);
      const noteH = Math.max(4, keyH - 4);
      gfx.fillRect(noteX, noteY, noteW, noteH);
      paintLoudness(gfx, noteX, noteY, noteW, noteH, engine.pattern.volume[index]);
      if (effectLabel(channel, index)) {
        gfx.fillStyle = ink.amber;
        gfx.fillRect(x + 1, y + keyH - 3, Math.min(8, stepW - 2), 2);
      }
      if (engine.pattern.length[index] * stepW < 28) continue;
      gfx.fillStyle = ink.ink;
      gfx.font = '11px ui-monospace, monospace';
      gfx.textAlign = 'left';
      gfx.textBaseline = 'middle';
      const label = drum ? drumName(engine.pattern.drum[index]) : noteName(engine.pattern.note[index]);
      gfx.fillText(label, x + 4, y + keyH / 2);
    }
    gfx.restore();
    if (head >= 0) {
      gfx.fillStyle = ink.amber;
      gfx.fillRect(LABEL + (head - scrollX) * stepW, 0, 2, h - GUTTER);
    }
    gfx.textBaseline = 'middle';
    gfx.textAlign = 'left';
    for (let row = 0; row < count; row++) {
      const y = (row - scrollY) * keyH;
      if (y + keyH < 0 || y > h) continue;
      if (drum) {
        gfx.fillStyle = ink.bg;
        gfx.fillRect(0, y, LABEL, keyH);
        gfx.fillStyle = ink.amber;
        gfx.font = '11px ui-monospace, monospace';
        gfx.fillText(DRUM_PLAIN[row] ?? 'Kick', 6, y + keyH / 2);
        continue;
      }
      const pitch = span.hi - row;
      const octaveMark = pitch % 12 === 0;
      if (keyH < 16 && !octaveMark) continue;
      gfx.fillStyle = octaveMark ? ink.alt : ink.bg;
      gfx.fillRect(0, y, LABEL, keyH);
      const out = locked && !inScale(pitch, engine.song.root, scale);
      gfx.fillStyle = out ? ink.amberMute : octaveMark ? ink.amber : ink.amberMid;
      gfx.font = keyH >= 16 ? '11px ui-monospace, monospace' : '10px ui-monospace, monospace';
      const name = noteName(pitch);
      gfx.fillText(name, 4, y + keyH / 2);
      if (!octaveMark) continue;
      gfx.font = '9px ui-monospace, monospace';
      gfx.fillStyle = out ? ink.amberMute : ink.amberDim;
      gfx.fillText('octave', 24, y + keyH / 2);
    }
    if (selection && channel >= Math.min(selection.c0, selection.c1) && channel <= Math.max(selection.c0, selection.c1)) {
      const s0 = Math.min(selection.s0, selection.s1);
      const s1 = Math.max(selection.s0, selection.s1);
      gfx.strokeStyle = ink.amber;
      gfx.lineWidth = 2;
      gfx.strokeRect(LABEL + (s0 - scrollX) * stepW + 1, 1, (s1 - s0 + 1) * stepW - 2, h - GUTTER - 2);
    }
    paintBar(gfx, w, h, false);
  }

  function paintLoudness(
    gfx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    volume: number,
  ): void {
    const barH = height >= 14 ? 5 : 3;
    if (width < 8 || height < barH + 2) return;
    const inset = 2;
    const trackW = width - inset * 2;
    const barY = y + height - barH - 2;
    gfx.fillStyle = ink.bg;
    gfx.fillRect(x + inset, barY, trackW, barH);
    const level = clampVol(volume) / VOL_MAX;
    if (level <= 0) return;
    gfx.fillStyle = ink.amber;
    gfx.fillRect(x + inset, barY, Math.min(trackW, Math.max(2, Math.round(trackW * level))), barH);
  }

  function paintBar(gfx: CanvasRenderingContext2D, w: number, h: number, horizontal: boolean): void {
    if (horizontal) {
      const inner = Math.max(1, w - LABEL - GUTTER);
      const spanPx = engine.pattern.steps * stepW;
      gfx.fillStyle = ink.grid;
      gfx.fillRect(LABEL, h - GUTTER, inner, GUTTER);
      if (spanPx <= inner + 1) return;
      const thumb = Math.max(20, inner * (inner / spanPx));
      const travel = Math.max(1, inner - thumb);
      const x = LABEL + (scrollX * stepW / Math.max(1, spanPx - inner)) * travel;
      gfx.fillStyle = ink.amber;
      gfx.fillRect(x, h - GUTTER + 2, thumb, GUTTER - 4);
      return;
    }
    const inner = Math.max(1, h - GUTTER);
    const spanPx = rows() * keyH;
    gfx.fillStyle = ink.grid;
    gfx.fillRect(w - GUTTER, 0, GUTTER, inner);
    if (spanPx <= inner + 1) return;
    const thumb = Math.max(20, inner * (inner / spanPx));
    const travel = Math.max(1, inner - thumb);
    const y = (scrollY * keyH / Math.max(1, spanPx - inner)) * travel;
    gfx.fillStyle = ink.amber;
    gfx.fillRect(w - GUTTER + 2, y, GUTTER - 4, thumb);
  }

  bind(grid, 'grid');
  bind(roll, 'roll');

  document.addEventListener('pointerdown', () => {
    void engine.resume();
  });

  playButton.addEventListener('click', () => {
    void togglePlay();
  });
  bpmInput.addEventListener('input', () => {
    engine.setBpm(Number(bpmInput.value));
    bpmOut.textContent = String(engine.bpm);
  });
  for (const button of lengthButtons) {
    button.addEventListener('click', () => {
      engine.setSteps(Number(button.dataset.steps));
      if (!customView) fit();
    });
  }
  required(document.querySelector<HTMLButtonElement>('#prev'), 'prev').addEventListener('click', () => {
    customView = true;
    scrollX -= 16;
    clampView();
  });
  required(document.querySelector<HTMLButtonElement>('#next'), 'next').addEventListener('click', () => {
    customView = true;
    scrollX += 16;
    clampView();
  });
  undoButton.addEventListener('click', () => engine.undo());
  redoButton.addEventListener('click', () => engine.redo());
  copyButton.addEventListener('click', doCopy);
  pasteButton.addEventListener('click', doPaste);
  deleteButton.addEventListener('click', () => {
    lastTap = null;
    doDelete();
  });
  toolButtons.draw.addEventListener('click', () => {
    tool = 'draw';
    lastTap = null;
  });
  toolButtons.erase.addEventListener('click', () => {
    tool = 'draw';
    lastTap = null;
    const found = findNote(engine.pattern, channel, step);
    if (!found) return;
    engine.apply((pattern) => clearNote(pattern, channel, found.start));
    engine.commit();
  });
  toolButtons.select.addEventListener('click', () => {
    tool = 'select';
  });
  volInput.addEventListener('pointerdown', () => engine.begin());
  volInput.addEventListener('input', () => {
    pencilVol = clampVol(Number(volInput.value));
    const found = findNote(engine.pattern, channel, step);
    if (!found) return;
    engine.apply((pattern) => {
      pattern.volume[cell(channel, found.start)] = pencilVol;
    });
  });
  volInput.addEventListener('pointerup', () => engine.commit());
  volInput.addEventListener('pointercancel', () => engine.commit());
  for (const button of drumButtons) {
    button.addEventListener('click', () => {
      void onDrum(Number(button.dataset.drum));
    });
  }
  required(document.querySelector<HTMLButtonElement>('#zoom-out'), 'zoom-out').addEventListener('click', () => zoomBy(1 / 1.15));
  required(document.querySelector<HTMLButtonElement>('#zoom-in'), 'zoom-in').addEventListener('click', () => zoomBy(1.15));
  required(document.querySelector<HTMLButtonElement>('#fit'), 'fit').addEventListener('click', () => {
    customView = false;
    fit();
  });
  for (const button of channelButtons) {
    button.addEventListener('click', () => {
      channel = Number(button.dataset.channel);
      scrollY = 0;
    });
  }
  noteDec.addEventListener('click', () => {
    const found = findNote(engine.pattern, channel, step);
    if (!found) {
      pencilNote = neighbor(pencilNote, -1);
      return;
    }
    const next = neighbor(found.note, -1);
    pencilNote = next;
    writeSelected(() => {
      engine.pattern.note[cell(channel, found.start)] = next;
    });
  });
  noteInc.addEventListener('click', () => {
    const found = findNote(engine.pattern, channel, step);
    if (!found) {
      pencilNote = neighbor(pencilNote, 1);
      return;
    }
    const next = neighbor(found.note, 1);
    pencilNote = next;
    writeSelected(() => {
      engine.pattern.note[cell(channel, found.start)] = next;
    });
  });
  lenDec.addEventListener('click', () => {
    writeSelected((found) => resizeNote(engine.pattern, channel, found.start, found.length - 1));
  });
  lenInc.addEventListener('click', () => {
    writeSelected((found) => resizeNote(engine.pattern, channel, found.start, found.length + 1));
  });
  volDec.addEventListener('click', () => {
    pencilVol = clampVol(pencilVol - 1);
    writeSelected((found) => {
      engine.pattern.volume[cell(channel, found.start)] = pencilVol;
    });
  });
  volInc.addEventListener('click', () => {
    pencilVol = clampVol(pencilVol + 1);
    writeSelected((found) => {
      engine.pattern.volume[cell(channel, found.start)] = pencilVol;
    });
  });
  for (const strip of strips) {
    const index = Number(strip.dataset.channel);
    strip.querySelector<HTMLButtonElement>('[data-mute]')?.addEventListener('click', () => {
      engine.setMute(index, engine.mute[index] !== 1);
    });
    strip.querySelector<HTMLButtonElement>('[data-solo]')?.addEventListener('click', () => {
      engine.setSolo(index, engine.solo[index] !== 1);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) engine.redo();
      else engine.undo();
      return;
    }
    if (mod && key === 'y') {
      event.preventDefault();
      engine.redo();
      return;
    }
    if (mod && key === 'c') {
      event.preventDefault();
      doCopy();
      return;
    }
    if (mod && key === 'v') {
      event.preventDefault();
      doPaste();
      return;
    }
    if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      void togglePlay();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      doDelete();
      return;
    }
    if (key === 'z' && !mod) {
      octave = clamp(octave - 1, 1, 7);
      return;
    }
    if (key === 'x' && !mod) {
      octave = clamp(octave + 1, 1, 7);
      return;
    }
    const degree = KEYS.indexOf(key);
    if (!mod && degree >= 0 && !event.repeat) {
      event.preventDefault();
      void playKey(key, (octave + 1) * 12 + degree);
      return;
    }
    if (!mod && event.key >= '1' && event.key <= '5') void onDrum(Number(event.key) - 1);
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (!held.has(key)) return;
    held.delete(key);
    const degree = KEYS.indexOf(key);
    if (degree < 0 || noise()) return;
    engine.noteOff(channel, snap((octave + 1) * 12 + degree));
  });

  async function playKey(key: string, midi: number): Promise<void> {
    held.add(key);
    const note = snap(midi);
    pencilNote = note;
    await engine.resume();
    if (noise()) {
      engine.hit(pencilDrum, pencilVol);
    } else {
      engine.noteOn(channel, note, pencilVol);
    }
    if (!engine.song.record) return;
    const at = engine.localStep() >= 0 ? engine.localStep() : step;
    engine.apply((pattern) => putNote(pattern, channel, at, 1, noise() ? DRUM_NOTE : note, pencilVol, pencilDrum));
    engine.commit();
    if (!engine.playing) step = Math.min(engine.pattern.steps - 1, at + 1);
  }

  const pats = required(document.querySelector<HTMLElement>('#pats'), 'pats');
  const lane = required(document.querySelector<HTMLElement>('#lane'), 'lane');
  const repOut = required(document.querySelector<HTMLOutputElement>('#rep-out'), 'rep-out');
  const trOut = required(document.querySelector<HTMLOutputElement>('#tr-out'), 'tr-out');
  const rootOut = required(document.querySelector<HTMLOutputElement>('#root-out'), 'root-out');
  const swingInput = required(document.querySelector<HTMLInputElement>('#swing'), 'swing');
  const swingOut = required(document.querySelector<HTMLOutputElement>('#swing-out'), 'swing-out');
  const isoOut = required(document.querySelector<HTMLOutputElement>('#iso'), 'iso');
  const pcs = required(document.querySelector<HTMLElement>('#pcs'), 'pcs');
  const patOut = required(document.querySelector<HTMLOutputElement>('#pat'), 'pat');
  const scaleButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-scale]')];
  const pcButtons: HTMLButtonElement[] = [];
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let pitch = 0; pitch < 12; pitch++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = names[pitch];
    button.addEventListener('click', () => engine.toggleClass(pitch));
    pcs.append(button);
    pcButtons.push(button);
  }
  isoOut.textContent = window.crossOriginIsolated ? 'SAB' : 'MSG';
  required(document.querySelector<HTMLButtonElement>('#mode-pat'), 'mode-pat').addEventListener('click', () => {
    engine.setPlaySong(false);
  });
  followButton = required(document.querySelector<HTMLButtonElement>('#follow'), 'follow');
  followButton.addEventListener('click', () => {
    follow = !follow;
  });
  required(document.querySelector<HTMLButtonElement>('#mode-song'), 'mode-song').addEventListener('click', () => {
    engine.setPlaySong(true);
    follow = true;
  });
  required(document.querySelector<HTMLButtonElement>('#pat-new'), 'pat-new').addEventListener('click', () => engine.newPattern());
  required(document.querySelector<HTMLButtonElement>('#pat-dup'), 'pat-dup').addEventListener('click', () => engine.dupPattern());
  required(document.querySelector<HTMLButtonElement>('#clear-pattern'), 'clear-pattern').addEventListener('click', () => {
    lastTap = null;
    engine.clearPattern();
  });
  required(document.querySelector<HTMLButtonElement>('#rep-dec'), 'rep-dec').addEventListener('click', () => engine.nudgeRepeat(-1));
  required(document.querySelector<HTMLButtonElement>('#rep-inc'), 'rep-inc').addEventListener('click', () => engine.nudgeRepeat(1));
  required(document.querySelector<HTMLButtonElement>('#tr-dec'), 'tr-dec').addEventListener('click', () => engine.nudgeTranspose(-1));
  required(document.querySelector<HTMLButtonElement>('#tr-inc'), 'tr-inc').addEventListener('click', () => engine.nudgeTranspose(1));
  required(document.querySelector<HTMLButtonElement>('#mark'), 'mark').addEventListener('click', () => engine.markEntry());
  required(document.querySelector<HTMLButtonElement>('#loop-in'), 'loop-in').addEventListener('click', () => engine.loopEntry('in'));
  required(document.querySelector<HTMLButtonElement>('#loop-out'), 'loop-out').addEventListener('click', () => engine.loopEntry('out'));
  required(document.querySelector<HTMLButtonElement>('#loop-all'), 'loop-all').addEventListener('click', () => engine.loopEntry('all'));
  required(document.querySelector<HTMLButtonElement>('#hear'), 'hear').addEventListener('click', () => {
    void engine.hearEntry();
  });
  for (const button of scaleButtons) {
    button.addEventListener('click', () => {
      engine.setScaleKind(Number(button.dataset.scale));
      pencilNote = snap(pencilNote);
    });
  }
  required(document.querySelector<HTMLButtonElement>('#root-dec'), 'root-dec').addEventListener('click', () => engine.nudgeRoot(-1));
  required(document.querySelector<HTMLButtonElement>('#root-inc'), 'root-inc').addEventListener('click', () => engine.nudgeRoot(1));
  swingInput.addEventListener('input', () => engine.setSwing(Number(swingInput.value)));
  required(document.querySelector<HTMLButtonElement>('#quantize'), 'quantize').addEventListener('click', () => engine.runQuantize(selectionBox()));
  required(document.querySelector<HTMLButtonElement>('#onion'), 'onion').addEventListener('click', () => engine.setOnion(!engine.song.onion));
  required(document.querySelector<HTMLButtonElement>('#rec'), 'rec').addEventListener('click', () => engine.setRecord(!engine.song.record));
  required(document.querySelector<HTMLButtonElement>('#arp-apply'), 'arp-apply').addEventListener('click', () => engine.runArp(craftBox()));
  required(document.querySelector<HTMLButtonElement>('#mut-rand'), 'mut-rand').addEventListener('click', () => engine.runRandom(craftBox()));
  required(document.querySelector<HTMLButtonElement>('#mut-hum'), 'mut-hum').addEventListener('click', () => engine.runHumanize(selectionBox()));
  required(document.querySelector<HTMLButtonElement>('#mut-var'), 'mut-var').addEventListener('click', () => engine.runVary(craftBox()));
  required(document.querySelector<HTMLButtonElement>('#mut-fill'), 'mut-fill').addEventListener('click', () => engine.runFill(craftBox()));
  required(document.querySelector<HTMLButtonElement>('#edit-down'), 'edit-down').addEventListener('click', () => engine.runTranspose(craftBox(), -1));
  required(document.querySelector<HTMLButtonElement>('#edit-up'), 'edit-up').addEventListener('click', () => engine.runTranspose(craftBox(), 1));
  required(document.querySelector<HTMLButtonElement>('#edit-dup'), 'edit-dup').addEventListener('click', () => engine.runDuplicate(craftBox()));
  required(document.querySelector<HTMLButtonElement>('#edit-left'), 'edit-left').addEventListener('click', () => engine.runOffset(craftBox(), -1));
  required(document.querySelector<HTMLButtonElement>('#edit-right'), 'edit-right').addEventListener('click', () => engine.runOffset(craftBox(), 1));

  function rebuildLane(): void {
    const doc = engine.song;
    let sig = `${doc.count}:${doc.orderLen}:`;
    for (let i = 0; i < doc.orderLen; i++) {
      sig += `${doc.orderPat[i]}.${doc.orderRep[i]}.${doc.orderTr[i]}.${doc.marker[i]}|`;
    }
    if (sig === laneSig) return;
    laneSig = sig;
    pats.replaceChildren();
    patButtons = [];
    for (let i = 0; i < doc.count; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(i + 1).padStart(2, '0');
      button.addEventListener('click', () => engine.selectPattern(i));
      pats.append(button);
      patButtons.push(button);
    }
    lane.replaceChildren();
    laneButtons = [];
    for (let i = 0; i < doc.orderLen; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      const tr = doc.orderTr[i];
      const mark = doc.marker[i] ? '•' : '';
      button.textContent = `${mark}${doc.orderPat[i] + 1}×${doc.orderRep[i]}${tr >= 0 ? '+' : ''}${tr}`;
      button.addEventListener('click', () => engine.selectEntry(i));
      lane.append(button);
      laneButtons.push(button);
    }
  }

  function effectLabel(ch: number, index: number): string {
    const parts: string[] = [];
    const bend = engine.pattern.pitch[index] - PITCH_CENTER;
    if (bend !== 0) parts.push(bend > 0 ? `+${bend}` : String(bend));
    const duty = engine.pattern.stepDuty[index];
    if (duty < 4) parts.push(DUTY_MARK[duty] ?? '');
    const arp = engine.pattern.stepArp[index];
    if (arp !== FX_INHERIT) parts.push(ARP_MARK[arp] ?? '');
    return parts.join(' ');
  }

  const radial = required(document.querySelector<HTMLElement>('#radial'), 'radial');
  const radialActs: [string, () => void][] = [
    ['Copy', () => doCopy()],
    ['Paste', () => doPaste()],
    ['Erase', () => {
      engine.apply((pattern) => clearNote(pattern, channel, step));
      engine.commit();
    }],
    ['Hum', () => engine.runHumanize({ c0: channel, c1: channel, s0: step, s1: step })],
    ['Qnt', () => engine.runQuantize({ c0: channel, c1: channel, s0: step, s1: step })],
    ['Len', () => {
      const found = findNote(engine.pattern, channel, step);
      if (!found) return;
      engine.apply((pattern) => resizeNote(pattern, channel, found.start, found.length + 1));
      engine.commit();
    }],
  ];
  for (const [label, act] of radialActs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      act();
      radial.hidden = true;
    });
    radial.append(button);
  }

  function openRadial(surface: Surface, x: number, y: number): void {
    engine.cancel();
    drag = null;
    const at = clampStep(stepAt(surface === 'grid' ? grid : roll, x));
    if (surface === 'grid') {
      const ch = channelAt(y);
      if (ch >= 0 && ch < MAX_CHANNELS) channel = ch;
    }
    step = at;
    radial.hidden = false;
    const buttons = [...radial.querySelectorAll('button')];
    const radius = 56;
    buttons.forEach((button, index) => {
      const angle = -Math.PI / 2 + (index / buttons.length) * Math.PI * 2;
      button.style.left = `${x + Math.cos(angle) * radius}px`;
      button.style.top = `${y + Math.sin(angle) * radius}px`;
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && radial.contains(event.target)) return;
    radial.hidden = true;
  });

  const panel = mountInspector(engine, {
    channel: () => channel,
    step: () => step,
    drum: () => pencilDrum,
    setDrum: (drum) => {
      pencilDrum = drum;
    },
  });

  new ResizeObserver(() => {
    if (noteGesture()) return;
    if (!customView) fit();
  }).observe(grid);

  let warm = 0;
  function fillKeys(): void {
    if (heldRoll) {
      restoreRoll();
      return;
    }
    if (noteGesture()) return;
    if (customView) return;
    const inner = roll.getBoundingClientRect().height - GUTTER;
    if (inner < 40) return;
    keyH = clamp(inner / rows(), 11, 40);
    centerPitch();
  }
  type MidiIn = { onmidimessage: ((event: { data?: Uint8Array }) => void) | null };
  type MidiAccess = { inputs: { values(): Iterable<MidiIn> }; onstatechange: (() => void) | null };

  async function playMidi(note: number, velocity: number): Promise<void> {
    const vol = clampVol(Math.round((velocity / 127) * VOL_MAX));
    pencilVol = vol;
    await engine.resume();
    if (noise()) {
      const drum = note < 40 ? DRUM_KICK : note < 48 ? DRUM_SNARE : DRUM_HAT;
      pencilDrum = drum;
      engine.hit(drum, vol, channel);
    } else {
      const snapped = snap(note);
      pencilNote = snapped;
      engine.noteOn(channel, snapped, vol);
    }
    if (!engine.song.record) return;
    const at = engine.localStep() >= 0 ? engine.localStep() : step;
    engine.apply((pattern) => putNote(pattern, channel, at, 1, noise() ? DRUM_NOTE : pencilNote, vol, pencilDrum));
    engine.commit();
  }

  function armMidi(): void {
    const out = required(document.querySelector<HTMLOutputElement>('#midi-out'), 'midi-out');
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccess> };
    if (typeof nav.requestMIDIAccess !== 'function') {
      out.textContent = 'none';
      return;
    }
    void nav.requestMIDIAccess().then((access) => {
      const take = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (event) => {
            const data = event.data;
            if (!data || data.length < 2) return;
            const status = data[0] & 0xf0;
            const note = data[1];
            const vel = data.length > 2 ? data[2] : 0;
            if (status === 0x90 && vel > 0) void playMidi(note, vel);
            else if ((status === 0x80 || status === 0x90) && !noise()) engine.noteOff(channel, snap(note));
          };
        }
      };
      take();
      access.onstatechange = take;
      out.textContent = 'on';
    }).catch(() => {
      out.textContent = 'off';
    });
  }
  required(document.querySelector<HTMLButtonElement>('#midi'), 'midi').addEventListener('click', () => armMidi());

  function revealStep(at: number): void {
    const inner = Math.max(1, grid.getBoundingClientRect().width - LABEL - GUTTER);
    const view = inner / Math.max(1, stepW);
    if (at < scrollX) scrollX = at;
    else if (at > scrollX + view - 1) scrollX = at - view + 1;
    clampView();
  }

  function chaseSong(): void {
    const doc = engine.song;
    const entry = followView(follow, doc.playSong, engine.playing, mode !== 'none' || noteGesture(), engine.orderNow());
    if (entry < 0) return;
    const pat = doc.orderPat[entry] || 0;
    if (doc.entry !== entry || doc.current !== pat) {
      selection = null;
      lastTap = null;
      engine.selectEntry(entry);
      if (step >= engine.pattern.steps) step = Math.max(0, engine.pattern.steps - 1);
    }
    const at = engine.localStep();
    if (at >= 0) revealStep(at);
  }

  requestAnimationFrame(function loop() {
    if (hold && !hold.fired && performance.now() - hold.t > 460) {
      const movedPx = Math.hypot(hold.x - hold.sx, hold.y - hold.sy);
      const keep = penMenuHold({
        pointerType: hold.pointerType,
        startPressure: hold.pressure,
        pressure: hold.pressure,
        movedPx,
      });
      if (keep) {
        openRadial(hold.surface, hold.sx, hold.sy);
        hold.fired = true;
      } else hold = null;
    }
    if (!customView && warm < 8 && !heldRoll) {
      warm += 1;
      fit();
    }
    fillKeys();
    chaseSong();
    sync();
    panel.sync();
    panel.paint();
    paintGrid();
    paintRoll();
    requestAnimationFrame(loop);
  });

  return { fresh };
}
