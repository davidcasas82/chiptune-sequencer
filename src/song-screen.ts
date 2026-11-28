import { BUILTIN_SONGS, builtinById } from './audio/classics';
import type { Engine } from './audio/engine';
import {
  BAD_SONG_FILE,
  DATA_WARNING,
  SHARE_CANCELLED,
  STORAGE_FULL,
  createSongId,
  decideSave,
  deleteSaved,
  downloadAllBody,
  newestFirst,
  nextSongTitle,
  openSongStore,
  persistScratch,
  pickScratch,
  readLibrary,
  readMirrorBody,
  readMirrorRev,
  rememberPersist,
  removeLibrarySong,
  renameProjectBody,
  replaceQuestion,
  bootDocument,
  songWhen,
  undoSaved,
  writeLibrarySong,
  writeSession,
  writeTrash,
  type LibrarySession,
  type SongStore,
  type UserSong,
} from './audio/library';
import {
  AUTO_KEY,
  SCRATCH_REV_KEY,
  cleanProjectName,
  parseProject,
  projectName,
  saveBytes,
  shareWasCancelled,
  stringifyProject,
} from './audio/project';

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

function fileName(name: string, ext: string): string {
  const safe = projectName(name).replace(/\s+/g, '-').toLowerCase();
  return `${safe}.${ext}`;
}

