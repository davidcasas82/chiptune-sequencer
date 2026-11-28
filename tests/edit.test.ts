import { describe, expect, test } from 'vitest';
import {
  ARP_DOWN,
  DRUM_HAT,
  DRUM_KICK,
  DRUM_NOTE,
  EMPTY,
  TYPE_NOISE,
  TYPE_PULSE,
  VOL_MAX,
  applyPattern,
  cell,
  clonePattern,
  createPattern,
  createState,
  renderBlock,
  samePattern,
  setTransport,
  writeDemo,
} from '../src/audio/synth';
import {
  cancelEdit,
  clearNote,
  clearSelection,
  commitEdit,
  copyRect,
  createHistory,
  dropDrum,
  findNote,
  moveNote,
  auditionPenTap,
  pasteRect,
  PEN_VOL_MIN,
  penHovering,
  penStrokeVolume,
  penVolume,
  previewEdit,
  putNote,
  redoEdit,
  repeatTap,
  resizeNote,
  setPatternSteps,
  undoEdit,
} from '../src/audio/edit';

function renderLeft(pattern: ReturnType<typeof createPattern>): Float32Array {
  const frames = Math.floor(44100 * 0.4);
  const state = createState();
  applyPattern(state, pattern);
  setTransport(state, 120, 1, 0, 1);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let offset = 0; offset < frames;) {
    const count = Math.min(128, frames - offset);
    renderBlock(state, left.subarray(offset, offset + count), right.subarray(offset, offset + count), offset / 44100, 44100);
    offset += count;
  }
  return left;
}

function peakDiff(a: Float32Array, b: Float32Array): number {
  let diff = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  return diff;
}

