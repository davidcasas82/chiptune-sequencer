import { expect, test } from 'vitest';
import { SECTION_TIPS } from '../src/section-tips';
import { TIP_COPY } from '../src/tip-copy';
import { TIP_HOLD_MS, TIP_HOVER_MS, tipPlace } from '../src/tips';

test('each control has its own line, not the section blurb', () => {
  const blurbs = new Set<string>(Object.values(SECTION_TIPS));
  for (const line of Object.values(TIP_COPY)) {
    expect(blurbs.has(line)).toBe(false);
    expect(line.endsWith('.')).toBe(true);
  }
  expect(TIP_COPY['knob-attack']).toBe(
    'How quickly the note fades in. Low means a sharp pluck, high means a slow swell.',
  );
  expect(TIP_COPY['knob-decay']).toMatch(/falls after the attack/);
  expect(TIP_COPY['knob-sustain']).toMatch(/while it holds/);
  expect(TIP_COPY['knob-release']).toMatch(/after it ends/);
  expect(TIP_COPY['knob-vib']).toMatch(/wobble/);
  expect(TIP_COPY['knob-slide']).toMatch(/Glide between notes/);
  expect(TIP_COPY['channel-0']).toBe('Melody, P1, is pulse wave 1, the lead line.');
  expect(TIP_COPY['channel-4']).toMatch(/beyond the classic NES chip/);
  expect(TIP_COPY.quantize).toMatch(/grid/);
  expect(TIP_COPY.lane).toMatch(/1×1\+0/);
  expect(TIP_COPY.bpm).toMatch(/fast/);
  expect(TIP_COPY.swing).toMatch(/off-beats/);
  expect(TIP_HOLD_MS).toBe(500);
  expect(TIP_COPY.presets).toBe(
    'Presets load a set of knob settings. They shape the sound; they are not instruments.',
  );
  expect(TIP_COPY['arp-speed']).toMatch(/12\.5/);
  expect(TIP_COPY['arp-direction']).toMatch(/UpDn/);
  expect(TIP_HOVER_MS).toBeGreaterThanOrEqual(500);
  expect(TIP_HOVER_MS).toBeLessThanOrEqual(700);
});

test('a tip sits below the button unless the screen edge is in the way', () => {
  const below = tipPlace({
    anchorLeft: 200,
    anchorTop: 80,
    anchorWidth: 48,
    anchorHeight: 28,
    tipWidth: 160,
    tipHeight: 36,
    screenWidth: 1180,
    screenHeight: 820,
  });
  expect(below.below).toBe(true);
  expect(below.top).toBeGreaterThan(80 + 28);
  const squeezed = tipPlace({
    anchorLeft: 200,
    anchorTop: 780,
    anchorWidth: 48,
    anchorHeight: 28,
    tipWidth: 160,
    tipHeight: 36,
    screenWidth: 1180,
    screenHeight: 820,
  });
  expect(squeezed.below).toBe(false);
  expect(squeezed.top + 36).toBeLessThanOrEqual(780);
});
