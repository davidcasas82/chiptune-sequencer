import { AUTO_KEY, LIST_KEY, SCRATCH_REV_KEY, parseNamed, PROJECT_VERSION } from './project';

export const DB_NAME = 'chiptune';
export const STORAGE_FULL = 'Not saved. Browser storage is full.';
export const SHARE_CANCELLED = 'Share cancelled.';
export const BAD_SONG_FILE = 'This file is not a version 1 song.';
export const DATA_WARNING =
  'Clearing website data removes your songs. A downloaded file is the copy that stays.';

const SCRATCH_META = 'scratch';
const SESSION_META = 'session';
const TRASH_META = 'trash';
const MIGRATED_META = 'migrated';
const PERSISTED_META = 'persisted';
const LOCAL_META_KEY = 'chiptune-library-meta';

export type UserSong = {
  id: string;
  name: string;
  body: string;
  savedAt: number;
};

export type ScratchRecord = {
  body: string;
  rev: number;
};

export type SessionRecord = {
  openId: string;
  savedBody: string | null;
  holdDeleted: boolean;
};

export type LibrarySession = {
  songs: UserSong[];
  openId: string;
  savedBody: string | null;
  holdDeleted: boolean;
  trash: UserSong | null;
};

export type BootDecision = {
  load: string | null;
  unsaved: boolean;
  openId: string;
  savedBody: string | null;
  holdDeleted: boolean;
  trash: UserSong | null;
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SongStore = {
  getSongs(): Promise<UserSong[]>;
  putSong(song: UserSong): Promise<void>;
  deleteSong(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | null>;
  setMeta(key: string, value: unknown): Promise<void>;
};

export type SavePlan =
  | { type: 'ask'; otherId: string; name: string }
  | { type: 'update'; id: string }
  | { type: 'append' };

let songNonce = 0;

export function createSongId(now = Date.now()): string {
  songNonce += 1;
  return `${now.toString(36)}${songNonce.toString(36)}`;
}

export function nextSongTitle(names: readonly string[]): string {
  if (!names.includes('Song')) return 'Song';
  let number = 2;
  while (names.includes(`Song ${number}`)) number += 1;
  return `Song ${number}`;
}

export function newestFirst(songs: readonly UserSong[]): UserSong[] {
  return [...songs].sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function songWhen(savedAt: number, now: number): string {
  const saved = new Date(savedAt);
  const current = new Date(now);
  const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (key(saved) === key(current)) {
    const hour = saved.getHours();
    const shown = hour % 12 || 12;
    const minute = String(saved.getMinutes()).padStart(2, '0');
    return `today, ${shown}:${minute}`;
  }
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  if (key(saved) === key(yesterday)) return 'yesterday';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[saved.getMonth()]} ${saved.getDate()}`;
}

export function decideSave(songs: readonly UserSong[], openId: string, name: string, asNew: boolean): SavePlan {
  if (asNew) return { type: 'append' };
  const other = songs.find((song) => song.name === name && song.id !== openId);
  if (other) return { type: 'ask', otherId: other.id, name };
  if (openId && songs.some((song) => song.id === openId)) return { type: 'update', id: openId };
  return { type: 'append' };
}

export function replaceQuestion(name: string): string {
  return `Replace your song named ${name}?`;
}

export function bootDocument(session: LibrarySession, scratch: string | null): BootDecision {
  let trash = session.trash;
  if (trash && session.songs.some((song) => song.id === trash?.id)) trash = null;
  if (session.holdDeleted) {
    const changed = scratch !== null && session.trash !== null && scratch !== session.trash.body;
    if (changed) {
      return { load: scratch, unsaved: true, openId: '', savedBody: null, holdDeleted: false, trash };
    }
    return { load: null, unsaved: false, openId: '', savedBody: null, holdDeleted: false, trash };
  }
  if (!scratch) {
    return { load: null, unsaved: false, openId: '', savedBody: null, holdDeleted: false, trash };
  }
  const open = session.songs.find((song) => song.id === session.openId);
  if (open && (open.body === scratch || session.savedBody === scratch)) {
    return { load: scratch, unsaved: false, openId: open.id, savedBody: scratch, holdDeleted: false, trash };
  }
  if (open) {
    return { load: scratch, unsaved: true, openId: open.id, savedBody: open.body, holdDeleted: false, trash };
  }
  const same = newestFirst(session.songs).find((song) => song.body === scratch);
  if (same) {
    return { load: scratch, unsaved: false, openId: same.id, savedBody: scratch, holdDeleted: false, trash };
  }
  return { load: scratch, unsaved: true, openId: '', savedBody: null, holdDeleted: false, trash };
}

export function deleteSaved(session: LibrarySession, id: string): LibrarySession | null {
  const song = session.songs.find((item) => item.id === id);
  if (!song) return null;
  const removingOpen = session.openId === id;
  return {
    songs: session.songs.filter((item) => item.id !== id),
    openId: removingOpen ? '' : session.openId,
    savedBody: removingOpen ? null : session.savedBody,
    holdDeleted: removingOpen ? true : session.holdDeleted,
    trash: { ...song },
  };
}

export function undoSaved(session: LibrarySession): LibrarySession | null {
  if (!session.trash) return null;
  const restored = session.trash;
  const songs = session.songs.filter((item) => item.id !== restored.id);
  songs.push(restored);
  return { ...session, songs, trash: null };
}

export function downloadAllBody(songs: readonly UserSong[]): string {
  const ordered = newestFirst(songs);
  return JSON.stringify({
    v: PROJECT_VERSION,
    songs: ordered.map((song) => ({
      id: song.id,
      name: song.name,
      body: song.body,
      savedAt: song.savedAt,
    })),
  });
}

export function renameProjectBody(body: string, name: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== PROJECT_VERSION) return null;
  record.name = name;
  return JSON.stringify(record);
}

export function pickScratch(stored: ScratchRecord | null, mirrorBody: string | null, mirrorRev: number): ScratchRecord | null {
  const mirror = mirrorBody ? { body: mirrorBody, rev: Number.isFinite(mirrorRev) ? mirrorRev : 0 } : null;
  if (stored && mirror) return mirror.rev > stored.rev ? mirror : stored;
  return stored ?? mirror;
}

export function readMirrorRev(local: KeyValueStore): number {
  try {
    const rev = Number(local.getItem(SCRATCH_REV_KEY));
    return Number.isFinite(rev) ? rev : 0;
  } catch {
    return 0;
  }
}

export function readMirrorBody(local: KeyValueStore): string | null {
  try {
    return local.getItem(AUTO_KEY);
  } catch {
    return null;
  }
}

export async function writeLibrarySong(store: SongStore, songs: readonly UserSong[], song: UserSong): Promise<UserSong[] | null> {
  try {
    await store.putSong(song);
  } catch {
    return null;
  }
  const next = songs.filter((item) => item.id !== song.id);
  next.push(song);
  return next;
}

export async function removeLibrarySong(store: SongStore, songs: readonly UserSong[], id: string): Promise<UserSong[] | null> {
  try {
    await store.deleteSong(id);
  } catch {
    return null;
  }
  return songs.filter((item) => item.id !== id);
}

export async function persistScratch(store: SongStore, local: KeyValueStore, body: string, rev: number): Promise<void> {
  let mirrored = false;
  try {
    local.setItem(AUTO_KEY, body);
    local.setItem(SCRATCH_REV_KEY, String(rev));
    mirrored = true;
  } catch {
    mirrored = false;
  }
  try {
    await store.setMeta(SCRATCH_META, { body, rev } satisfies ScratchRecord);
  } catch {
    if (!mirrored) throw new Error('storage');
  }
}

type MigrateResult = {
  ok: boolean;
  songs: UserSong[];
  scratch: string | null;
  session: SessionRecord;
};

function emptySession(): SessionRecord {
  return { openId: '', savedBody: null, holdDeleted: false };
}

function sessionFromLegacy(songs: UserSong[], scratch: string | null): SessionRecord {
  if (!scratch) return emptySession();
  const exact = newestFirst(songs).find((song) => song.body === scratch);
  if (exact) return { openId: exact.id, savedBody: exact.body, holdDeleted: false };
  let rawName = '';
  try {
    const parsed = JSON.parse(scratch) as { name?: unknown };
    if (typeof parsed.name === 'string') rawName = parsed.name;
  } catch {
    rawName = '';
  }
  const named = rawName ? newestFirst(songs).find((song) => song.name === rawName) : undefined;
  if (named) return { openId: named.id, savedBody: named.body, holdDeleted: false };
  return emptySession();
}

function songsMatch(left: readonly UserSong[], right: readonly UserSong[]): boolean {
  if (left.length !== right.length) return false;
  const byId = new Map(right.map((song) => [song.id, song]));
  return left.every((song) => {
    const got = byId.get(song.id);
    return !!got && got.name === song.name && got.body === song.body && got.savedAt === song.savedAt;
  });
}

export async function migrateLibrary(local: KeyValueStore, store: SongStore): Promise<MigrateResult> {
  const fail = (songs: UserSong[] = [], scratch: string | null = null): MigrateResult => ({
    ok: false,
    songs,
    scratch,
    session: emptySession(),
  });
  let already = false;
  try {
    already = (await store.getMeta<boolean>(MIGRATED_META)) === true;
  } catch {
    return fail();
  }
  if (already) {
    try {
      local.removeItem(LIST_KEY);
    } catch {
      // the old list can stay until a later visit removes it
    }
    const songs = await store.getSongs().catch(() => []);
    const scratch = await store.getMeta<ScratchRecord>(SCRATCH_META).catch(() => null);
    const session = (await store.getMeta<SessionRecord>(SESSION_META).catch(() => null)) ?? emptySession();
    return { ok: true, songs, scratch: scratch?.body ?? null, session };
  }

  let rawList: string | null = null;
  let rawScratch: string | null = null;
  try {
    rawList = local.getItem(LIST_KEY);
    rawScratch = local.getItem(AUTO_KEY);
  } catch {
    return fail();
  }
  const parsed = parseNamed(rawList);
  if (rawList && rawList.trim() !== '[]' && parsed.length === 0) return fail();
  const songs: UserSong[] = parsed.map((song, index) => ({
    id: song.id,
    name: song.name,
    body: song.body,
    savedAt: index + 1,
  }));
  const session = sessionFromLegacy(songs, rawScratch);
  try {
    for (const song of songs) await store.putSong(song);
    if (rawScratch !== null) await store.setMeta(SCRATCH_META, { body: rawScratch, rev: 1 } satisfies ScratchRecord);
    await store.setMeta(SESSION_META, session);
  } catch {
    return fail(songs, rawScratch);
  }
  let back: UserSong[] = [];
  let scratchBack: ScratchRecord | null = null;
  let sessionBack: SessionRecord | null = null;
  try {
    back = await store.getSongs();
    scratchBack = await store.getMeta<ScratchRecord>(SCRATCH_META);
    sessionBack = await store.getMeta<SessionRecord>(SESSION_META);
  } catch {
    return fail(songs, rawScratch);
  }
  const scratchOk = (rawScratch ?? null) === (scratchBack?.body ?? null);
  const sessionOk =
    !!sessionBack &&
    sessionBack.openId === session.openId &&
    sessionBack.savedBody === session.savedBody &&
    sessionBack.holdDeleted === session.holdDeleted;
  if (!songsMatch(songs, back) || !scratchOk || !sessionOk) return fail(songs, rawScratch);
  try {
    await store.setMeta(MIGRATED_META, true);
    if (rawScratch !== null) local.setItem(SCRATCH_REV_KEY, '1');
    local.removeItem(LIST_KEY);
  } catch {
    return fail(songs, rawScratch);
  }
  return { ok: true, songs, scratch: rawScratch, session };
}

type MetaRow = { key: string; value: unknown };

function requestOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('storage'));
  });
}

function indexedSongStore(db: IDBDatabase): SongStore {
  return {
    async getSongs() {
      const tx = db.transaction('songs', 'readonly');
      const rows = await requestOf(tx.objectStore('songs').getAll() as IDBRequest<UserSong[]>);
      return Array.isArray(rows) ? rows : [];
    },
    putSong(song) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('songs', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('storage'));
        tx.onerror = () => reject(tx.error ?? new Error('storage'));
        tx.objectStore('songs').put(song);
      });
    },
    deleteSong(id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('songs', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('storage'));
        tx.onerror = () => reject(tx.error ?? new Error('storage'));
        tx.objectStore('songs').delete(id);
      });
    },
    async getMeta<T>(key: string) {
      const tx = db.transaction('meta', 'readonly');
      const row = await requestOf(tx.objectStore('meta').get(key) as IDBRequest<MetaRow | undefined>);
      if (!row || typeof row !== 'object') return null;
      return (row.value ?? null) as T | null;
    },
    setMeta(key, value) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('storage'));
        tx.onerror = () => reject(tx.error ?? new Error('storage'));
        tx.objectStore('meta').put({ key, value } satisfies MetaRow);
      });
    },
  };
}

export function openIndexedSongStore(): Promise<SongStore> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(indexedSongStore(request.result));
    request.onerror = () => reject(request.error ?? new Error('storage'));
  });
}

type LocalMeta = {
  scratch?: ScratchRecord | null;
  session?: SessionRecord | null;
  trash?: UserSong | null;
  migrated?: boolean;
  persisted?: boolean;
};

function readLocalMeta(local: KeyValueStore): LocalMeta {
  try {
    const text = local.getItem(LOCAL_META_KEY);
    if (!text) return {};
    const raw = JSON.parse(text) as LocalMeta;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function localSongStore(local: KeyValueStore): SongStore {
  const metaKey = (key: string): keyof LocalMeta => {
    if (key === SCRATCH_META) return 'scratch';
    if (key === SESSION_META) return 'session';
    if (key === TRASH_META) return 'trash';
    if (key === MIGRATED_META) return 'migrated';
    return 'persisted';
  };
  return {
    async getSongs() {
      const text = local.getItem(LIST_KEY);
      return parseNamed(text).map((song, index) => {
        let savedAt = index + 1;
        try {
          const raw = JSON.parse(text ?? '[]') as Array<Record<string, unknown>>;
          const found = raw.find((item) => item && item.id === song.id);
          const stamped = Number(found?.savedAt);
          if (Number.isFinite(stamped) && stamped > 0) savedAt = stamped;
        } catch {
          savedAt = index + 1;
        }
        return { ...song, savedAt };
      });
    },
    async putSong(song) {
      const songs = await this.getSongs();
      const next = songs.filter((item) => item.id !== song.id);
      next.push(song);
      local.setItem(LIST_KEY, JSON.stringify(next));
    },
    async deleteSong(id) {
      const songs = (await this.getSongs()).filter((item) => item.id !== id);
      local.setItem(LIST_KEY, JSON.stringify(songs));
    },
    async getMeta<T>(key: string) {
      const meta = readLocalMeta(local);
      const value = meta[metaKey(key)];
      return (value ?? null) as T | null;
    },
    async setMeta(key, value) {
      const meta = readLocalMeta(local);
      const next: LocalMeta = { ...meta, [metaKey(key)]: value };
      local.setItem(LOCAL_META_KEY, JSON.stringify(next));
    },
  };
}

export async function openSongStore(local: KeyValueStore): Promise<{ store: SongStore; migrated: boolean }> {
  try {
    const indexed = await openIndexedSongStore();
    const result = await migrateLibrary(local, indexed);
    if (!result.ok) return { store: localSongStore(local), migrated: false };
    return { store: indexed, migrated: true };
  } catch {
    return { store: localSongStore(local), migrated: false };
  }
}

export async function rememberPersist(store: SongStore, persist: () => Promise<boolean>): Promise<void> {
  const done = await store.getMeta<boolean>(PERSISTED_META).catch(() => false);
  if (done) return;
  await persist();
  await store.setMeta(PERSISTED_META, true);
}

export async function readLibrary(store: SongStore): Promise<LibrarySession & { scratch: ScratchRecord | null }> {
  const [songs, scratch, session, trash] = await Promise.all([
    store.getSongs(),
    store.getMeta<ScratchRecord>(SCRATCH_META),
    store.getMeta<SessionRecord>(SESSION_META),
    store.getMeta<UserSong | null>(TRASH_META),
  ]);
  return {
    songs,
    scratch,
    openId: session?.openId ?? '',
    savedBody: session?.savedBody ?? null,
    holdDeleted: session?.holdDeleted ?? false,
    trash: trash ?? null,
  };
}

export async function writeSession(store: SongStore, session: SessionRecord): Promise<void> {
  await store.setMeta(SESSION_META, session);
}

export async function writeTrash(store: SongStore, trash: UserSong | null): Promise<void> {
  await store.setMeta(TRASH_META, trash);
}
