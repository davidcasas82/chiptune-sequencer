import { describe, expect, test } from 'vitest';
import {
  EMPTY,
  TYPE_PULSE,
  VOL_MAX,
  cell,
  createPattern,
  writeDemo,
} from '../src/audio/synth';
import {
  cancelEdit,
  clearNote,
  commitEdit,
  copyRect,
  createHistory,
  findNote,
  moveNote,
  pasteRect,
  previewEdit,
  putNote,
  redoEdit,
  resizeNote,
  setPatternSteps,
  undoEdit,
} from '../src/audio/edit';

describe('pattern edits', () => {
  test('writes a note, shortens the one it covers, and clears it', () => {
    const pattern = createPattern();
    putNote(pattern, 0, 0, 8, 60, 12, 0);
    expect(pattern.note[cell(0, 0)]).toBe(60);
    expect(pattern.length[cell(0, 0)]).toBe(8);
    expect(pattern.volume[cell(0, 0)]).toBe(12);
    expect(findNote(pattern, 0, 5)?.start).toBe(0);

    putNote(pattern, 0, 4, 2, 64, VOL_MAX, 0);
    expect(pattern.length[cell(0, 0)]).toBe(4);
    expect(pattern.note[cell(0, 4)]).toBe(64);
    expect(findNote(pattern, 0, 5)?.note).toBe(64);

    clearNote(pattern, 0, 5);
    expect(pattern.note[cell(0, 4)]).toBe(EMPTY);
    expect(pattern.note[cell(0, 0)]).toBe(60);
  });

  test('moves and resizes a note without losing its volume', () => {
    const pattern = createPattern();
    putNote(pattern, 0, 1, 3, 67, 9, 2);
    expect(moveNote(pattern, 0, 2, 1, 6, 70, 1)).toBe(true);
    expect(pattern.note[cell(0, 1)]).toBe(EMPTY);
    expect(pattern.note[cell(1, 6)]).toBe(70);
    expect(pattern.length[cell(1, 6)]).toBe(3);
    expect(pattern.volume[cell(1, 6)]).toBe(9);
    expect(pattern.drum[cell(1, 6)]).toBe(1);

    resizeNote(pattern, 1, 6, 6);
    expect(pattern.length[cell(1, 6)]).toBe(6);
    putNote(pattern, 1, 10, 1, 72, VOL_MAX, 0);
    resizeNote(pattern, 1, 6, 8);
    expect(pattern.length[cell(1, 6)]).toBe(4);
  });

  test('shrinks note tails when the pattern gets shorter and keeps steps past the end', () => {
    const pattern = createPattern();
    pattern.steps = 32;
    putNote(pattern, 0, 12, 8, 60, VOL_MAX, 0);
    putNote(pattern, 2, 20, 2, 48, VOL_MAX, 0);
    setPatternSteps(pattern, 16);
    expect(pattern.steps).toBe(16);
    expect(pattern.length[cell(0, 12)]).toBe(4);
    expect(pattern.note[cell(2, 20)]).toBe(48);
    setPatternSteps(pattern, 32);
    expect(pattern.note[cell(2, 20)]).toBe(48);
    expect(findNote(pattern, 2, 20)?.note).toBe(48);
  });

  test('copies steps and pastes them at a new start', () => {
    const pattern = createPattern();
    writeDemo(pattern);
    const clip = copyRect(pattern, 0, 0, 1, 3);
    pasteRect(pattern, clip, 2, 8);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        expect(pattern.note[cell(2 + row, 8 + col)]).toBe(pattern.note[cell(row, col)]);
        expect(pattern.length[cell(2 + row, 8 + col)]).toBe(pattern.length[cell(row, col)]);
        expect(pattern.volume[cell(2 + row, 8 + col)]).toBe(pattern.volume[cell(row, col)]);
      }
    }
  });

  test('undo and redo restore pitch, length, and volume', () => {
    const pattern = createPattern();
    pattern.type[0] = TYPE_PULSE;
    putNote(pattern, 0, 0, 2, 60, 11, 0);
    const history = createHistory();
    previewEdit(history, pattern, (current) => {
      putNote(current, 0, 4, 3, 72, 8, 0);
    });
    commitEdit(history, pattern);
    expect(pattern.note[cell(0, 4)]).toBe(72);
    expect(undoEdit(history, pattern)).toBe(true);
    expect(pattern.note[cell(0, 4)]).toBe(EMPTY);
    expect(pattern.note[cell(0, 0)]).toBe(60);
    expect(pattern.length[cell(0, 0)]).toBe(2);
    expect(pattern.volume[cell(0, 0)]).toBe(11);
    expect(redoEdit(history, pattern)).toBe(true);
    expect(pattern.note[cell(0, 4)]).toBe(72);
    expect(pattern.length[cell(0, 4)]).toBe(3);
    expect(pattern.volume[cell(0, 4)]).toBe(8);
  });

  test('cancel puts a gesture back', () => {
    const pattern = createPattern();
    putNote(pattern, 0, 0, 1, 60, VOL_MAX, 0);
    const history = createHistory();
    previewEdit(history, pattern, (current) => {
      clearNote(current, 0, 0);
    });
    expect(pattern.note[cell(0, 0)]).toBe(EMPTY);
    cancelEdit(history, pattern);
    expect(pattern.note[cell(0, 0)]).toBe(60);
    expect(undoEdit(history, pattern)).toBe(false);
  });
});
