import { expect, test } from 'vitest';
import { clampAudible, dragHeldPitch, holdPitchView, strokeOnGrid } from '../src/grid-stroke';

test('a pen stroke on the grid does not scroll and keeps the starting pitch', () => {
  const scrollTop = 120;
  const startRow = 6;
  const startPitch = 67;
  const down = strokeOnGrid({
    pointerType: 'pen',
    pointers: 1,
    startRow,
    startPitch,
    pointerRow: startRow,
    scrollTop,
    proposedScroll: scrollTop,
  });
  const moved = strokeOnGrid({
    pointerType: 'pen',
    pointers: 1,
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

test('one finger matches the pencil, and two fingers may scroll', () => {
  const finger = strokeOnGrid({
    pointerType: 'touch',
    pointers: 1,
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
    startRow: 4,
    startPitch: 64,
    pointerRow: 20,
    scrollTop: 30,
    proposedScroll: 90,
  });
  expect(pan.scrollTop).toBe(90);
});

test('a horizontal drag keeps the pitch where the stroke started', () => {
  const c4 = 60;
  const held = holdPitchView({ lo: 48, hi: 72, scrollTop: 4 });
  let view = held;
  let pitch = c4;
  for (let step = 0; step < 5; step++) {
    const next = dragHeldPitch(view, pitch);
    view = next.view;
    pitch = next.pitch;
  }
  expect(pitch).toBe(c4);
  expect(view).toEqual(held);
});

test('pitches outside the musical range are clamped', () => {
  expect(clampAudible(0, 5)).toBe(48);
  expect(clampAudible(0, 120)).toBe(84);
  expect(clampAudible(2, 10)).toBe(28);
  expect(clampAudible(4, 28)).toBe(28);
});
