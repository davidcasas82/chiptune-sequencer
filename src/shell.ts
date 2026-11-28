import type { Engine } from './audio/engine';
import { projectName, saveBytes } from './audio/project';
import { setSkin, type SkinName } from './palette';
import { mountSongScreen } from './song-screen';

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

export function mountShell(engine: Engine, fresh: () => void): void {
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
  let busy = false;

  mountSongScreen(engine, fresh);

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

  function watch(): void {
    const delayText = String(Math.round(engine.delay * 100));
    const crushText = String(Math.round(engine.crush * 100));
    if (document.activeElement !== delayInput && delayInput.value !== delayText) delayInput.value = delayText;
    if (delayOut.textContent !== delayText) delayOut.textContent = delayText;
    if (document.activeElement !== crushInput && crushInput.value !== crushText) crushInput.value = crushText;
    if (crushOut.textContent !== crushText) crushOut.textContent = crushText;
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);
}
