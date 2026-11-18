import { expect, test } from 'vitest';
import { SECTION_TIPS } from '../src/section-tips';
import { TIP_COPY } from '../src/tip-copy';
import { TIP_HOLD_MS } from '../src/tips';

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
});
