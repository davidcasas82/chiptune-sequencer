import { expect, test } from 'vitest';
import { SECTION_TIPS } from '../src/section-tips';
import { plainText, TIP_HOLD_MS, tipText } from '../src/tips';

test('short control labels become plain words', () => {
  expect(plainText('Qnt')).toBe('Quantize');
  expect(plainText('WavP')).toBe('Pattern audio');
  expect(plainText('Play')).toBe('Play');
  expect(plainText('  Kick  ')).toBe('Kick');
});

test('tips keep the stored section sentence', () => {
  expect(tipText('Play', SECTION_TIPS.play)).toEqual({
    title: 'Play',
    detail: 'Start and stop, and set how fast the song goes.',
  });
  expect(tipText('Kick', SECTION_TIPS.drums).detail).toBe(SECTION_TIPS.drums);
  expect(tipText('Attack', SECTION_TIPS.shape).detail).toBe(SECTION_TIPS.shape);
  expect(tipText('Same words', 'Same words').detail).toBe('');
  expect(TIP_HOLD_MS).toBe(500);
});
