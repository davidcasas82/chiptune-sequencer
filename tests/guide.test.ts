import { expect, test } from 'vitest';
import { AUTO_KEY, LIST_KEY } from '../src/audio/project';
import { createSong } from '../src/audio/song';
import { SECTION_TIPS } from '../src/section-tips';
import { DRUM_HAT, DRUM_KICK, DRUM_SNARE, EMPTY, cell, createPattern, writeDemo, writeStarter } from '../src/audio/synth';
import { GUIDE_CARDS, GUIDE_KEY, guideShouldOpen } from '../src/guide';
import { GLOSSARY } from '../src/glossary';
import { TIP_COPY } from '../src/tip-copy';

function memory(values: Record<string, string> = {}): { getItem(key: string): string | null } {
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

function notes(pattern: ReturnType<typeof createPattern>): number {
  let count = 0;
  for (const note of pattern.note) if (note !== EMPTY) count += 1;
  return count;
}

test('the walkthrough is four plain cards and stays off the song keys', () => {
  expect(GUIDE_CARDS).toHaveLength(4);
  expect(GUIDE_CARDS.map((card) => card.title)).toEqual([
    'Hear the beat',
    'Write a note',
    'Change the sound',
    'Save it',
  ]);
  const text = GUIDE_CARDS.map((card) => `${card.title} ${card.body}`).join(' ').toLowerCase();
  expect(text).toContain('starter beat');
  expect(text).toContain('play');
  expect(text).not.toContain('beginner');
  expect(GUIDE_KEY).not.toBe(AUTO_KEY);
  expect(GUIDE_KEY).not.toBe(LIST_KEY);
  expect(guideShouldOpen(memory())).toBe(true);
  expect(guideShouldOpen(memory({ [GUIDE_KEY]: '1' }))).toBe(false);
  expect(guideShouldOpen(memory({ [AUTO_KEY]: '{"v":1}' }))).toBe(false);
  expect(guideShouldOpen(memory({ [LIST_KEY]: '[]' }))).toBe(true);
  expect(guideShouldOpen(memory({ [LIST_KEY]: '[{"id":"a"}]' }))).toBe(false);
  expect(guideShouldOpen({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
});

test('the glossary uses the one-line control tips', () => {
  const tips = new Set<string>(Object.values(TIP_COPY));
  const blurbs = new Set<string>(Object.values(SECTION_TIPS));
  expect(GLOSSARY.length).toBeGreaterThan(4);
  for (const group of GLOSSARY) {
    expect(blurbs.has(group.blurb)).toBe(true);
    for (const line of group.lines) expect(blurbs.has(line)).toBe(true);
    for (const entry of group.items) expect(tips.has(entry.tip)).toBe(true);
  }
  const play = GLOSSARY.find((group) => group.title === 'Play');
  expect(play?.items[0]).toEqual({ name: 'Play', tip: TIP_COPY.play });
  expect(GLOSSARY.some((group) => group.items.some((entry) => entry.name === '?'))).toBe(true);
});

test('the starter beat is a short loop on the first pattern', () => {
  const pattern = createPattern();
  writeStarter(pattern);
  const demo = createPattern();
  writeDemo(demo);
  expect(pattern.steps).toBe(16);
  expect(pattern.note[cell(0, 0)]).toBe(72);
  expect(pattern.note[cell(0, 1)]).toBe(EMPTY);
  expect(pattern.note[cell(2, 0)]).toBe(48);
  expect(pattern.drum[cell(3, 0)]).toBe(DRUM_KICK);
  expect(pattern.drum[cell(3, 2)]).toBe(DRUM_HAT);
  expect(pattern.drum[cell(3, 4)]).toBe(DRUM_SNARE);
  expect(notes(pattern)).toBeLessThan(notes(demo));
  for (let step = 0; step < pattern.steps; step++) {
    expect(pattern.note[cell(4, step)]).toBe(EMPTY);
    expect(pattern.note[cell(5, step)]).toBe(EMPTY);
  }
  const song = createSong();
  expect(song.playSong).toBe(0);
  expect(song.orderLen).toBe(3);
  expect(song.patterns[0].note[cell(0, 0)]).toBe(72);
  expect(song.patterns[0].drum[cell(3, 0)]).toBe(DRUM_KICK);
});
