import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/audio/engine';
import {
  BAD_SONG_FILE,
  DATA_WARNING,
  SHARE_CANCELLED,
  STORAGE_FULL,
  bootDocument,
  decideSave,
  deleteSaved,
  downloadAllBody,
  migrateLibrary,
  newestFirst,
  nextSongTitle,
  persistScratch,
  pickScratch,
  removeLibrarySong,
  renameProjectBody,
  replaceQuestion,
  songWhen,
  undoSaved,
  writeLibrarySong,
  type KeyValueStore,
  type LibrarySession,
  type SongStore,
  type UserSong,
} from '../src/audio/library';
import {
  AUTO_KEY,
  LIST_KEY,
  PROJECT_VERSION,
  SCRATCH_REV_KEY,
  cleanProjectName,
  projectName,
  shareWasCancelled,
  stringifyProject,
} from '../src/audio/project';

function memoryLocal(seed: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function memoryStore(readBack?: (song: UserSong) => UserSong): SongStore & { fail: boolean; songs: Map<string, UserSong> } {
  const songs = new Map<string, UserSong>();
  const meta = new Map<string, unknown>();
  const store = {
    fail: false,
    songs,
    async getSongs() {
      return [...songs.values()].map((song) => (readBack ? readBack(song) : song));
    },
    async putSong(song: UserSong) {
      if (store.fail) throw new Error('QuotaExceededError');
      songs.set(song.id, { ...song });
    },
    async deleteSong(id: string) {
      if (store.fail) throw new Error('QuotaExceededError');
      songs.delete(id);
    },
    async getMeta<T>(key: string) {
      return (meta.has(key) ? meta.get(key) : null) as T | null;
    },
    async setMeta(key: string, value: unknown) {
      if (store.fail) throw new Error('QuotaExceededError');
      meta.set(key, value);
    },
  };
  return store;
}

function song(id: string, name: string, body: string, savedAt: number): UserSong {
  return { id, name, body, savedAt };
}

function session(partial: Partial<LibrarySession> = {}): LibrarySession {
  return {
    songs: [],
    openId: '',
    savedBody: null,
    holdDeleted: false,
    trash: null,
    ...partial,
  };
}

describe('song names', () => {
  test('strips characters save will not keep', () => {
    expect(cleanProjectName('Night!! Ride')).toBe('Night Ride');
    expect(cleanProjectName('!!!')).toBe('');
    expect(projectName('!!!')).toBe('Demo');
    expect(projectName(` ${'N'.repeat(50)} `)).toBe('N'.repeat(40));
    expect(cleanProjectName('N'.repeat(50))).toHaveLength(40);
    expect(PROJECT_VERSION).toBe(1);
  });

  test('new songs use Song, then Song 2, Song 3', () => {
    expect(nextSongTitle([])).toBe('Song');
    expect(nextSongTitle(['Song'])).toBe('Song 2');
    expect(nextSongTitle(['Song', 'Song 2'])).toBe('Song 3');
    expect(nextSongTitle(['Song 2'])).toBe('Song');
  });
});

describe('save rules', () => {
  const songs = [song('a', 'Song', '{"v":1}', 1), song('b', 'Night Ride', '{"v":1}', 2)];

  test('save updates the open song and save as new always appends', () => {
    expect(decideSave(songs, 'b', 'Night Ride', false)).toEqual({ type: 'update', id: 'b' });
    expect(decideSave(songs, 'b', 'Night Ride', true)).toEqual({ type: 'append' });
    expect(decideSave(songs, '', 'Fresh', false)).toEqual({ type: 'append' });
  });

  test('a name owned by a different song asks, and save as new is the other choice', () => {
    expect(decideSave(songs, 'b', 'Song', false)).toEqual({ type: 'ask', otherId: 'a', name: 'Song' });
    expect(replaceQuestion('Song')).toBe('Replace your song named Song?');
    expect(decideSave(songs, 'b', 'Song', true)).toEqual({ type: 'append' });
  });

  test('a refused write leaves the library unchanged', async () => {
    const store = memoryStore();
    store.fail = true;
    const before = [song('a', 'Song', 'body-a', 1)];
    expect(await writeLibrarySong(store, before, song('b', 'Other', 'body-b', 2))).toBeNull();
    expect(before).toEqual([song('a', 'Song', 'body-a', 1)]);
    expect(store.songs.size).toBe(0);
    expect(await removeLibrarySong(store, before, 'a')).toBeNull();
    expect(before).toHaveLength(1);
  });

  test('a successful write keeps the previous songs', async () => {
    const store = memoryStore();
    const before = [song('a', 'Song', 'body-a', 1)];
    const next = await writeLibrarySong(store, before, song('a', 'Song', 'body-b', 2));
    expect(next).toEqual([song('a', 'Song', 'body-b', 2)]);
    expect(before[0].body).toBe('body-a');
    expect(store.songs.get('a')?.body).toBe('body-b');
  });
});

describe('reload and delete', () => {
  test('a scratch that differs from the last save stays unsaved', () => {
    const saved = song('a', 'First', 'tempo-120', 1);
    const decision = bootDocument(
      session({ songs: [saved], openId: 'a', savedBody: 'tempo-120' }),
      'tempo-160',
    );
    expect(decision.load).toBe('tempo-160');
    expect(decision.unsaved).toBe(true);
    expect(decision.openId).toBe('a');
    expect(decision.savedBody).toBe('tempo-120');
  });

  test('a scratch that matches a saved song is clean even if the open id was lost', () => {
    const saved = song('a', 'Alpha', 'tempo-90', 2);
    const decision = bootDocument(session({ songs: [saved], openId: '', savedBody: null }), 'tempo-90');
    expect(decision.unsaved).toBe(false);
    expect(decision.openId).toBe('a');
  });

  test('a scratch that matches the last save is clean', () => {
    const saved = song('a', 'First', 'tempo-120', 1);
    const decision = bootDocument(
      session({ songs: [saved], openId: 'a', savedBody: 'tempo-120' }),
      'tempo-120',
    );
    expect(decision.unsaved).toBe(false);
    expect(decision.openId).toBe('a');
  });

  test('a song with no successful save stays unsaved after reload', () => {
    const decision = bootDocument(session(), 'tempo-160');
    expect(decision.unsaved).toBe(true);
    expect(decision.openId).toBe('');
  });

  test('delete keeps one undo slot through a reload and the next delete replaces it', () => {
    const first = song('a', 'Night Ride', 'ride', 1);
    const second = song('b', 'Song', 'blank', 2);
    const start = session({ songs: [first, second], openId: 'a', savedBody: 'ride' });
    const removed = deleteSaved(start, 'a');
    expect(removed?.trash).toEqual(first);
    expect(removed?.songs.map((item) => item.id)).toEqual(['b']);
    expect(removed?.holdDeleted).toBe(true);
    expect(removed?.openId).toBe('');
    const again = deleteSaved(removed ?? start, 'b');
    expect(again?.trash).toEqual(second);
    expect(again?.songs).toEqual([]);
    const restored = undoSaved(again ?? start);
    expect(restored?.trash).toBeNull();
    expect(restored?.songs).toEqual([second]);
    const reloaded = bootDocument(removed ?? start, 'ride');
    expect(reloaded.load).toBeNull();
    expect(reloaded.trash?.name).toBe('Night Ride');
    const edited = bootDocument(removed ?? start, 'ride-edited');
    expect(edited.load).toBe('ride-edited');
    expect(edited.unsaved).toBe(true);
  });

  test('undo does not drop the songs that are still kept', () => {
    const kept = song('b', 'Song', 'blank', 2);
    const gone = song('a', 'Night Ride', 'ride', 1);
    const restored = undoSaved(session({ songs: [kept], trash: gone }));
    expect(restored?.songs.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });
});

describe('scratch and files', () => {
  test('page hide keeps the scratch when the song database write fails', async () => {
    const local = memoryLocal();
    const store = memoryStore();
    await persistScratch(store, local, '{"v":1}', 4);
    expect(local.getItem(AUTO_KEY)).toBe('{"v":1}');
    expect(local.getItem(SCRATCH_REV_KEY)).toBe('4');
    store.fail = true;
    await persistScratch(store, local, '{"v":1,"bpm":90}', 5);
    expect(local.getItem(AUTO_KEY)).toBe('{"v":1,"bpm":90}');
    expect(pickScratch(null, local.getItem(AUTO_KEY), 5)?.body).toBe('{"v":1,"bpm":90}');
  });

  test('the newer scratch wins', () => {
    expect(pickScratch({ body: 'old', rev: 1 }, 'new', 2)?.body).toBe('new');
    expect(pickScratch({ body: 'db', rev: 3 }, 'stale', 2)?.body).toBe('db');
    expect(pickScratch(null, 'only', 0)?.body).toBe('only');
  });

  test('download all songs is the user library only', () => {
    const file = JSON.parse(downloadAllBody([
      song('a', 'Older', 'one', 1),
      song('b', 'Newer', 'two', 5),
    ])) as { v: number; songs: Array<{ name: string; body: string }> };
    expect(file.v).toBe(1);
    expect(file.songs.map((item) => item.name)).toEqual(['Newer', 'Older']);
    expect(file.songs.map((item) => item.body)).toEqual(['two', 'one']);
    expect(JSON.stringify(file)).not.toContain('builtin:');
    expect(SHARE_CANCELLED).toBe('Share cancelled.');
    expect(BAD_SONG_FILE).toBe('This file is not a version 1 song.');
    expect(STORAGE_FULL).toBe('Not saved. Browser storage is full.');
    expect(DATA_WARNING).toContain('Clearing website data');
    expect(DATA_WARNING).toContain('downloaded file');
    expect(shareWasCancelled({ name: 'AbortError' })).toBe(true);
    expect(shareWasCancelled(new Error('nope'))).toBe(false);
  });

  test('renaming patches the stored name and leaves version 1', () => {
    const engine = createEngine();
    const body = stringifyProject(engine.snapshot());
    engine.setTitle('Night Ride');
    expect(renameProjectBody(body, 'Night Ride')).toBe(stringifyProject(engine.snapshot()));
    expect(renameProjectBody('{"v":2}', 'X')).toBeNull();
  });

  test('lists the newest song first', () => {
    const now = new Date(2026, 10, 28, 15, 4).getTime();
    expect(songWhen(new Date(2026, 10, 28, 14, 14).getTime(), now)).toBe('today, 2:14');
    expect(songWhen(new Date(2026, 10, 27, 9, 0).getTime(), now)).toBe('yesterday');
    expect(songWhen(new Date(2026, 10, 20, 9, 0).getTime(), now)).toBe('Nov 20');
    expect(newestFirst([
      song('a', 'Older', 'one', 1),
      song('b', 'Newer', 'two', 5),
    ]).map((item) => item.name)).toEqual(['Newer', 'Older']);
  });
});

describe('migration', () => {
  test('copies every song and the scratch, then drops the list only after the copy checks out', async () => {
    const older = '{"v":1,"name":"Older"}';
    const kept = '{"v":1,"name":"Kept tune","bpm":132}';
    const local = memoryLocal({
      [LIST_KEY]: JSON.stringify([
        { id: 'old', name: 'Older', body: older },
        { id: 'kept', name: 'Kept tune', body: kept },
      ]),
      [AUTO_KEY]: kept,
    });
    const store = memoryStore();
    const moved = await migrateLibrary(local, store);
    expect(moved.ok).toBe(true);
    expect(moved.songs.map((item) => [item.id, item.name, item.body, item.savedAt])).toEqual([
      ['old', 'Older', older, 1],
      ['kept', 'Kept tune', kept, 2],
    ]);
    expect(moved.scratch).toBe(kept);
    expect(moved.session).toEqual({ openId: 'kept', savedBody: kept, holdDeleted: false });
    expect(local.getItem(LIST_KEY)).toBeNull();
    expect(local.getItem(AUTO_KEY)).toBe(kept);
    expect(store.songs.get('kept')?.body).toBe(kept);
    const again = await migrateLibrary(local, store);
    expect(again.ok).toBe(true);
    expect(again.songs).toHaveLength(2);
  });

  test('keeps the old keys when the copy does not match', async () => {
    const body = '{"v":1,"name":"Kept"}';
    const local = memoryLocal({
      [LIST_KEY]: JSON.stringify([{ id: 'kept', name: 'Kept', body }]),
      [AUTO_KEY]: body,
    });
    const store = memoryStore((item) => ({ ...item, body: 'changed' }));
    const moved = await migrateLibrary(local, store);
    expect(moved.ok).toBe(false);
    expect(local.getItem(LIST_KEY)).toContain('Kept');
    expect(local.getItem(AUTO_KEY)).toBe(body);
    expect(store.songs.get('kept')?.body).toBe(body);
  });

  test('keeps a list that could not be read', async () => {
    const local = memoryLocal({ [LIST_KEY]: 'not-json', [AUTO_KEY]: '{"v":1}' });
    const store = memoryStore();
    const moved = await migrateLibrary(local, store);
    expect(moved.ok).toBe(false);
    expect(local.getItem(LIST_KEY)).toBe('not-json');
    expect(local.getItem(AUTO_KEY)).toBe('{"v":1}');
    expect(store.songs.size).toBe(0);
  });

  test('a scratch that only shares a name stays unsaved', async () => {
    const saved = '{"v":1,"name":"Song","bpm":180}';
    const scratch = '{"v":1,"name":"Song","bpm":90}';
    const local = memoryLocal({
      [LIST_KEY]: JSON.stringify([{ id: 'song', name: 'Song', body: saved }]),
      [AUTO_KEY]: scratch,
    });
    const moved = await migrateLibrary(memoryLocal({
      [LIST_KEY]: local.getItem(LIST_KEY) ?? '',
      [AUTO_KEY]: scratch,
    }), memoryStore());
    expect(moved.ok).toBe(true);
    expect(moved.session.openId).toBe('song');
    expect(moved.session.savedBody).toBe(saved);
    const decision = bootDocument(
      session({ songs: moved.songs, openId: moved.session.openId, savedBody: moved.session.savedBody }),
      scratch,
    );
    expect(decision.unsaved).toBe(true);
    expect(decision.load).toBe(scratch);
    expect(decision.savedBody).toBe(saved);
  });

  test('a failed write during the copy keeps the old keys', async () => {
    const local = memoryLocal({
      [LIST_KEY]: JSON.stringify([
        { id: 'a', name: 'One', body: 'one' },
        { id: 'b', name: 'Two', body: 'two' },
      ]),
      [AUTO_KEY]: 'one',
    });
    const store = memoryStore();
    let writes = 0;
    const original = store.putSong.bind(store);
    store.putSong = async (item) => {
      writes += 1;
      if (writes > 1) throw new Error('QuotaExceededError');
      await original(item);
    };
    const moved = await migrateLibrary(local, store);
    expect(moved.ok).toBe(false);
    expect(local.getItem(LIST_KEY)).toContain('Two');
    expect(local.getItem(AUTO_KEY)).toBe('one');
  });
});
