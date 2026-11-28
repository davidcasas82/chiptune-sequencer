import { findNote } from './audio/edit';
import type { Engine } from './audio/engine';
import { ink } from './palette';
import { consumeKnobHold, TIP_STILL_PX } from './tips';
import {
  ARP_OFF,
  ARP_UP,
  FX_INHERIT,
  LFSR_FOLLOW,
  PITCH_CENTER,
  PRESET_ARP,
  PRESET_KICK,
  PRESET_NONE,
  SCOPE_LEN,
  TYPE_NOISE,
  TYPE_OFF,
  TYPE_PULSE,
  TYPE_TRI,
  drumTrack,
  WAVE_LEN,
  applyPreset,
  cell,
  clampPitch,
  type Pattern,
} from './audio/synth';

const ARP_SPEED = [12.5, 25, 50, 75];

const ARP_DRAW = [
  [0, 0, 0],
  [0, 4, 7],
  [7, 4, 0],
  [0, 4, 7, 4],
  [0, 7, 4],
];

type KnobSpec = {
  id: string;
  min: number;
  max: number;
  show: (type: number) => boolean;
  read: (pattern: Pattern, channel: number) => number;
  write: (pattern: Pattern, channel: number, value: number) => void;
  text: (value: number) => string;
};

type Ui = {
  channel: () => number;
  step: () => number;
  drum: () => number;
  setDrum: (drum: number) => void;
};

const KNOBS: readonly KnobSpec[] = [
  { id: 'vol', min: 0, max: 1, show: () => true, read: (p, ch) => p.vol[ch], write: (p, ch, v) => { p.vol[ch] = v; }, text: (v) => String(Math.round(v * 100)) },
  { id: 'pan', min: -1, max: 1, show: () => true, read: (p, ch) => p.pan[ch], write: (p, ch, v) => { p.pan[ch] = v; }, text: (v) => v > 0.04 ? `R${Math.round(v * 100)}` : v < -0.04 ? `L${Math.round(-v * 100)}` : 'C' },
  { id: 'sweep', min: -6, max: 6, show: (type) => type === TYPE_PULSE, read: (p, ch) => p.sweep[ch], write: (p, ch, v) => { p.sweep[ch] = v; }, text: (v) => v.toFixed(1) },
  { id: 'attack', min: 0.001, max: 0.4, show: () => true, read: (p, ch) => p.attack[ch], write: (p, ch, v) => { p.attack[ch] = v; }, text: (v) => String(Math.round(v * 1000)) },
  { id: 'decay', min: 0.001, max: 0.6, show: () => true, read: (p, ch) => p.decay[ch], write: (p, ch, v) => { p.decay[ch] = v; }, text: (v) => String(Math.round(v * 1000)) },
  { id: 'sustain', min: 0, max: 1, show: () => true, read: (p, ch) => p.sustain[ch], write: (p, ch, v) => { p.sustain[ch] = v; }, text: (v) => String(Math.round(v * 100)) },
  { id: 'release', min: 0.001, max: 0.5, show: () => true, read: (p, ch) => p.release[ch], write: (p, ch, v) => { p.release[ch] = v; }, text: (v) => String(Math.round(v * 1000)) },
  { id: 'vib', min: 0, max: 1, show: () => true, read: (p, ch) => p.vibDepth[ch], write: (p, ch, v) => { p.vibDepth[ch] = v; }, text: (v) => v.toFixed(2) },
  { id: 'rate', min: 0, max: 12, show: () => true, read: (p, ch) => p.vibRate[ch], write: (p, ch, v) => { p.vibRate[ch] = v; }, text: (v) => v.toFixed(1) },
  { id: 'slide', min: 0, max: 24, show: () => true, read: (p, ch) => p.slide[ch], write: (p, ch, v) => { p.slide[ch] = v; }, text: (v) => v.toFixed(1) },
  { id: 'arp', min: 0, max: 75, show: (type) => type === TYPE_PULSE || type === TYPE_TRI, read: (p, ch) => p.arpRate[ch], write: (p, ch, v) => { p.arpRate[ch] = v; if (v > 0 && p.arp[ch] === ARP_OFF) p.arp[ch] = ARP_UP; }, text: (v) => Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : String(Math.round(v * 10) / 10) },
];

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function setOn(element: HTMLElement, on: boolean): void {
  const next = on ? '1' : '0';
  if (element.dataset.on !== next) element.dataset.on = next;
  if (element instanceof HTMLButtonElement) {
    const pressed = on ? 'true' : 'false';
    if (element.getAttribute('aria-pressed') !== pressed) element.setAttribute('aria-pressed', pressed);
  }
}

