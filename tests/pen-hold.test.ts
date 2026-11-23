import { expect, test } from 'vitest';
import { penMenuHold } from '../src/pen-hold';

test('a pen press with rising pressure does not open the menu', () => {
  expect(penMenuHold({
    pointerType: 'pen',
    startPressure: 0.05,
    pressure: 0.45,
    movedPx: 2,
  })).toBe(false);
  expect(penMenuHold({
    pointerType: 'pen',
    startPressure: 0.16,
    pressure: 0.2,
    movedPx: 3,
  })).toBe(true);
  expect(penMenuHold({
    pointerType: 'touch',
    startPressure: 0,
    pressure: 0,
    movedPx: 20,
  })).toBe(false);
});

test('a still finger keeps the hold', () => {
  expect(penMenuHold({
    pointerType: 'touch',
    startPressure: 0,
    pressure: 0,
    movedPx: 0,
  })).toBe(true);
  expect(penMenuHold({
    pointerType: 'touch',
    startPressure: 0.4,
    pressure: 0.9,
    movedPx: 4,
  })).toBe(true);
});
