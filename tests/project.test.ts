import { describe, expect, test, vi } from 'vitest';
import { createEngine } from '../src/audio/engine';
import {
  applyProject,
  loadAuto,
  loadNamed,
  parseProject,
  projectFrom,
  saveAuto,
  saveNamed,
  stringifyProject,
} from '../src/audio/project';
import { createSong, orderSteps, sameSong } from '../src/audio/song';
import { MAX_CHANNELS, cell } from '../src/audio/synth';

function openMix(): number[] {
  return Array.from({ length: MAX_CHANNELS }, () => 0);
}

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

  test('roundtrips mute and solo with the song', () => {
    const song = createSong();
    song.patterns[0].note[cell(2, 3)] = 40;
    song.swing = 62;
    const mute = openMix();
    const solo = openMix();
    mute[1] = 1;
    mute[4] = 1;
    solo[2] = 1;
    const file = projectFrom(song, 140, 0.15, 0.8, 'Mix Ride', mute, solo);
    const again = parseProject(stringifyProject(file));
    expect(again).not.toBeNull();
    if (!again) return;
    expect(again.mute).toEqual(mute);
    expect(again.solo).toEqual(solo);
    const loaded = createSong();
    const applied = applyProject(again, loaded);
    expect(sameSong(song, loaded)).toBe(true);
    expect(applied.bpm).toBe(140);
    expect(applied.name).toBe('Mix Ride');
    expect(applied.mute).toEqual(mute);
    expect(applied.solo).toEqual(solo);
    expect(loaded.patterns[0].note[cell(2, 3)]).toBe(40);
    expect(loaded.swing).toBe(62);
  });

  test('loads an older song with every track open', () => {
    const song = createSong();
    song.patterns[1].type[0] = 3;
    song.patterns[1].note[cell(0, 1)] = 72;
    song.orderTr[2] = -3;
    song.scale = 2;
    song.root = 5;
    const file = projectFrom(song, 110, 0.25, 0.1, 'Old Reel');
    const raw = JSON.parse(stringifyProject(file)) as Record<string, unknown>;
    delete raw.mute;
    delete raw.solo;
    const again = parseProject(JSON.stringify(raw));
    expect(again).not.toBeNull();
    if (!again) return;
    expect(again.mute).toEqual(openMix());
    expect(again.solo).toEqual(openMix());
    expect(again.bpm).toBe(110);
    expect(again.delay).toBeCloseTo(0.25);
    expect(again.crush).toBeCloseTo(0.1);
    expect(again.name).toBe('Old Reel');
    const loaded = createSong();
    const applied = applyProject(again, loaded);
    expect(sameSong(song, loaded)).toBe(true);
    expect(applied.mute).toEqual(openMix());
    expect(applied.solo).toEqual(openMix());
    expect(loaded.patterns[1].note[cell(0, 1)]).toBe(72);
    expect(loaded.orderTr[2]).toBe(-3);
    expect(loaded.scale).toBe(2);
    expect(loaded.root).toBe(5);

    const engine = createEngine();
    engine.setMute(2, true);
    engine.setSolo(4, true);
    engine.loadProject(again);
    expect(Array.from(engine.mute)).toEqual(openMix());
    expect(Array.from(engine.solo)).toEqual(openMix());
    expect(sameSong(song, engine.song)).toBe(true);
  });

  test('mute and solo mark the song unsaved', () => {
    const engine = createEngine();
    const clean = stringifyProject(engine.snapshot());
    expect(engine.snapshot().mute).toEqual(openMix());
    expect(engine.snapshot().solo).toEqual(openMix());

    engine.setMute(0, true);
    const muted = stringifyProject(engine.snapshot());
    expect(muted).not.toBe(clean);

    engine.setSolo(3, true);
    const mixed = stringifyProject(engine.snapshot());
    expect(mixed).not.toBe(muted);
    expect(mixed).not.toBe(clean);

    const restored = parseProject(mixed);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.mute[0]).toBe(1);
    expect(restored.solo[3]).toBe(1);
    const next = createEngine();
    next.loadProject(restored);
    expect(next.mute[0]).toBe(1);
    expect(next.mute[1]).toBe(0);
    expect(next.solo[3]).toBe(1);
    expect(next.solo[0]).toBe(0);
    expect(stringifyProject(next.snapshot())).toBe(mixed);

    engine.setMute(0, false);
    engine.setSolo(3, false);
    expect(stringifyProject(engine.snapshot())).toBe(clean);
  });

  test('keeps the autosave and project list keys', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    try {
      saveAuto('{"v":1}');
      saveNamed([{ id: 'song', name: 'Demo', body: '{"v":1}' }]);
      expect([...store.keys()].sort()).toEqual(['chiptune-autosave', 'chiptune-projects']);
      expect(loadAuto()).toBe('{"v":1}');
      expect(loadNamed()).toEqual([{ id: 'song', name: 'Demo', body: '{"v":1}' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