export function mountInspector(engine: Engine, ui: Ui): { sync: () => void; paint: () => void } {
  const scope = required(document.querySelector<HTMLCanvasElement>('#scope'), 'scope');
  const env = required(document.querySelector<HTMLCanvasElement>('#env'), 'env');
  const wave = required(document.querySelector<HTMLCanvasElement>('#wave'), 'wave');
  const scopeGfx = required(scope.getContext('2d'), 'scope');
  const envGfx = required(env.getContext('2d'), 'env');
  const waveGfx = required(wave.getContext('2d'), 'wave');
  const dutyRow = required(document.querySelector<HTMLElement>('#duty-row'), 'duty-row');
  const arpRow = required(document.querySelector<HTMLElement>('#arp-row'), 'arp-row');
  const arpBox = required(document.querySelector<HTMLElement>('#arp-box'), 'arp-box');
  const arpMore = required(document.querySelector<HTMLElement>('#arp-more'), 'arp-more');
  const arpGraph = required(document.querySelector<HTMLCanvasElement>('#arp-graph'), 'arp-graph');
  const arpGfx = required(arpGraph.getContext('2d'), 'arp-graph');
  const lfsrRow = required(document.querySelector<HTMLElement>('#lfsr-row'), 'lfsr-row');
  const stepDutyRow = required(document.querySelector<HTMLElement>('#step-duty'), 'step-duty');
  const stepArpRow = required(document.querySelector<HTMLElement>('#step-arp'), 'step-arp');
  const stepDutyLabel = required(document.querySelector<HTMLElement>('#step-duty-label'), 'step-duty-label');
  const stepArpLabel = required(document.querySelector<HTMLElement>('#step-arp-label'), 'step-arp-label');
  const pitchOut = required(document.querySelector<HTMLOutputElement>('#pitch-out'), 'pitch-out');
  const leds = [...document.querySelectorAll<HTMLElement>('.led')];
  const presetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const dutyButtons = [...dutyRow.querySelectorAll<HTMLButtonElement>('[data-speed]')];
  const arpButtons = [...arpRow.querySelectorAll<HTMLButtonElement>('[data-arp]')];
  const stepDutyButtons = [...stepDutyRow.querySelectorAll<HTMLButtonElement>('[data-step-duty]')];
  const stepArpButtons = [...stepArpRow.querySelectorAll<HTMLButtonElement>('[data-step-arp]')];
  const longButton = required(document.querySelector<HTMLButtonElement>('#lfsr-long'), 'lfsr-long');
  const shortButton = required(document.querySelector<HTMLButtonElement>('#lfsr-short'), 'lfsr-short');

  const knobs = KNOBS.map((spec) => {
    const button = required(document.querySelector<HTMLButtonElement>(`#knob-${spec.id}`), spec.id);
    const output = required(document.querySelector<HTMLOutputElement>(`#out-${spec.id}`), spec.id);
    const wrap = required(button.closest<HTMLElement>('.knob'), spec.id);
    button.setAttribute('role', 'slider');
    button.setAttribute('aria-valuemin', String(spec.min));
    button.setAttribute('aria-valuemax', String(spec.max));
    return { spec, button, output, wrap };
  });

  let waveIndex = -1;
  let waveValue = 0;

  function typeOf(): number {
    return engine.pattern.type[ui.channel()] ?? 0;
  }

  function shownType(): number {
    const type = typeOf();
    if (drumTrack(ui.channel()) && type !== TYPE_OFF) return TYPE_NOISE;
    return type;
  }

  function selectedDrum(): number {
    const found = findNote(engine.pattern, ui.channel(), ui.step());
    if (found && shownType() === TYPE_NOISE) return found.drum;
    return ui.drum();
  }

  function noteIndex(): number | null {
    const found = findNote(engine.pattern, ui.channel(), ui.step());
    if (!found) return null;
    return cell(ui.channel(), found.start);
  }

  function writeNote(edit: (pattern: Pattern, index: number) => void): void {
    const index = noteIndex();
    if (index == null) return;
    engine.apply((pattern) => edit(pattern, index));
    engine.commit();
  }

  for (const knob of knobs) {
    const { spec, button } = knob;
    let drag: { x: number; y: number; value: number; moved: boolean } | null = null;
    const applyValue = (value: number) => {
      const channel = ui.channel();
      const next = clamp(value, spec.min, spec.max);
      engine.apply((pattern) => {
        spec.write(pattern, channel, next);
        pattern.preset[channel] = PRESET_NONE;
      });
    };
    button.addEventListener('pointerdown', (event) => {
      button.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, value: spec.read(engine.pattern, ui.channel()), moved: false };
      event.preventDefault();
    });
    button.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dy = drag.y - event.clientY;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, dy) <= TIP_STILL_PX) return;
        drag.moved = true;
        engine.begin();
      }
      const span = spec.max - spec.min;
      const scale = event.shiftKey ? 220 : 90;
      const dead = Math.min(Math.abs(dy), TIP_STILL_PX);
      const signed = dy > 0 ? dy - dead : dy < 0 ? dy + dead : 0;
      applyValue(drag.value + (signed / scale) * span);
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) {
        consumeKnobHold(button);
        return;
      }
      if (consumeKnobHold(button)) engine.cancel();
      else engine.commit();
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const dir = event.key === 'ArrowUp' ? 1 : -1;
      const step = (spec.max - spec.min) / (event.shiftKey ? 80 : 20);
      const channel = ui.channel();
      engine.apply((pattern) => {
        spec.write(pattern, channel, clamp(spec.read(pattern, channel) + dir * step, spec.min, spec.max));
        pattern.preset[channel] = PRESET_NONE;
      });
      engine.commit();
    });
  }

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const preset = Number(button.dataset.preset);
      const channel = ui.channel();
      engine.apply((pattern) => {
        applyPreset(pattern, channel, preset);
        if (preset < PRESET_KICK || shownType() !== TYPE_NOISE) return;
        const drum = preset - PRESET_KICK;
        ui.setDrum(drum);
        const found = findNote(pattern, channel, ui.step());
        if (found) pattern.drum[cell(channel, found.start)] = drum;
      });
      engine.commit();
      if (preset === PRESET_ARP) {
        requestAnimationFrame(() => arpBox.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      }
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-voice]')) {
    button.addEventListener('click', () => {
      const type = Number(button.dataset.voice);
      const channel = ui.channel();
      if (drumTrack(channel) && (type === TYPE_PULSE || type === TYPE_TRI)) return;
      engine.apply((pattern) => {
        pattern.type[channel] = type;
      });
      engine.commit();
    });
  }

  for (const button of dutyButtons) {
    button.addEventListener('click', () => {
      const rate = ARP_SPEED[Number(button.dataset.speed)] ?? 12.5;
      const channel = ui.channel();
      engine.apply((pattern) => {
        pattern.arpRate[channel] = rate;
        if (rate > 0 && pattern.arp[channel] === ARP_OFF) pattern.arp[channel] = ARP_UP;
        pattern.preset[channel] = PRESET_NONE;
      });
      engine.commit();
    });
  }

  for (const button of arpButtons) {
    button.addEventListener('click', () => {
      const arp = Number(button.dataset.arp);
      const channel = ui.channel();
      engine.apply((pattern) => {
        pattern.arp[channel] = arp;
        if (arp !== ARP_OFF && !(pattern.arpRate[channel] > 0)) pattern.arpRate[channel] = 12;
      });
      engine.commit();
    });
  }

  const setLfsr = (short: number) => {
    const drum = selectedDrum();
    const channel = ui.channel();
    engine.apply((pattern) => {
      pattern.noiseShort[drum] = short;
      pattern.lfsr[channel] = LFSR_FOLLOW;
    });
    engine.commit();
  };
  longButton.addEventListener('click', () => setLfsr(0));
  shortButton.addEventListener('click', () => setLfsr(1));

  required(document.querySelector<HTMLButtonElement>('#pitch-dec'), 'pitch-dec').addEventListener('click', () => {
    writeNote((pattern, index) => {
      pattern.pitch[index] = PITCH_CENTER + clampPitch(pattern.pitch[index] - PITCH_CENTER - 1);
    });
  });
  required(document.querySelector<HTMLButtonElement>('#pitch-inc'), 'pitch-inc').addEventListener('click', () => {
    writeNote((pattern, index) => {
      pattern.pitch[index] = PITCH_CENTER + clampPitch(pattern.pitch[index] - PITCH_CENTER + 1);
    });
  });

  for (const button of stepDutyButtons) {
    button.addEventListener('click', () => {
      const duty = Number(button.dataset.stepDuty);
      writeNote((pattern, index) => {
        pattern.stepDuty[index] = duty;
      });
    });
  }
  for (const button of stepArpButtons) {
    button.addEventListener('click', () => {
      const arp = Number(button.dataset.stepArp);
      const channel = ui.channel();
      writeNote((pattern, index) => {
        pattern.stepArp[index] = arp;
        if (arp !== FX_INHERIT && arp !== ARP_OFF && !(pattern.arpRate[channel] > 0)) pattern.arpRate[channel] = 12;
      });
    });
  }

  const stamp = (event: PointerEvent) => {
    const rect = wave.getBoundingClientRect();
    const index = clamp(Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * WAVE_LEN), 0, WAVE_LEN - 1);
    const value = clamp(1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2, -1, 1);
    const channel = ui.channel();
    const from = waveIndex < 0 ? index : waveIndex;
    const start = waveIndex < 0 ? value : waveValue;
    engine.apply((pattern) => {
      const lo = Math.min(from, index);
      const hi = Math.max(from, index);
      for (let i = lo; i <= hi; i++) {
        const t = hi === lo ? 1 : (i - from) / (index - from);
        pattern.wave[channel * WAVE_LEN + i] = start + (value - start) * t;
      }
      pattern.preset[channel] = PRESET_NONE;
    });
    waveIndex = index;
    waveValue = value;
  };
  wave.addEventListener('pointerdown', (event) => {
    if (shownType() !== TYPE_TRI) return;
    wave.setPointerCapture(event.pointerId);
    engine.begin();
    waveIndex = -1;
    stamp(event);
    event.preventDefault();
  });
  wave.addEventListener('pointermove', (event) => {
    if (!wave.hasPointerCapture(event.pointerId)) return;
    stamp(event);
  });
  const endWave = (event: PointerEvent) => {
    if (!wave.hasPointerCapture(event.pointerId)) return;
    wave.releasePointerCapture(event.pointerId);
    waveIndex = -1;
    engine.commit();
  };
  wave.addEventListener('pointerup', endWave);
  wave.addEventListener('pointercancel', endWave);

  function sync(): void {
    const channel = ui.channel();
    const type = shownType();
    const pattern = engine.pattern;
    for (const knob of knobs) {
      const value = knob.spec.read(pattern, channel);
      const span = knob.spec.max - knob.spec.min;
      const percent = span === 0 ? 0 : Math.round(((value - knob.spec.min) / span) * 100);
      knob.button.style.setProperty('--p', String(clamp(percent, 0, 100)));
      knob.button.setAttribute('aria-valuenow', String(Math.round(value * 1000) / 1000));
      const label = knob.spec.text(value);
      if (knob.output.textContent !== label) knob.output.textContent = label;
      knob.wrap.hidden = !knob.spec.show(type);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-voice]')) {
      setOn(button, Number(button.dataset.voice) === type);
    }
    for (const button of presetButtons) {
      setOn(button, Number(button.dataset.preset) === pattern.preset[channel]);
    }
    const shaped = type === TYPE_PULSE || type === TYPE_TRI;
    const arpOpen = shaped && pattern.arp[channel] !== ARP_OFF && pattern.arpRate[channel] > 0;
    arpBox.hidden = !shaped;
    arpMore.hidden = !arpOpen;
    arpRow.hidden = !shaped;
    wave.hidden = type !== TYPE_TRI;
    lfsrRow.hidden = type !== TYPE_NOISE;
    stepDutyRow.hidden = type !== TYPE_PULSE;
    stepDutyLabel.hidden = type !== TYPE_PULSE;
    stepArpRow.hidden = type !== TYPE_PULSE && type !== TYPE_TRI;
    stepArpLabel.hidden = type !== TYPE_PULSE && type !== TYPE_TRI;

    let speedPick = -1;
    let speedErr = 0.75;
    for (let i = 0; i < ARP_SPEED.length; i++) {
      const err = Math.abs(pattern.arpRate[channel] - ARP_SPEED[i]);
      if (err < speedErr) {
        speedErr = err;
        speedPick = i;
      }
    }
    for (const button of dutyButtons) setOn(button, Number(button.dataset.speed) === speedPick);
    for (const button of arpButtons) setOn(button, Number(button.dataset.arp) === pattern.arp[channel]);

    const drum = selectedDrum();
    const mode = pattern.lfsr[channel] === LFSR_FOLLOW ? pattern.noiseShort[drum] : pattern.lfsr[channel];
    setOn(longButton, mode === 0);
    setOn(shortButton, mode === 1);

    const index = noteIndex();
    const bend = index == null ? 0 : pattern.pitch[index] - PITCH_CENTER;
    const pitch = bend > 0 ? `+${bend}` : String(bend);
    if (pitchOut.textContent !== pitch) pitchOut.textContent = pitch;
    const stepDuty = index == null ? FX_INHERIT : pattern.stepDuty[index];
    const stepArp = index == null ? FX_INHERIT : pattern.stepArp[index];
    for (const button of stepDutyButtons) setOn(button, Number(button.dataset.stepDuty) === stepDuty);
    for (const button of stepArpButtons) setOn(button, Number(button.dataset.stepArp) === stepArp);

    const head = engine.localStep();
    for (const led of leds) {
      const at = Number(led.dataset.led);
      const peak = engine.peaks[at] > 0.015;
      const note = head >= 0 && findNote(pattern, at, head) !== null;
      setOn(led, peak || note);
    }
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
    gfx.setTransform(width / Math.max(1, rect.width), 0, 0, height / Math.max(1, rect.height), 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function paint(): void {
    paintScope();
    paintEnv();
    if (!wave.hidden) paintWave();
    if (!arpMore.hidden) paintArp();
  }

  function paintArp(): void {
    const { w, h } = size(arpGraph, arpGfx);
    const gfx = arpGfx;
    const kind = engine.pattern.arp[ui.channel()] ?? 0;
    const steps = ARP_DRAW[kind] ?? ARP_DRAW[1];
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    gfx.strokeStyle = ink.green;
    gfx.lineWidth = 1.5;
    gfx.beginPath();
    const top = Math.max(...steps, 1);
    for (let i = 0; i < steps.length; i++) {
      const x = ((i + 0.5) / steps.length) * w;
      const y = h - 4 - (steps[i] / top) * (h - 8);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.stroke();
  }

  function paintScope(): void {
    const { w, h } = size(scope, scopeGfx);
    const gfx = scopeGfx;
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    gfx.strokeStyle = ink.grid;
    gfx.lineWidth = 1;
    gfx.beginPath();
    gfx.moveTo(0, h / 2);
    gfx.lineTo(w, h / 2);
    gfx.moveTo(w / 2, 0);
    gfx.lineTo(w / 2, h);
    gfx.stroke();
    gfx.strokeStyle = ink.green;
    gfx.shadowColor = ink.green;
    gfx.shadowBlur = 6;
    gfx.beginPath();
    const samples = engine.scope;
    const pos = engine.scopePos;
    if (!samples || !pos) {
      gfx.moveTo(0, h / 2);
      gfx.lineTo(w, h / 2);
      gfx.stroke();
      gfx.shadowBlur = 0;
      return;
    }
    const write = Atomics.load(pos, 0);
    for (let i = 0; i < SCOPE_LEN; i++) {
      const sample = samples[(write + i) % SCOPE_LEN];
      const x = (i / (SCOPE_LEN - 1)) * w;
      const y = h * (0.5 - clamp(sample, -1, 1) * 0.42);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.stroke();
    gfx.shadowBlur = 0;
  }

  function paintEnv(): void {
    const { w, h } = size(env, envGfx);
    const gfx = envGfx;
    const channel = ui.channel();
    const attack = engine.pattern.attack[channel];
    const decay = engine.pattern.decay[channel];
    const sustain = engine.pattern.sustain[channel];
    const release = engine.pattern.release[channel];
    const hold = 0.18;
    const total = Math.max(0.001, attack + decay + hold + release);
    const points = [
      0, 0,
      attack / total, 1,
      (attack + decay) / total, sustain,
      (attack + decay + hold) / total, sustain,
      1, 0,
    ];
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    gfx.beginPath();
    gfx.moveTo(0, h);
    for (let i = 0; i < points.length; i += 2) {
      gfx.lineTo(points[i] * w, h - 3 - points[i + 1] * (h - 6));
    }
    gfx.lineTo(w, h);
    gfx.closePath();
    gfx.fillStyle = ink.fill;
    gfx.fill();
    gfx.strokeStyle = ink.amber;
    gfx.lineWidth = 1.5;
    gfx.stroke();
  }

  function paintWave(): void {
    const { w, h } = size(wave, waveGfx);
    const gfx = waveGfx;
    const base = ui.channel() * WAVE_LEN;
    gfx.fillStyle = ink.bg;
    gfx.fillRect(0, 0, w, h);
    gfx.strokeStyle = ink.grid;
    gfx.beginPath();
    gfx.moveTo(0, h / 2);
    gfx.lineTo(w, h / 2);
    gfx.stroke();
    gfx.strokeStyle = ink.green;
    gfx.beginPath();
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = ((i + 0.5) / WAVE_LEN) * w;
      const y = h * (0.5 - engine.pattern.wave[base + i] * 0.45);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.stroke();
    gfx.fillStyle = ink.dim;
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = ((i + 0.5) / WAVE_LEN) * w;
      const y = h * (0.5 - engine.pattern.wave[base + i] * 0.45);
      gfx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  return { sync, paint };
}
