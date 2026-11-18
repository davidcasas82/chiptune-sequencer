import { expect, test } from 'vitest';
import { clampAudible, strokeOnGrid } from '../src/grid-stroke';

test('a pen stroke on the grid does not scroll and keeps the starting pitch', () => {
  const scrollTop = 120;
  const startRow = 6;
  const startPitch = 67;
  const down = strokeOnGrid({
    pointerType: 'pen',
    pointers: 1,
    scrollbar: false,
    startRow,
    startPitch,
    pointerRow: startRow,
    scrollTop,
    proposedScroll: scrollTop,
  });
  const moved = strokeOnGrid({
    pointerType: 'pen',
    pointers: 1,
    scrollbar: false,
    startRow: down.row,
    startPitch: down.pitch,
    pointerRow: startRow + 18,
    scrollTop: down.scrollTop,
    proposedScroll: down.scrollTop + 240,
  });
  expect(moved.scrollTop).toBe(scrollTop);
  expect(moved.row).toBe(startRow);
  expect(moved.pitch).toBe(startPitch);
});

test('one finger matches the pencil, and two fingers or the ruler may scroll', () => {
  const finger = strokeOnGrid({
    pointerType: 'touch',
    pointers: 1,
    scrollbar: false,
    startRow: 4,
    startPitch: 64,
    pointerRow: 20,
    scrollTop: 30,
    proposedScroll: 90,
  });
  expect(finger.scrollTop).toBe(30);
  expect(finger.pitch).toBe(64);
  const pan = strokeOnGrid({
    pointerType: 'touch',
    pointers: 2,
    scrollbar: false,
    startRow: 4,
    startPitch: 64,
    pointerRow: 20,
    scrollTop: 30,
    proposedScroll: 90,
  });
  expect(pan.scrollTop).toBe(90);
  const ruler = strokeOnGrid({
    pointerType: 'pen',
    pointers: 1,
    scrollbar: true,
    startRow: 4,
    startPitch: 64,
    pointerRow: 4,
    scrollTop: 30,
    proposedScroll: 55,
  });
  expect(ruler.scrollTop).toBe(55);
});

test('pitches outside the musical range are clamped', () => {
  expect(clampAudible(0, 5)).toBe(48);
  expect(clampAudible(0, 120)).toBe(84);
  expect(clampAudible(2, 10)).toBe(28);
  expect(clampAudible(4, 28)).toBe(28);
});
