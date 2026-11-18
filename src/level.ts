export const LEVEL_KEY = 'chiptune-level';

export type Level = 'beginner' | 'full';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function readLevel(storage: StorageLike | null): Level {
  try {
    return storage?.getItem(LEVEL_KEY) === 'full' ? 'full' : 'beginner';
  } catch {
    return 'beginner';
  }
}

export function writeLevel(level: Level, storage: StorageLike | null): void {
  try {
    storage?.setItem(LEVEL_KEY, level);
  } catch {
    // the choice can stay for this visit
  }
}

function storage(): StorageLike | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function paint(level: Level): void {
  const beginner = document.querySelector<HTMLButtonElement>('#level-beginner');
  const full = document.querySelector<HTMLButtonElement>('#level-full');
  document.documentElement.dataset.level = level;
  if (beginner) {
    beginner.dataset.on = level === 'beginner' ? '1' : '0';
    beginner.setAttribute('aria-pressed', level === 'beginner' ? 'true' : 'false');
  }
  if (full) {
    full.dataset.on = level === 'full' ? '1' : '0';
    full.setAttribute('aria-pressed', level === 'full' ? 'true' : 'false');
  }
  const tip = document.querySelector<HTMLElement>('#tip');
  if (tip) tip.hidden = true;
}

export function mountLevel(): void {
  const beginner = document.querySelector<HTMLButtonElement>('#level-beginner');
  const full = document.querySelector<HTMLButtonElement>('#level-full');
  if (!beginner || !full) throw new Error('level');
  paint(readLevel(storage()));
  beginner.addEventListener('click', () => {
    paint('beginner');
    writeLevel('beginner', storage());
  });
  full.addEventListener('click', () => {
    paint('full');
    writeLevel('full', storage());
  });
}