export function mountSongScreen(engine: Engine, fresh: () => void): void {
  const openButton = required(document.querySelector<HTMLButtonElement>('#songs-open'), 'songs-open');
  const dialog = required(document.querySelector<HTMLDialogElement>('#songs'), 'songs');
  const closeButton = required(document.querySelector<HTMLButtonElement>('#songs-close'), 'songs-close');
  const nameInput = required(document.querySelector<HTMLInputElement>('#name'), 'name');
  const dirty = required(document.querySelector<HTMLElement>('#songs-dirty'), 'songs-dirty');
  const saveButton = required(document.querySelector<HTMLButtonElement>('#save'), 'save');
  const saveAsButton = required(document.querySelector<HTMLButtonElement>('#save-as'), 'save-as');
  const newSongButton = required(document.querySelector<HTMLButtonElement>('#new-song'), 'new-song');
  const userList = required(document.querySelector<HTMLElement>('#song-list'), 'song-list');
  const builtinList = required(document.querySelector<HTMLElement>('#builtin-list'), 'builtin-list');
  const userPlay = required(document.querySelector<HTMLButtonElement>('#song-play'), 'song-play');
  const userOpen = required(document.querySelector<HTMLButtonElement>('#song-open'), 'song-open');
  const renameButton = required(document.querySelector<HTMLButtonElement>('#song-rename'), 'song-rename');
  const deleteButton = required(document.querySelector<HTMLButtonElement>('#song-delete'), 'song-delete');
  const builtinPlay = required(document.querySelector<HTMLButtonElement>('#builtin-play'), 'builtin-play');
  const builtinCopy = required(document.querySelector<HTMLButtonElement>('#builtin-copy'), 'builtin-copy');
  const downloadSong = required(document.querySelector<HTMLButtonElement>('#json-out'), 'json-out');
  const downloadAll = required(document.querySelector<HTMLButtonElement>('#download-all'), 'download-all');
  const openFile = required(document.querySelector<HTMLButtonElement>('#json-in'), 'json-in');
  const fileInput = required(document.querySelector<HTMLInputElement>('#file'), 'file');
  const note = required(document.querySelector<HTMLElement>('#songs-note'), 'songs-note');
  const alert = required(document.querySelector<HTMLElement>('#songs-alert'), 'songs-alert');
  const undoBar = required(document.querySelector<HTMLElement>('#song-undo'), 'song-undo');
  const undoText = required(document.querySelector<HTMLElement>('#song-undo-text'), 'song-undo-text');
  const undoButton = required(document.querySelector<HTMLButtonElement>('#song-undo-btn'), 'song-undo-btn');
  const askSave = required(document.querySelector<HTMLDialogElement>('#ask-save'), 'ask-save');
  const askReplace = required(document.querySelector<HTMLDialogElement>('#ask-replace'), 'ask-replace');
  const askReplaceText = required(document.querySelector<HTMLElement>('#ask-replace-text'), 'ask-replace-text');
  const askDelete = required(document.querySelector<HTMLDialogElement>('#ask-delete'), 'ask-delete');
  const askDeleteText = required(document.querySelector<HTMLElement>('#ask-delete-text'), 'ask-delete-text');

  const initialBody = stringifyProject(engine.snapshot());
  let store: SongStore | null = null;
  let songs: UserSong[] = [];
  let openId = '';
  let savedBody: string | null = null;
  let holdDeleted = false;
  let trash: UserSong | null = null;
  let anchor: string | null = null;
  let ready = false;
  let scratchRev = 0;
  let userPick = '';
  let builtinPick = '';
  let previewId = '';
  let previewToken = 0;
  let previewLive = false;
  let seen = engine.revision;
  let pending = engine.revision;
  let dirtyAt = 0;
  let renaming: Promise<void> = Promise.resolve();
  let persistAsked = false;
  let sessionWrite: Promise<void> = Promise.resolve();
  let scratchWrite: Promise<void> = Promise.resolve();

  note.textContent = DATA_WARNING;

  function session(): LibrarySession {
    return { songs, openId, savedBody, holdDeleted, trash };
  }

  function bodyNow(): string {
    return stringifyProject(engine.snapshot());
  }

  function edited(): boolean {
    if (anchor === null) return true;
    return bodyNow() !== anchor;
  }

  function showName(): void {
    if (document.activeElement !== nameInput) nameInput.value = engine.title;
  }

  function showAlert(message: string): void {
    alert.textContent = message;
  }

  function clearAlert(): void {
    alert.textContent = '';
  }

  function askChoice(box: HTMLDialogElement): Promise<string> {
    if (box.open) return Promise.resolve('');
    box.returnValue = '';
    box.showModal();
    return new Promise((resolve) => {
      box.addEventListener('close', () => resolve(box.returnValue), { once: true });
    });
  }

  function rememberSession(): Promise<void> {
    const snapshot = { openId, savedBody, holdDeleted };
    const target = store;
    sessionWrite = sessionWrite.then(async () => {
      if (!target) return;
      try {
        await writeSession(target, snapshot);
      } catch {
        // the song on screen stays either way
      }
    });
    return sessionWrite;
  }

  async function rememberTrash(): Promise<void> {
    if (!store) return;
    try {
      await writeTrash(store, trash);
    } catch {
      // undo can still work until the page closes
    }
  }

  function queueScratch(body: string, rev: number): Promise<void> {
    const target = store;
    scratchWrite = scratchWrite.then(async () => {
      if (!target || rev !== scratchRev) return;
      try {
        await persistScratch(target, localStorage, body, rev);
      } catch {
        // a refused scratch write is reported only when Save itself fails
      }
    });
    return scratchWrite;
  }

  function writeScratch(body: string): Promise<void> {
    return queueScratch(body, (scratchRev += 1));
  }

  function applyText(text: string): boolean {
    const file = parseProject(text);
    if (!file) return false;
    engine.loadProject(file);
    showName();
    fresh();
    return true;
  }

  function renderPlayButtons(): void {
    const userOn = previewId !== '' && previewId === userPick;
    const builtinOn = previewId !== '' && previewId === builtinPick;
    userPlay.textContent = userOn ? 'Stop' : 'Play';
    builtinPlay.textContent = builtinOn ? 'Stop' : 'Play';
    userPlay.setAttribute('aria-pressed', userOn ? 'true' : 'false');
    builtinPlay.setAttribute('aria-pressed', builtinOn ? 'true' : 'false');
  }

  function renderLists(): void {
    userList.replaceChildren();
    const ordered = newestFirst(songs);
    if (ordered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'song-empty';
      empty.textContent = 'No saved songs yet.';
      userList.append(empty);
    }
    for (const song of ordered) {
      const row = document.createElement('div');
      row.className = 'song-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'option';
      button.dataset.id = song.id;
      button.textContent = song.name;
      button.setAttribute('aria-selected', song.id === userPick ? 'true' : 'false');
      if (song.id === userPick) button.dataset.on = '1';
      button.addEventListener('click', () => {
        userPick = song.id;
        render();
      });
      const when = document.createElement('span');
      when.className = 'song-when';
      when.textContent = songWhen(song.savedAt, Date.now());
      row.append(button, when);
      userList.append(row);
    }
    builtinList.replaceChildren();
    for (const preset of BUILTIN_SONGS) {
      const row = document.createElement('div');
      row.className = 'song-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'option';
      button.dataset.id = preset.id;
      button.textContent = preset.name;
      button.setAttribute('aria-selected', preset.id === builtinPick ? 'true' : 'false');
      if (preset.id === builtinPick) button.dataset.on = '1';
      button.addEventListener('click', () => {
        builtinPick = preset.id;
        render();
      });
      row.append(button);
      builtinList.append(row);
    }
  }

  function render(): void {
    renderLists();
    renderPlayButtons();
    const userReady = ready && songs.some((song) => song.id === userPick);
    const builtinReady = ready && builtinById(builtinPick) !== undefined;
    userPlay.disabled = !userReady;
    userOpen.disabled = !userReady;
    deleteButton.disabled = !userReady;
    renameButton.disabled = !ready;
    builtinPlay.disabled = !builtinReady;
    builtinCopy.disabled = !builtinReady;
    saveButton.disabled = !ready;
    saveAsButton.disabled = !ready;
    newSongButton.disabled = !ready;
    downloadSong.disabled = !ready;
    downloadAll.disabled = !ready;
    openFile.disabled = !ready;
    undoButton.disabled = !ready || !trash;
    undoBar.hidden = !trash;
    undoText.textContent = trash ? `${trash.name} deleted.` : '';
    dirty.textContent = ready && edited() ? 'Not saved' : '';
  }

  async function finishSave(song: UserSong): Promise<boolean> {
    if (!store) return false;
    const written = await writeLibrarySong(store, songs, song);
    if (!written) {
      showAlert(STORAGE_FULL);
      render();
      return false;
    }
    songs = written;
    openId = song.id;
    savedBody = song.body;
    anchor = song.body;
    holdDeleted = false;
    userPick = song.id;
    clearAlert();
    await rememberSession();
    const current = bodyNow();
    await writeScratch(current === song.body ? song.body : current);
    seen = engine.revision;
    pending = seen;
    if (!persistAsked) {
      persistAsked = true;
      try {
        await rememberPersist(store, async () => {
          const storage = navigator.storage;
          if (!storage || typeof storage.persist !== 'function') return false;
          return storage.persist();
        });
      } catch {
        persistAsked = false;
      }
    }
    showName();
    render();
    return true;
  }

  async function saveCurrent(asNew: boolean): Promise<boolean> {
    await renaming;
    if (!ready || !store) return false;
    const name = projectName(nameInput.value);
    nameInput.value = name;
    engine.setTitle(name);
    const body = bodyNow();
    const plan = decideSave(songs, openId, name, asNew);
    if (plan.type === 'ask') {
      askReplaceText.textContent = replaceQuestion(plan.name);
      const choice = await askChoice(askReplace);
      if (choice === 'new') return saveCurrent(true);
      if (choice !== 'replace') return false;
      const song = { id: plan.otherId, name, body, savedAt: Date.now() };
      return finishSave(song);
    }
    const id = plan.type === 'update' ? plan.id : createSongId();
    return finishSave({ id, name, body, savedAt: Date.now() });
  }

  async function confirmReplace(): Promise<boolean> {
    await renaming;
    if (!edited()) return true;
    const choice = await askChoice(askSave);
    if (choice === 'save') return saveCurrent(false);
    return choice === 'discard';
  }

  async function commitRename(): Promise<void> {
    const stored = projectName(nameInput.value);
    nameInput.value = stored;
    const previousTitle = engine.title;
    const wasClean = anchor !== null && bodyNow() === anchor;
    engine.setTitle(stored);
    const current = songs.find((song) => song.id === openId);
    if (!store || !current || current.name === stored) {
      showName();
      render();
      return;
    }
    const body = wasClean ? bodyNow() : (renameProjectBody(current.body, stored) ?? current.body);
    const next = { ...current, name: stored, body };
    const written = await writeLibrarySong(store, songs, next);
    if (!written) {
      engine.setTitle(previousTitle);
      nameInput.value = previousTitle;
      showAlert(STORAGE_FULL);
      render();
      return;
    }
    songs = written;
    if (wasClean) {
      savedBody = body;
      anchor = body;
      await rememberSession();
    }
    clearAlert();
    render();
  }

  async function previewSong(id: string, text: string | null, file = text ? parseProject(text) : null): Promise<void> {
    if (previewId === id) {
      previewToken += 1;
      engine.stopPreview();
      previewId = '';
      renderPlayButtons();
      return;
    }
    if (!file) {
      showAlert(BAD_SONG_FILE);
      return;
    }
    const token = (previewToken += 1);
    previewId = id;
    renderPlayButtons();
    try {
      await engine.previewProject(file);
    } catch {
      if (token === previewToken) previewId = '';
    }
    if (token !== previewToken) return;
    if (!engine.previewing) previewId = '';
    renderPlayButtons();
  }

  function takeOver(unsaved: boolean): void {
    if (unsaved) {
      openId = '';
      savedBody = null;
      anchor = null;
    }
    holdDeleted = false;
  }

  openButton.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    showName();
    render();
  });
  closeButton.addEventListener('click', () => dialog.close());
  nameInput.addEventListener('input', () => {
    const clean = cleanProjectName(nameInput.value);
    if (clean === nameInput.value) return;
    const at = nameInput.selectionStart ?? clean.length;
    nameInput.value = clean;
    const next = Math.max(0, at - 1);
    nameInput.setSelectionRange(Math.min(next, clean.length), Math.min(next, clean.length));
  });
  nameInput.addEventListener('blur', () => {
    renaming = commitRename();
  });
  renameButton.addEventListener('click', () => {
    nameInput.focus();
    nameInput.select();
  });
  saveButton.addEventListener('click', () => {
    void saveCurrent(false);
  });
  saveAsButton.addEventListener('click', () => {
    void saveCurrent(true);
  });
  newSongButton.addEventListener('click', () => {
    void confirmReplace().then(async (ok) => {
      if (!ok) return;
      engine.newSong(nextSongTitle(songs.map((song) => song.name)));
      openId = '';
      savedBody = null;
      anchor = null;
      holdDeleted = false;
      userPick = '';
      showName();
      fresh();
      await rememberSession();
      clearAlert();
      render();
    });
  });
  userPlay.addEventListener('click', () => {
    const song = songs.find((item) => item.id === userPick);
    if (!song) return;
    void previewSong(song.id, song.body);
  });
  builtinPlay.addEventListener('click', () => {
    const preset = builtinById(builtinPick);
    if (!preset) return;
    void previewSong(preset.id, null, preset.file);
  });
  userOpen.addEventListener('click', () => {
    const song = songs.find((item) => item.id === userPick);
    if (!song) return;
    void confirmReplace().then(async (ok) => {
      if (!ok) return;
      if (!applyText(song.body)) {
        showAlert(BAD_SONG_FILE);
        return;
      }
      openId = song.id;
      savedBody = song.body;
      anchor = bodyNow();
      holdDeleted = false;
      userPick = song.id;
      await rememberSession();
      clearAlert();
      render();
    });
  });
  builtinCopy.addEventListener('click', () => {
    const preset = builtinById(builtinPick);
    if (!preset) return;
    void confirmReplace().then(async (ok) => {
      if (!ok) return;
      engine.loadProject(preset.file);
      takeOver(true);
      showName();
      fresh();
      await rememberSession();
      clearAlert();
      render();
    });
  });
  deleteButton.addEventListener('click', () => {
    const song = songs.find((item) => item.id === userPick);
    if (!song || !store) return;
    askDeleteText.textContent = `Delete saved song ${song.name}?`;
    void askChoice(askDelete).then(async (choice) => {
      if (choice !== 'delete' || !store) return;
      const previousTrash = trash;
      try {
        await writeTrash(store, song);
      } catch {
        showAlert(STORAGE_FULL);
        return;
      }
      const removed = await removeLibrarySong(store, songs, song.id);
      if (!removed) {
        trash = previousTrash;
        await rememberTrash();
        showAlert(STORAGE_FULL);
        render();
        return;
      }
      const next = deleteSaved(session(), song.id);
      songs = removed;
      if (next) {
        openId = next.openId;
        savedBody = next.savedBody;
        holdDeleted = next.holdDeleted;
        trash = next.trash;
      }
      if (holdDeleted) anchor = null;
      if (userPick === song.id) userPick = '';
      await rememberSession();
      clearAlert();
      render();
    });
  });
  undoButton.addEventListener('click', () => {
    const next = undoSaved(session());
    if (!next || !trash || !store) return;
    const restored = trash;
    void writeLibrarySong(store, songs, restored).then(async (written) => {
      if (!written || !store) {
        showAlert(STORAGE_FULL);
        render();
        return;
      }
      songs = written;
      trash = null;
      try {
        await writeTrash(store, null);
      } catch {
        trash = restored;
        showAlert(STORAGE_FULL);
        render();
        return;
      }
      clearAlert();
      render();
    });
  });
  downloadSong.addEventListener('click', () => {
    const body = bodyNow();
    const bytes = new TextEncoder().encode(body);
    void saveBytes(fileName(engine.title, 'json'), bytes, 'application/json').catch((error: unknown) => {
      if (shareWasCancelled(error)) showAlert(SHARE_CANCELLED);
    });
  });
  downloadAll.addEventListener('click', () => {
    const body = downloadAllBody(songs);
    const bytes = new TextEncoder().encode(body);
    void saveBytes('songs.json', bytes, 'application/json').catch((error: unknown) => {
      if (shareWasCancelled(error)) showAlert(SHARE_CANCELLED);
    });
  });
  openFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then(async (text) => {
      if (!(await confirmReplace())) return;
      if (!applyText(text)) {
        showAlert(BAD_SONG_FILE);
        return;
      }
      takeOver(true);
      await rememberSession();
      render();
    });
  });

  const mirror = readMirrorBody(localStorage);
  if (mirror && parseProject(mirror)) applyText(mirror);

  function watch(): void {
    if (engine.previewing) previewLive = true;
    else if (previewLive) {
      previewLive = false;
      previewId = '';
      renderPlayButtons();
    }
    if (ready && engine.revision !== seen) {
      if (engine.revision !== pending) {
        pending = engine.revision;
        dirtyAt = performance.now();
      }
      if (performance.now() - dirtyAt > 400) {
        seen = engine.revision;
        void writeScratch(bodyNow());
        showName();
        if (dialog.open) dirty.textContent = edited() ? 'Not saved' : '';
      }
    }
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);

  window.addEventListener('pagehide', () => {
    const body = bodyNow();
    const rev = (scratchRev += 1);
    try {
      localStorage.setItem(AUTO_KEY, body);
      localStorage.setItem(SCRATCH_REV_KEY, String(rev));
    } catch {
      // the mirror can fail when storage is full
    }
    void queueScratch(body, rev);
  });

  void (async () => {
    const opened = await openSongStore(localStorage);
    store = opened.store;
    const loaded = await readLibrary(store);
    scratchRev = Math.max(loaded.scratch?.rev ?? 0, readMirrorRev(localStorage));
    const scratch = pickScratch(loaded.scratch, readMirrorBody(localStorage), readMirrorRev(localStorage));
    const decision = bootDocument(
      {
        songs: loaded.songs,
        openId: loaded.openId,
        savedBody: loaded.savedBody,
        holdDeleted: loaded.holdDeleted,
        trash: loaded.trash,
      },
      scratch?.body ?? null,
    );
    songs = loaded.songs;
    trash = decision.trash;
    if (decision.trash !== loaded.trash) await rememberTrash();
    if (decision.load) applyText(decision.load);
    else if (loaded.holdDeleted) applyText(initialBody);
    openId = decision.openId;
    holdDeleted = false;
    if (decision.unsaved) {
      savedBody = decision.openId ? decision.savedBody : null;
      anchor = decision.openId ? decision.savedBody : null;
    } else {
      anchor = bodyNow();
      savedBody = decision.load ? anchor : null;
    }
    if (openId) userPick = openId;
    await rememberSession();
    if (loaded.holdDeleted && !decision.load) await writeScratch(bodyNow());
    pending = engine.revision;
    dirtyAt = performance.now();
    seen = -1;
    ready = true;
    showName();
    render();
  })();

  render();
}
