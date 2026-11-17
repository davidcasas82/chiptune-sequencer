import type { Engine } from './audio/engine';
import {
  loadAuto,
  loadNamed,
  parseProject,
  projectName,
  saveAuto,
  saveBytes,
  saveNamed,
  stringifyProject,
} from './audio/project';
import { setSkin, type SkinName } from './palette';

const SKIN = 'chiptune-skin';
const VEIL = 'chiptune-veil';

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

function fileName(name: string, ext: string): string {
  const safe = projectName(name).replace(/\s+/g, '-').toLowerCase();
  return `${safe}.${ext}`;
}

export function mountShell(engine: Engine): void {
  const nameInput = required(document.querySelector<HTMLInputElement>('#name'), 'name');
  const saveButton = required(document.querySelector<HTMLButtonElement>('#save'), 'save');
  const projects = required(document.querySelector<HTMLSelectElement>('#projects'), 'projects');
  const jsonOut = required(document.querySelector<HTMLButtonElement>('#json-out'), 'json-out');
  const jsonIn = required(document.querySelector<HTMLButtonElement>('#json-in'), 'json-in');
  const fileInput = required(document.querySelector<HTMLInputElement>('#file'), 'file');
  const wavPat = required(document.querySelector<HTMLButtonElement>('#wav-pat'), 'wav-pat');
  const wavSong = required(document.querySelector<HTMLButtonElement>('#wav-song'), 'wav-song');
  const delayInput = required(document.querySelector<HTMLInputElement>('#delay'), 'delay');
  const delayOut = required(document.querySelector<HTMLOutputElement>('#delay-out'), 'delay-out');
  const crushInput = required(document.querySelector<HTMLInputElement>('#crush'), 'crush');
  const crushOut = required(document.querySelector<HTMLOutputElement>('#crush-out'), 'crush-out');
  const crtButton = required(document.querySelector<HTMLButtonElement>('#crt'), 'crt');
  const neonButton = required(document.querySelector<HTMLButtonElement>('#neon'), 'neon');
  const helpButton = required(document.querySelector<HTMLButtonElement>('#help-open'), 'help-open');
  const help = required(document.querySelector<HTMLDialogElement>('#help'), 'help');
  const veil = required(document.querySelector<HTMLElement>('#veil'), 'veil');

  let skin: SkinName = 'crt';
  let named = loadNamed();
  let seen = engine.revision;
  let pending = engine.revision;
  let dirtyAt = 0;
  let busy = false;

  function showName(): void {
    if (document.activeElement !== nameInput) nameInput.value = engine.title;
  }

  function fillProjects(): void {
    const current = projects.value;
    projects.replaceChildren();
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Projects';
    projects.append(blank);
    for (const item of named) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      projects.append(option);
    }
    if ([...projects.options].some((option) => option.value === current)) projects.value = current;
  }

  function remember(body: string): void {
    saveAuto(body);
    const name = engine.title;
    const found = named.find((item) => item.name === name);
    if (found) found.body = body;
    else named = [...named, { id: Date.now().toString(36), name, body }];
    saveNamed(named);
    fillProjects();
  }

  function applyFile(text: string): void {
    const file = parseProject(text);
    if (!file) return;
    engine.loadProject(file);
    showName();
  }

  function setVeil(on: boolean): void {
    veil.hidden = !on;
    crtButton.dataset.on = on ? '1' : '0';
    crtButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    try {
      localStorage.setItem(VEIL, on ? '1' : '0');
    } catch {
      // the preference can stay in memory
    }
  }

  function useSkin(next: SkinName): void {
    skin = next;
    setSkin(next);
    neonButton.dataset.on = next === 'neon' ? '1' : '0';
    neonButton.setAttribute('aria-pressed', next === 'neon' ? 'true' : 'false');
    try {
      localStorage.setItem(SKIN, next);
    } catch {
      // the preference can stay in memory
    }
  }

  nameInput.addEventListener('change', () => {
    engine.setTitle(projectName(nameInput.value));
    showName();
  });
  saveButton.addEventListener('click', () => {
    engine.setTitle(projectName(nameInput.value));
    remember(stringifyProject(engine.snapshot()));
  });
  projects.addEventListener('change', () => {
    const item = named.find((entry) => entry.id === projects.value);
    if (!item) return;
    applyFile(item.body);
  });
  jsonOut.addEventListener('click', () => {
    const body = stringifyProject(engine.snapshot());
    const bytes = new TextEncoder().encode(body);
    void saveBytes(fileName(engine.title, 'json'), bytes, 'application/json').catch(() => undefined);
  });
  jsonIn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then((text) => {
      applyFile(text);
      remember(stringifyProject(engine.snapshot()));
    });
  });

  async function exportWav(mode: 'pattern' | 'song'): Promise<void> {
    if (busy) return;
    busy = true;
    wavPat.disabled = true;
    wavSong.disabled = true;
    try {
      const bytes = await engine.exportWav(mode);
      await saveBytes(fileName(engine.title, 'wav'), bytes, 'audio/wav');
    } catch {
      // the share sheet was dismissed
    } finally {
      busy = false;
      wavPat.disabled = false;
      wavSong.disabled = false;
    }
  }
  wavPat.addEventListener('click', () => {
    void exportWav('pattern');
  });
  wavSong.addEventListener('click', () => {
    void exportWav('song');
  });

  delayInput.addEventListener('input', () => {
    engine.setDelay(Number(delayInput.value) / 100);
    delayOut.textContent = delayInput.value;
  });
  crushInput.addEventListener('input', () => {
    engine.setCrush(Number(crushInput.value) / 100);
    crushOut.textContent = crushInput.value;
  });
  crtButton.addEventListener('click', () => setVeil(veil.hidden !== false));
  neonButton.addEventListener('click', () => useSkin(skin === 'neon' ? 'crt' : 'neon'));
  helpButton.addEventListener('click', () => help.showModal());

  try {
    const storedSkin = localStorage.getItem(SKIN);
    useSkin(storedSkin === 'neon' ? 'neon' : 'crt');
    setVeil(localStorage.getItem(VEIL) === '1');
  } catch {
    useSkin('crt');
    setVeil(false);
  }
  fillProjects();
  showName();

  const saved = loadAuto();
  if (saved) applyFile(saved);
  seen = engine.revision;
  pending = seen;

  function watch(): void {
    const delayText = String(Math.round(engine.delay * 100));
    const crushText = String(Math.round(engine.crush * 100));
    if (document.activeElement !== delayInput && delayInput.value !== delayText) delayInput.value = delayText;
    if (delayOut.textContent !== delayText) delayOut.textContent = delayText;
    if (document.activeElement !== crushInput && crushInput.value !== crushText) crushInput.value = crushText;
    if (crushOut.textContent !== crushText) crushOut.textContent = crushText;
    if (engine.revision !== seen) {
      if (engine.revision !== pending) {
        pending = engine.revision;
        dirtyAt = performance.now();
      }
      if (performance.now() - dirtyAt > 400) {
        saveAuto(stringifyProject(engine.snapshot()));
        seen = engine.revision;
        showName();
      }
    }
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);
}
