import './style.css';
import {
  DEMO_BPM,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_SNARE,
  MAX_BPM,
  MIN_BPM,
  SOUNDING_CHANNELS,
  STEP_COUNT,
  stepIndex,
} from './audio/synth';
import { createEngine, renderDemoWav } from './audio/engine';

declare global {
  interface Window {
    renderDemoWav: () => Promise<string>;
  }
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

const engine = createEngine();
const playButton = required(document.querySelector<HTMLButtonElement>('#play'), 'play');
const bpmInput = required(document.querySelector<HTMLInputElement>('#bpm'), 'bpm');
const bpmOut = required(document.querySelector<HTMLOutputElement>('#bpm-out'), 'bpm-out');
const canvas = required(document.querySelector<HTMLCanvasElement>('#grid'), 'grid');
const gfx = required(canvas.getContext('2d'), 'canvas');

const labels = ['P1', 'P2', 'TRI', 'NSE'];
let hold: { row: number; col: number; pressure: number } | null = null;

function syncTransport(): void {
  playButton.textContent = engine.playing ? 'Stop' : 'Play';
  playButton.dataset.on = engine.playing ? '1' : '0';
  playButton.setAttribute('aria-pressed', engine.playing ? 'true' : 'false');
  bpmOut.textContent = String(engine.bpm);
  bpmInput.value = String(engine.bpm);
}

document.addEventListener('pointerdown', () => {
  void engine.resume();
});

playButton.addEventListener('click', async () => {
  await engine.resume();
  if (engine.playing) engine.stop();
  else await engine.play();
  syncTransport();
});

bpmInput.addEventListener('input', () => {
  engine.setBpm(Number(bpmInput.value));
  bpmOut.textContent = String(engine.bpm);
});

function cellFromEvent(event: PointerEvent): { row: number; col: number } | null {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const labelW = rect.width * 0.08;
  if (x < labelW) return null;
  const col = Math.floor(((x - labelW) / (rect.width - labelW)) * STEP_COUNT);
  const row = Math.floor((y / rect.height) * SOUNDING_CHANNELS);
  if (row < 0 || row >= SOUNDING_CHANNELS || col < 0 || col >= STEP_COUNT) return null;
  return { row, col };
}

canvas.addEventListener('pointerdown', (event) => {
  const hit = cellFromEvent(event);
  if (!hit) return;
  canvas.setPointerCapture(event.pointerId);
  const pressure = event.pointerType === 'pen' ? (event.pressure > 0 ? event.pressure : 0.5) : 1;
  engine.toggle(hit.row, hit.col);
  hold = { row: hit.row, col: hit.col, pressure };
  event.preventDefault();
});

function clearHold(event: PointerEvent): void {
  hold = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', clearHold);
canvas.addEventListener('pointercancel', clearHold);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

function fit(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function draw(): void {
  fit();
  const width = canvas.width;
  const height = canvas.height;
  gfx.fillStyle = '#070a08';
  gfx.fillRect(0, 0, width, height);
  const labelW = Math.round(width * 0.08);
  const cellW = (width - labelW) / STEP_COUNT;
  const cellH = height / SOUNDING_CHANNELS;
  const head = engine.playing ? stepIndex(engine.now(), engine.startTime, engine.bpm) : -1;
  const labelFont = `${Math.max(14, Math.floor(cellH * 0.16))}px ui-monospace, monospace`;
  const drumFont = `${Math.max(18, Math.floor(cellH * 0.22))}px ui-monospace, monospace`;

  for (let col = 0; col < STEP_COUNT; col++) {
    if (Math.floor(col / 4) % 2 === 0) {
      gfx.fillStyle = '#0c120e';
      gfx.fillRect(labelW + col * cellW, 0, cellW, height);
    }
  }
  if (head >= 0) {
    gfx.fillStyle = 'rgba(255, 176, 0, 0.14)';
    gfx.fillRect(labelW + head * cellW, 0, cellW, height);
  }

  gfx.textBaseline = 'middle';
  gfx.font = labelFont;
  for (let row = 0; row < SOUNDING_CHANNELS; row++) {
    gfx.fillStyle = '#ffb000';
    gfx.textAlign = 'left';
    gfx.font = labelFont;
    gfx.fillText(labels[row], 16, row * cellH + cellH / 2);
    for (let col = 0; col < STEP_COUNT; col++) {
      const index = row * STEP_COUNT + col;
      const on = engine.pattern.gate[index] === 1;
      const x = labelW + col * cellW;
      const y = row * cellH;
      const pad = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.08));
      const pressed = hold;
      if (pressed && pressed.row === row && pressed.col === col) {
        const amount = pressed.pressure;
        gfx.fillStyle = on
          ? `rgb(${Math.floor(40 + 20 * amount)}, 255, ${Math.floor(90 + 40 * amount)})`
          : '#1c2c1c';
      } else {
        gfx.fillStyle = on ? '#39ff6a' : '#121a12';
      }
      gfx.fillRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2);
      if (row === 3) {
        const drum = engine.pattern.drum[index];
        const glyph = drum === DRUM_KICK ? 'K' : drum === DRUM_SNARE ? 'S' : 'H';
        gfx.fillStyle = on ? '#071007' : '#6a5420';
        gfx.font = drumFont;
        gfx.textAlign = 'center';
        gfx.fillText(glyph, x + cellW / 2, y + cellH / 2);
      }
      if (col === head) {
        gfx.strokeStyle = '#ffb000';
        gfx.lineWidth = Math.max(2, Math.floor(cellW * 0.04));
        gfx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
      }
    }
    gfx.strokeStyle = '#24301a';
    gfx.lineWidth = 1;
    gfx.beginPath();
    gfx.moveTo(0, (row + 1) * cellH);
    gfx.lineTo(width, (row + 1) * cellH);
    gfx.stroke();
  }

  gfx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < height; y += 3) gfx.fillRect(0, y, width, 1);
}

new ResizeObserver(() => {
  fit();
}).observe(canvas);

requestAnimationFrame(function loop() {
  draw();
  requestAnimationFrame(loop);
});

bpmInput.min = String(MIN_BPM);
bpmInput.max = String(MAX_BPM);
bpmInput.value = String(DEMO_BPM);
syncTransport();
window.renderDemoWav = renderDemoWav;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
  });
}
