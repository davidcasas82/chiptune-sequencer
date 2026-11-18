import { expect, test } from 'vitest';
import { LEVEL_KEY, readLevel, writeLevel } from '../src/level';

test('beginner is the default and the choice is stored apart from the song', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  expect(readLevel(storage)).toBe('beginner');
  expect(readLevel(null)).toBe('beginner');

  writeLevel('full', storage);
  expect(readLevel(storage)).toBe('full');
  expect([...store.keys()]).toEqual([LEVEL_KEY]);
  expect(LEVEL_KEY).not.toBe('chiptune-autosave');
  expect(LEVEL_KEY).not.toBe('chiptune-projects');

  writeLevel('beginner', storage);
  expect(readLevel(storage)).toBe('beginner');
  store.set(LEVEL_KEY, 'other');
  expect(readLevel(storage)).toBe('beginner');
});
