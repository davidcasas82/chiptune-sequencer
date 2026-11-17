import {
  clearNote,
  drumName,
  findNote,
  moveNote,
  noteName,
  putNote,
  resizeNote,
  type Hit,
} from './audio/edit';
import type { Engine } from './audio/engine';
import { mountInspector } from './inspector';
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
  SOUNDING_CHANNELS,
  TYPE_NOISE,
  VOL_MAX,
  cell,
  clampVol,
  stepIndex,
} from './audio/synth';

const LABEL = 52;
const GUTTER = 12;
const RULER = 16;
const MIN_STEP = 30;
const MAX_STEP = 88;
const CHANNELS = ['P1', 'P2', 'TRI', 'NSE'];
const DRUMS = [DRUM_KICK, DRUM_SNARE, DRUM_HAT, DRUM_SHORT, DRUM_LONG];
const DUTY_MARK = ['12', '25', '50', '75'];
const ARP_MARK = ['--', 'UP', 'DN', 'UD', 'RN'];
const LIVE = '#7dff9a';

const BG = '#070a08';
const ALT = '#0c120e';
const AMBER = '#ffb000';
const GREEN = '#39ff6a';
const DIM = '#1b5c32';
const LINE = '#24301a';
const INK = '#071007';

type Tool = 'draw' | 'erase' | 'select';
type Surface = 'grid' | 'roll';
type Selection = { c0: number; s0: number; c1: number; s1: number };

type Drag =
  | { kind: 'draw'; channel: number; anchor: number; note: number; drum: number; volume: number }
  | { kind: 'move'; fromCh: number; fromStep: number; grab: number; note: number; drum: number }
  | { kind: 'resize'; channel: number; start: number }
  | { kind: 'erase' }
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

