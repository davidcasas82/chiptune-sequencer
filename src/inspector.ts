import { findNote } from './audio/edit';
import type { Engine } from './audio/engine';
import {
  ARP_OFF,
  DUTY_VALUE,
  FX_INHERIT,
  LFSR_FOLLOW,
  PITCH_CENTER,
  PRESET_KICK,
  SCOPE_LEN,
  TYPE_NOISE,
  TYPE_PULSE,
  TYPE_TRI,
  WAVE_LEN,
  applyPreset,
  cell,
  clampPitch,
  stepIndex,
  type Pattern,
} from './audio/synth';

const GREEN = '#39ff6a';
const AMBER = '#ffb000';
const DIM = '#1b5c32';
const BG = '#070a08';

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
  { id: 'arp', min: 0, max: 32, show: (type) => type === TYPE_PULSE || type === TYPE_TRI, read: (p, ch) => p.arpRate[ch], write: (p, ch, v) => { p.arpRate[ch] = v; }, text: (v) => v.toFixed(0) },
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
  const lfsrRow = required(document.querySelector<HTMLElement>('#lfsr-row'), 'lfsr-row');
  const stepDutyRow = required(document.querySelector<HTMLElement>('#step-duty'), 'step-duty');
  const stepArpRow = required(document.querySelector<HTMLElement>('#step-arp'), 'step-arp');
  const stepDutyLabel = required(document.querySelector<HTMLElement>('#step-duty-label'), 'step-duty-label');
  const stepArpLabel = required(document.querySelector<HTMLElement>('#step-arp-label'), 'step-arp-label');
  const pitchOut = required(document.querySelector<HTMLOutputElement>('#pitch-out'), 'pitch-out');
  const leds = [...document.querySelectorAll<HTMLElement>('.led')];
  const dutyButtons = [...dutyRow.querySelectorAll<HTMLButtonElement>('[data-duty]')];
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

  function selectedDrum(): number {
    const found = findNote(engine.pattern, ui.channel(), ui.step());
    if (found && typeOf() === TYPE_NOISE) return found.drum;
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
    let drag: { y: number; value: number } | null = null;
    const applyValue = (value: number) => {
      const channel = ui.channel();
      const next = clamp(value, spec.min, spec.max);
      engine.apply((pattern) => spec.write(pattern, channel, next));
    };
    button.addEventListener('pointerdown', (event) => {
      button.setPointerCapture(event.pointerId);
      drag = { y: event.clientY, value: spec.read(engine.pattern, ui.channel()) };
      engine.begin();
      event.preventDefault();
    });
    button.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const span = spec.max - spec.min;
      const scale = event.shiftKey ? 220 : 90;
      applyValue(drag.value + ((drag.y - event.clientY) / scale) * span);
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      engine.commit();
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const dir = event.key === 'ArrowUp' ? 1 : -1;
      const step = (spec.max - spec.min) / (event.shiftKey ? 80 : 20);
      const channel = ui.channel();
      engine.apply((pattern) => spec.write(pattern, channel, clamp(spec.read(pattern, channel) + dir * step, spec.min, spec.max)));
      engine.commit();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    button.addEventListener('click', () => {
      const preset = Number(button.dataset.preset);
      const channel = ui.channel();
      engine.apply((pattern) => {
        applyPreset(pattern, channel, preset);
        if (preset < PRESET_KICK || pattern.type[channel] !== TYPE_NOISE) return;
        const drum = preset - PRESET_KICK;
        ui.setDrum(drum);
        const found = findNote(pattern, channel, ui.step());
        if (found) pattern.drum[cell(channel, found.start)] = drum;
      });
      engine.commit();
    });
  }

  for (const button of dutyButtons) {
    button.addEventListener('click', () => {
      const duty = DUTY_VALUE[Number(button.dataset.duty)] ?? 0.5;
      const channel = ui.channel();
      engine.apply((pattern) => {
        pattern.duty[channel] = duty;
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
    });
    waveIndex = index;
    waveValue = value;
  };
  wave.addEventListener('pointerdown', (event) => {
    if (typeOf() !== TYPE_TRI) return;
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
    const type = typeOf();
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
    dutyRow.hidden = type !== TYPE_PULSE;
    arpRow.hidden = type !== TYPE_PULSE && type !== TYPE_TRI;
    wave.hidden = type !== TYPE_TRI;
    lfsrRow.hidden = type !== TYPE_NOISE;
    stepDutyRow.hidden = type !== TYPE_PULSE;
    stepDutyLabel.hidden = type !== TYPE_PULSE;
    stepArpRow.hidden = type !== TYPE_PULSE && type !== TYPE_TRI;
    stepArpLabel.hidden = type !== TYPE_PULSE && type !== TYPE_TRI;

    let dutyPick = 0;
    let dutyErr = 1;
    for (let i = 0; i < DUTY_VALUE.length; i++) {
      const err = Math.abs(pattern.duty[channel] - DUTY_VALUE[i]);
      if (err < dutyErr) {
        dutyErr = err;
        dutyPick = i;
      }
    }
    for (const button of dutyButtons) setOn(button, Number(button.dataset.duty) === dutyPick);
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

    const head = engine.playing ? stepIndex(engine.now(), engine.startTime, engine.bpm, pattern.steps) : -1;
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
  }

  function paintScope(): void {
    const { w, h } = size(scope, scopeGfx);
    const gfx = scopeGfx;
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, h);
    gfx.strokeStyle = '#182116';
    gfx.lineWidth = 1;
    gfx.beginPath();
    gfx.moveTo(0, h / 2);
    gfx.lineTo(w, h / 2);
    gfx.moveTo(w / 2, 0);
    gfx.lineTo(w / 2, h);
    gfx.stroke();
    gfx.strokeStyle = GREEN;
    gfx.shadowColor = GREEN;
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
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, h);
    gfx.beginPath();
    gfx.moveTo(0, h);
    for (let i = 0; i < points.length; i += 2) {
      gfx.lineTo(points[i] * w, h - 3 - points[i + 1] * (h - 6));
    }
    gfx.lineTo(w, h);
    gfx.closePath();
    gfx.fillStyle = '#12361f';
    gfx.fill();
    gfx.strokeStyle = AMBER;
    gfx.lineWidth = 1.5;
    gfx.stroke();
  }

  function paintWave(): void {
    const { w, h } = size(wave, waveGfx);
    const gfx = waveGfx;
    const base = ui.channel() * WAVE_LEN;
    gfx.fillStyle = BG;
    gfx.fillRect(0, 0, w, h);
    gfx.strokeStyle = '#182116';
    gfx.beginPath();
    gfx.moveTo(0, h / 2);
    gfx.lineTo(w, h / 2);
    gfx.stroke();
    gfx.strokeStyle = GREEN;
    gfx.beginPath();
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = ((i + 0.5) / WAVE_LEN) * w;
      const y = h * (0.5 - engine.pattern.wave[base + i] * 0.45);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.stroke();
    gfx.fillStyle = DIM;
    for (let i = 0; i < WAVE_LEN; i++) {
      const x = ((i + 0.5) / WAVE_LEN) * w;
      const y = h * (0.5 - engine.pattern.wave[base + i] * 0.45);
      gfx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  return { sync, paint };
}