describe('pen loudness', () => {
  test('pencil pressure sets the note and a finger or mouse keeps VOL', () => {
    expect(PEN_VOL_MIN).toBe(4);
    expect(penVolume('pen', 1, 0)).toBe(VOL_MAX);
    expect(penVolume('pen', 0.5, 0)).toBe(8);
    expect(penVolume('pen', 0.4, 0)).toBe(6);
    expect(penVolume('pen', 0.2, 0)).toBe(PEN_VOL_MIN);
    expect(penVolume('pen', 0.01, 0)).toBe(PEN_VOL_MIN);
    expect(penVolume('pen', 0, 0)).toBe(0);
    expect(penVolume('pen', 0, 9)).toBe(9);
    expect(penVolume('touch', 0, 9)).toBe(9);
    expect(penVolume('touch', 1, 1)).toBe(1);
    expect(penVolume('mouse', 0.5, 0)).toBe(0);
  });

  test('a pen stroke keeps the pressed loudness when the lift pressure falls', () => {
    const volume = penStrokeVolume([
      { phase: 'down', pressure: 0, t: 0, buttons: 1 },
      { phase: 'move', pressure: 0.8, t: 30, buttons: 1 },
      { phase: 'move', pressure: 0.75, t: 70, buttons: 1 },
      { phase: 'move', pressure: 0.2, t: 140, buttons: 1 },
      { phase: 'move', pressure: 0.04, t: 170, buttons: 1 },
      { phase: 'up', pressure: 0.9, t: 180, buttons: 0 },
    ]);
    expect(volume).toBe(penVolume('pen', 0.8, 0));
    expect(volume).toBe(12);
  });

  test('a quick firm tap is not thrown away with the lift window', () => {
    const volume = penStrokeVolume([
      { phase: 'down', pressure: 0.8, t: 0, buttons: 1 },
      { phase: 'up', pressure: 0.01, t: 12, buttons: 0 },
    ]);
    expect(volume).toBe(12);
  });

  test('a very light pen tap stays audible and a hover does not draw', () => {
    expect(penHovering('pen', 0)).toBe(true);
    expect(penHovering('pen', 1)).toBe(false);
    expect(penStrokeVolume([{ phase: 'hover', pressure: 0.4, t: 0, buttons: 0 }])).toBe(PEN_VOL_MIN);
    const volume = penStrokeVolume([
      { phase: 'down', pressure: 0.02, t: 0, buttons: 1 },
      { phase: 'move', pressure: 0.03, t: 12, buttons: 1 },
      { phase: 'up', pressure: 0, t: 20, buttons: 0 },
    ]);
    expect(volume).toBe(PEN_VOL_MIN);
    const heard: number[] = [];
    auditionPenTap({
      noteOn: (_channel, _note, level) => heard.push(level),
      hit: () => { throw new Error('pitched tap'); },
    }, 0, 72, volume, 0, false);
    expect(heard).toEqual([PEN_VOL_MIN]);
  });
});

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
    pattern.pitch[cell(1, 6)] = 131;
    pattern.stepDuty[cell(1, 6)] = 2;
    pattern.stepArp[cell(1, 6)] = ARP_DOWN;
    expect(moveNote(pattern, 1, 6, 0, 2, 62, 1)).toBe(true);
    expect(pattern.pitch[cell(0, 2)]).toBe(131);
    expect(pattern.stepDuty[cell(0, 2)]).toBe(2);
    expect(pattern.stepArp[cell(0, 2)]).toBe(ARP_DOWN);
    expect(moveNote(pattern, 0, 2, 1, 6, 70, 1)).toBe(true);

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

  test('a drum step keeps kick and hat, and a pitched step still replaces', () => {
    const pattern = createPattern();
    pattern.type[0] = TYPE_PULSE;
    pattern.type[3] = TYPE_NOISE;
    putNote(pattern, 3, 0, 1, DRUM_NOTE, VOL_MAX, DRUM_KICK);
    putNote(pattern, 3, 0, 1, DRUM_NOTE, VOL_MAX, DRUM_HAT);
    expect(pattern.drum[cell(3, 0)]).toBe(DRUM_KICK);
    expect(pattern.drumMask[cell(3, 0)] & (1 << DRUM_HAT)).not.toBe(0);
    expect(pattern.note[cell(3, 0)]).toBe(DRUM_NOTE);
    dropDrum(pattern, 3, 0, DRUM_HAT);
    expect(pattern.drum[cell(3, 0)]).toBe(DRUM_KICK);
    expect(pattern.drumMask[cell(3, 0)]).toBe(0);
    expect(pattern.note[cell(3, 0)]).toBe(DRUM_NOTE);

    putNote(pattern, 0, 0, 4, 60, 12, 0);
    putNote(pattern, 0, 0, 2, 64, VOL_MAX, 0);
    expect(pattern.note[cell(0, 0)]).toBe(64);
    expect(pattern.length[cell(0, 0)]).toBe(2);
    expect(pattern.drumMask[cell(0, 0)]).toBe(0);
  });

  test('changing the stored pitch does not retune a drum track', () => {
    const drums = createPattern();
    drums.type[3] = TYPE_NOISE;
    putNote(drums, 3, 0, 1, DRUM_NOTE, VOL_MAX, DRUM_KICK);
    const raised = clonePattern(drums);
    raised.note[cell(3, 0)] = 72;
    const kit = renderLeft(drums);
    let kitEnergy = 0;
    for (let i = 0; i < kit.length; i++) kitEnergy += kit[i] * kit[i];
    expect(kitEnergy).toBeGreaterThan(0);
    expect(peakDiff(kit, renderLeft(raised))).toBe(0);

    const melody = createPattern();
    melody.type[0] = TYPE_PULSE;
    melody.duty[0] = 0.5;
    putNote(melody, 0, 0, 1, 60, VOL_MAX, 0);
    const higher = clonePattern(melody);
    higher.note[cell(0, 0)] = 72;
    const low = renderLeft(melody);
    const high = renderLeft(higher);
    let energy = 0;
    for (let i = 0; i < low.length; i++) energy += low[i] * low[i];
    expect(energy).toBeGreaterThan(0);
    expect(peakDiff(low, high)).toBeGreaterThan(0);
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

  test('an empty selection deletes nothing', () => {
    const pattern = createPattern();
    putNote(pattern, 0, 0, 2, 60, 12, 0);
    putNote(pattern, 1, 4, 1, 64, 8, 0);
    const before = clonePattern(pattern);
    expect(clearSelection(pattern, null)).toBe(false);
    expect(samePattern(pattern, before)).toBe(true);
    expect(pattern.note[cell(0, 0)]).toBe(60);
    expect(pattern.length[cell(0, 0)]).toBe(2);

    expect(clearSelection(pattern, { c0: 0, c1: 0, s0: 0, s1: 0 })).toBe(true);
    expect(pattern.note[cell(0, 0)]).toBe(EMPTY);
    expect(pattern.note[cell(1, 4)]).toBe(64);
  });

  test('a second tap on the same note is a double-tap, and one tap is not', () => {
    expect(repeatTap(null, 1000, 0, 4)).toBe(false);
    const first = { at: 1000, channel: 1, start: 4 };
    expect(repeatTap(first, 1300, 1, 4)).toBe(true);
    expect(repeatTap(first, 1300, 1, 5)).toBe(false);
    expect(repeatTap(first, 1300, 0, 4)).toBe(false);
    expect(repeatTap(first, 1500, 1, 4)).toBe(false);
    expect(repeatTap(first, 900, 1, 4)).toBe(false);
  });
});