export function mountEditor(engine: Engine): void {
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

  let tool: Tool = 'draw';
  let channel = 0;
  let step = 0;
  let pencilNote = 72;
  let pencilDrum = DRUM_KICK;
  let pencilVol = VOL_MAX;
  let stepW = 48;
  let keyH = 14;
  let scrollX = 0;
  let scrollY = 0;
  let customView = false;
  let selection: Selection | null = null;
  let drag: Drag | null = null;
  let moved = false;
  let mode: 'none' | 'edit' | 'pinch' = 'none';
  const points = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; midX: number; midY: number; stepW: number; keyH: number; scrollX: number; scrollY: number } | null = null;

  const gridGfx = required(grid.getContext('2d'), 'grid');
  const rollGfx = required(roll.getContext('2d'), 'roll');

  function noise(ch = channel): boolean {
    return engine.pattern.type[ch] === TYPE_NOISE;
  }

  function pitchWindow(): { lo: number; hi: number } {
    let lo = 128;
    let hi = -1;
    for (let at = 0; at < engine.pattern.steps; at++) {
      const note = engine.pattern.note[cell(channel, at)];
      if (note === EMPTY) continue;
      if (note < lo) lo = note;
      if (note > hi) hi = note;
    }
    if (hi < 0) {
      lo = 60;
      hi = 72;
    }
    lo -= 2;
    hi += 2;
    if (hi - lo < 24) {
      const extra = 24 - (hi - lo);
      lo -= Math.ceil(extra / 2);
      hi += Math.floor(extra / 2);
    }
    if (lo < 0) {
      hi -= lo;
      lo = 0;
    }
    if (hi > 127) {
      lo -= hi - 127;
      hi = 127;
    }
    if (lo < 0) lo = 0;
    return { lo, hi };
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
    const rowH = (rect.height - RULER - GUTTER) / SOUNDING_CHANNELS;
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
    if (event.pointerType === 'pen' && event.pressure > 0) return clampVol(Math.round(event.pressure * VOL_MAX));
    return pencilVol;
  }

  function placeNote(ch: number, row: number): { note: number; drum: number } {
    if (noise(ch)) {
      const drum = row >= 0 && row < DRUM_COUNT ? DRUMS[row] : pencilDrum;
      return { note: DRUM_NOTE, drum };
    }
    const note = row >= 0 ? pitchAt(row) : pencilNote;
    return { note: clamp(note, 0, 127), drum: pencilDrum };
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
        if (ch >= 0 && ch < SOUNDING_CHANNELS) channel = ch;
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
      if (ch < 0 || ch >= SOUNDING_CHANNELS) return;
      channel = ch;
      step = at;
      const part = tool === 'draw' ? gridPart(ch, at, event.clientX) : 'empty';
      const found = findNote(engine.pattern, ch, at);
      remember(found);
      if (tool === 'erase') {
        drag = { kind: 'erase' };
        engine.apply((pattern) => clearNote(pattern, ch, at));
        return;
      }
      if (tool === 'select') {
        drag = { kind: 'select', channel: ch, step: at };
        selection = { c0: ch, s0: at, c1: ch, s1: at };
        return;
      }
      if (part === 'body' && found) {
        drag = { kind: 'move', fromCh: ch, fromStep: found.start, grab: at - found.start, note: found.note, drum: found.drum };
        return;
      }
      if (part === 'edge' && found) {
        drag = { kind: 'resize', channel: ch, start: found.start };
        return;
      }
      const placed = noise(ch) ? { note: DRUM_NOTE, drum: pencilDrum } : { note: pencilNote, drum: pencilDrum };
      drag = { kind: 'draw', channel: ch, anchor: at, note: placed.note, drum: placed.drum, volume: volumeOf(event) };
      engine.preview((pattern) => putNote(pattern, ch, at, 1, placed.note, drag && drag.kind === 'draw' ? drag.volume : pencilVol, placed.drum));
      return;
    }

    const hit = rollHit(event.clientX, event.clientY);
    step = hit.step;
    remember(hit.found);
    if (tool === 'erase') {
      drag = { kind: 'erase' };
      engine.apply((pattern) => clearNote(pattern, channel, hit.step));
      return;
    }
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
    drag = { kind: 'draw', channel, anchor: hit.step, note: placed.note, drum: placed.drum, volume: volumeOf(event) };
    engine.preview((pattern) => putNote(pattern, channel, hit.step, 1, placed.note, volumeOf(event), placed.drum));
  }

  function moveEdit(surface: Surface, event: PointerEvent): void {
    if (!drag) return;
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
    if (drag.kind === 'erase') {
      const ch = surface === 'grid' ? channelAt(event.clientY) : channel;
      if (ch >= 0 && ch < SOUNDING_CHANNELS) engine.apply((pattern) => clearNote(pattern, ch, at));
      return;
    }
    if (drag.kind === 'select') {
      const ch = surface === 'grid' ? channelAt(event.clientY) : channel;
      selection = { c0: drag.channel, s0: drag.step, c1: clamp(ch, 0, SOUNDING_CHANNELS - 1), s1: at };
      return;
    }
    if (!moved && (drag.kind === 'move' || drag.kind === 'resize')) return;
    if (drag.kind === 'draw') {
      const ch = drag.channel;
      const a = Math.min(drag.anchor, at);
      const len = Math.abs(at - drag.anchor) + 1;
      let note = drag.note;
      let drum = drag.drum;
      if (surface === 'roll') {
        const placed = placeNote(ch, rollRow(event.clientY));
        note = placed.note;
        drum = placed.drum;
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
    const ch = surface === 'grid' ? clamp(channelAt(event.clientY), 0, SOUNDING_CHANNELS - 1) : drag.fromCh;
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
      if (points.size >= 2) {
        if (mode === 'edit') {
          engine.cancel();
          drag = null;
        }
        mode = 'pinch';
        pinch = null;
        updatePinch(event);
        return;
      }
      if (mode === 'pinch') return;
      mode = 'edit';
      moved = false;
      startEdit(surface, event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (mode === 'pinch') {
        updatePinch(event);
        return;
      }
      if (mode === 'edit') moveEdit(surface, event);
    });
    const end = (event: PointerEvent) => {
      points.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (points.size === 0) {
        if (mode === 'edit') finish();
        mode = 'none';
        pinch = null;
        drag = null;
        return;
      }
      if (mode === 'pinch') pinch = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
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
    engine.apply((pattern) => {
      if (!selection) {
        clearNote(pattern, channel, step);
        return;
      }
      const c0 = Math.min(selection.c0, selection.c1);
      const c1 = Math.max(selection.c0, selection.c1);
      const s0 = Math.min(selection.s0, selection.s1);
      const s1 = Math.max(selection.s0, selection.s1);
      for (let ch = c0; ch <= c1; ch++) {
        for (let at = s0; at <= s1; at++) clearNote(pattern, ch, at);
      }
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
    channel = 3;
    const at = step;
    await engine.resume();
    engine.hit(drum, pencilVol);
    engine.apply((pattern) => putNote(pattern, 3, at, 1, DRUM_NOTE, pencilVol, drum));
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
    const cursor = engine.playing ? stepIndex(engine.now(), engine.startTime, engine.bpm, engine.pattern.steps) : step;
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
    for (const button of lengthButtons) setOn(button, Number(button.dataset.steps) === engine.pattern.steps);
    setOn(toolButtons.draw, tool === 'draw');
    setOn(toolButtons.erase, tool === 'erase');
    setOn(toolButtons.select, tool === 'select');
    for (const button of drumButtons) setOn(button, Number(button.dataset.drum) === pencilDrum);
    for (const button of channelButtons) setOn(button, Number(button.dataset.channel) === channel);
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
    for (let i = 0; i < SOUNDING_CHANNELS; i++) if (engine.solo[i]) any = true;
    if (engine.mute[ch]) return true;
    return any && engine.solo[ch] === 0;
  }

  function paintGrid(): void {
    const { w, h } = size(grid, gridGfx);
    const gfx = gridGfx;
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, h);
    const innerH = h - RULER - GUTTER;
    const rowH = innerH / SOUNDING_CHANNELS;
    const steps = engine.pattern.steps;
    const head = engine.playing ? stepIndex(engine.now(), engine.startTime, engine.bpm, steps) : -1;
    const first = Math.max(0, Math.floor(scrollX));
    const last = Math.min(steps, Math.ceil(scrollX + (w - LABEL - GUTTER) / stepW) + 1);
    for (let at = first; at < last; at++) {
      const x = LABEL + (at - scrollX) * stepW;
      if (Math.floor(at / 4) % 2 === 0) {
        gfx.fillStyle = ALT;
        gfx.fillRect(x, RULER, stepW, innerH);
      }
    }
    gfx.strokeStyle = '#182116';
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
    for (let ch = 0; ch < SOUNDING_CHANNELS; ch++) {
      const y = RULER + ch * rowH;
      for (let at = 0; at < steps; at++) {
        const index = cell(ch, at);
        if (engine.pattern.note[index] === EMPTY) continue;
        const len = engine.pattern.length[index];
        const x = LABEL + (at - scrollX) * stepW;
        const live = head >= at && head < at + len;
        gfx.fillStyle = dimmed(ch) ? DIM : live ? LIVE : GREEN;
        gfx.fillRect(x + 2, y + 3, Math.max(4, len * stepW - 4), rowH - 6);
        if (effectLabel(ch, index)) {
          gfx.fillStyle = AMBER;
          gfx.fillRect(x + 2, y + rowH - 5, Math.max(4, Math.min(stepW, len * stepW) - 4), 2);
        }
        if (stepW < 28) continue;
        const name = engine.pattern.type[ch] === TYPE_NOISE ? drumName(engine.pattern.drum[index]) : noteName(engine.pattern.note[index]);
        const fx = effectLabel(ch, index);
        const meta = engine.pattern.length[index].toString(16).toUpperCase().padStart(2, '0')
          + ' '
          + engine.pattern.volume[index].toString(16).toUpperCase()
          + (fx && stepW >= 52 ? ' ' + fx : '');
        gfx.fillStyle = INK;
        gfx.textAlign = 'left';
        gfx.textBaseline = 'middle';
        gfx.font = stepW >= 44 ? '12px ui-monospace, monospace' : '10px ui-monospace, monospace';
        gfx.fillText(name, x + 5, y + rowH * 0.36);
        if (rowH > 40) gfx.fillText(meta, x + 5, y + rowH * 0.7);
      }
    }
    gfx.restore();
    gfx.font = '11px ui-monospace, monospace';
    gfx.textBaseline = 'middle';
    for (let ch = 0; ch < SOUNDING_CHANNELS; ch++) {
      const y = RULER + ch * rowH;
      gfx.fillStyle = BG;
      gfx.fillRect(0, y, LABEL, rowH);
      gfx.fillStyle = ch === channel ? AMBER : '#6a5420';
      gfx.textAlign = 'left';
      gfx.fillText(CHANNELS[ch], 8, y + rowH / 2);
      if (ch === channel) {
        gfx.fillStyle = AMBER;
        gfx.fillRect(0, y, 3, rowH);
      }
      gfx.strokeStyle = LINE;
      gfx.beginPath();
      gfx.moveTo(0, y + rowH);
      gfx.lineTo(w - GUTTER, y + rowH);
      gfx.stroke();
    }
    if (head >= 0) {
      gfx.fillStyle = AMBER;
      gfx.fillRect(LABEL + (head - scrollX) * stepW, RULER, 2, innerH);
    }
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, RULER);
    gfx.textAlign = 'center';
    gfx.fillStyle = AMBER;
    for (let at = first; at < last; at++) {
      if (at % 4 !== 0 && stepW < 36) continue;
      gfx.fillText(String(at).padStart(2, '0'), LABEL + (at - scrollX) * stepW + stepW / 2, RULER / 2);
    }
    const mark = LABEL + (step - scrollX) * stepW;
    gfx.strokeStyle = GREEN;
    gfx.strokeRect(mark + 1, RULER + channel * rowH + 1, stepW - 2, rowH - 2);
    if (selection) {
      const c0 = Math.min(selection.c0, selection.c1);
      const c1 = Math.max(selection.c0, selection.c1);
      const s0 = Math.min(selection.s0, selection.s1);
      const s1 = Math.max(selection.s0, selection.s1);
      gfx.strokeStyle = AMBER;
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
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, h);
    const drum = noise();
    const count = rows();
    const span = pitchWindow();
    const steps = engine.pattern.steps;
    const head = engine.playing ? stepIndex(engine.now(), engine.startTime, engine.bpm, steps) : -1;
    const first = Math.max(0, Math.floor(scrollY) - 1);
    const visible = Math.ceil((h - GUTTER) / keyH) + 2;
    for (let row = first; row < first + visible && row < count + 2; row++) {
      if (row < 0) continue;
      const y = (row - scrollY) * keyH;
      let alt = row % 2 === 1;
      if (!drum && row >= 0 && row < count) {
        const pitch = span.hi - row;
        const pc = ((pitch % 12) + 12) % 12;
        alt = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
      }
      gfx.fillStyle = alt ? '#10140f' : ALT;
      gfx.fillRect(LABEL, y, Math.max(0, w - LABEL - GUTTER), keyH);
    }
    gfx.save();
    gfx.beginPath();
    gfx.rect(LABEL, 0, Math.max(0, w - LABEL - GUTTER), Math.max(0, h - GUTTER));
    gfx.clip();
    for (let at = 0; at < steps; at++) {
      const index = cell(channel, at);
      if (engine.pattern.note[index] === EMPTY) continue;
      const row = drum ? engine.pattern.drum[index] : span.hi - engine.pattern.note[index];
      const x = LABEL + (at - scrollX) * stepW;
      const y = (row - scrollY) * keyH;
      const len = engine.pattern.length[index];
      const live = head >= at && head < at + len;
      gfx.fillStyle = dimmed(channel) ? DIM : live ? LIVE : GREEN;
      gfx.fillRect(x + 1, y + 2, Math.max(4, len * stepW - 2), Math.max(4, keyH - 4));
      if (effectLabel(channel, index)) {
        gfx.fillStyle = AMBER;
        gfx.fillRect(x + 1, y + keyH - 3, Math.min(8, stepW - 2), 2);
      }
      if (engine.pattern.length[index] * stepW < 28) continue;
      gfx.fillStyle = INK;
      gfx.font = '11px ui-monospace, monospace';
      gfx.textAlign = 'left';
      gfx.textBaseline = 'middle';
      const label = drum ? drumName(engine.pattern.drum[index]) : noteName(engine.pattern.note[index]);
      gfx.fillText(label, x + 4, y + keyH / 2);
    }
    gfx.restore();
    if (head >= 0) {
      gfx.fillStyle = AMBER;
      gfx.fillRect(LABEL + (head - scrollX) * stepW, 0, 2, h - GUTTER);
    }
    gfx.font = keyH >= 16 ? '11px ui-monospace, monospace' : '10px ui-monospace, monospace';
    gfx.textBaseline = 'middle';
    gfx.textAlign = 'left';
    for (let row = 0; row < count; row++) {
      const y = (row - scrollY) * keyH;
      if (y + keyH < 0 || y > h) continue;
      gfx.fillStyle = BG;
      gfx.fillRect(0, y, LABEL, keyH);
      if (drum) {
        gfx.fillStyle = AMBER;
        gfx.fillText(drumName(DRUMS[row] ?? DRUM_KICK), 6, y + keyH / 2);
        continue;
      }
      const pitch = span.hi - row;
      if (keyH < 16 && pitch % 12 !== 0) continue;
      gfx.fillStyle = pitch % 12 === 0 ? AMBER : '#8a6a20';
      gfx.fillText(noteName(pitch), 4, y + keyH / 2);
    }
    if (selection && channel >= Math.min(selection.c0, selection.c1) && channel <= Math.max(selection.c0, selection.c1)) {
      const s0 = Math.min(selection.s0, selection.s1);
      const s1 = Math.max(selection.s0, selection.s1);
      gfx.strokeStyle = AMBER;
      gfx.lineWidth = 2;
      gfx.strokeRect(LABEL + (s0 - scrollX) * stepW + 1, 1, (s1 - s0 + 1) * stepW - 2, h - GUTTER - 2);
    }
    paintBar(gfx, w, h, false);
  }

  function paintBar(gfx: CanvasRenderingContext2D, w: number, h: number, horizontal: boolean): void {
    if (horizontal) {
      const inner = Math.max(1, w - LABEL - GUTTER);
      const spanPx = engine.pattern.steps * stepW;
      gfx.fillStyle = '#182116';
      gfx.fillRect(LABEL, h - GUTTER, inner, GUTTER);
      if (spanPx <= inner + 1) return;
      const thumb = Math.max(20, inner * (inner / spanPx));
      const travel = Math.max(1, inner - thumb);
      const x = LABEL + (scrollX * stepW / Math.max(1, spanPx - inner)) * travel;
      gfx.fillStyle = AMBER;
      gfx.fillRect(x, h - GUTTER + 2, thumb, GUTTER - 4);
      return;
    }
    const inner = Math.max(1, h - GUTTER);
    const spanPx = rows() * keyH;
    gfx.fillStyle = '#182116';
    gfx.fillRect(w - GUTTER, 0, GUTTER, inner);
    if (spanPx <= inner + 1) return;
    const thumb = Math.max(20, inner * (inner / spanPx));
    const travel = Math.max(1, inner - thumb);
    const y = (scrollY * keyH / Math.max(1, spanPx - inner)) * travel;
    gfx.fillStyle = AMBER;
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
  toolButtons.draw.addEventListener('click', () => {
    tool = 'draw';
  });
  toolButtons.erase.addEventListener('click', () => {
    tool = 'erase';
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
      const span = pitchWindow();
      pencilNote = clamp(pencilNote - 1, span.lo, span.hi);
      return;
    }
    const next = clamp(found.note - 1, 0, 127);
    pencilNote = next;
    writeSelected(() => {
      engine.pattern.note[cell(channel, found.start)] = next;
    });
  });
  noteInc.addEventListener('click', () => {
    const found = findNote(engine.pattern, channel, step);
    if (!found) {
      const span = pitchWindow();
      pencilNote = clamp(pencilNote + 1, span.lo, span.hi);
      return;
    }
    const next = clamp(found.note + 1, 0, 127);
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
    if (event.target instanceof HTMLInputElement) return;
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
    if (!mod && event.key >= '1' && event.key <= '5') void onDrum(Number(event.key) - 1);
  });

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

  const panel = mountInspector(engine, {
    channel: () => channel,
    step: () => step,
    drum: () => pencilDrum,
    setDrum: (drum) => {
      pencilDrum = drum;
    },
  });

  new ResizeObserver(() => {
    if (!customView) fit();
  }).observe(grid);

  let warm = 0;
  function fillKeys(): void {
    if (customView) return;
    const inner = roll.getBoundingClientRect().height - GUTTER;
    if (inner < 40) return;
    keyH = clamp(inner / rows(), 11, 40);
    scrollY = 0;
  }
  requestAnimationFrame(function loop() {
    if (!customView && warm < 8) {
      warm += 1;
      fit();
    }
    fillKeys();
    sync();
    panel.sync();
    panel.paint();
    paintGrid();
    paintRoll();
    requestAnimationFrame(loop);
  });
}
