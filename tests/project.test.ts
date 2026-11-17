import { describe, expect, test } from 'vitest';
import { applyProject, parseProject, projectFrom, stringifyProject } from '../src/audio/project';
import { createSong, orderSteps, sameSong } from '../src/audio/song';
import { cell } from '../src/audio/synth';

describe('project file', () => {
  test('roundtrips the song, tempo, and effects', () => {
    const song = createSong();
    song.patterns[0].type[4] = 2;
    song.patterns[0].note[cell(4, 0)] = 64;
    const file = projectFrom(song, 96, 0.4, 0.2, 'Night Ride');
    const again = parseProject(stringifyProject(file));
    expect(again).not.toBeNull();
    if (!again) return;
    expect(again.name).toBe('Night Ride');
    expect(again.bpm).toBe(96);
    expect(again.delay).toBeCloseTo(0.4);
    expect(again.crush).toBeCloseTo(0.2);
    const loaded = createSong();
    const applied = applyProject(again, loaded);
    expect(applied.bpm).toBe(96);
    expect(sameSong(song, loaded)).toBe(true);
    expect(orderSteps(song)).toBe(48);
  });

  test('rejects a bad file', () => {
    expect(parseProject('nope')).toBeNull();
    expect(parseProject('{"v":2,"name":"X"}')).toBeNull();
  });
});
