import { AUTO_KEY, LIST_KEY } from './audio/project';
import { GLOSSARY } from './glossary';

export const GUIDE_KEY = 'chiptune-guide';

const HEAR_TAIL =
  'Press Play to hear it, then press Play again to stop. BPM is the speed. Low is slow, and high is fast.';

export const GUIDE_CARDS = [
  {
    title: 'Hear the beat',
    body: `The green notes are a short starter beat. ${HEAR_TAIL}`,
  },
  {
    title: 'Write a note',
    body: 'Each row is one part of the song. Tap an empty cell to write a note, and drag to set how long it holds. Double-tap a note to remove it. Draw, Erase, and Select pick the tool.',
  },
  {
    title: 'Change the sound',
    body: 'Tap Melody, Bass, or Drums on the right to pick a part. The round knobs change how loud it is and how a note starts, holds, and fades. Mute silences a part. Solo hears only that part.',
  },
  {
    title: 'Add a section',
    body: 'New adds a section. Song plays the sections in order. Pat loops the section you are editing.',
  },
  {
    title: 'Save it',
    body: 'Type a name and press Save. The song stays in this browser. Press ? any time to read what a control does. Skip closes this guide, and it stays closed.',
  },
] as const;

type KeyStore = {
  getItem(key: string): string | null;
};

function hasProjects(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return true;
    return list.length > 0;
  } catch {
    return true;
  }
}

export function guideCardBody(index: number, replay: boolean): string {
  if (index === 0 && replay) return `The green notes are the beat already in this song. ${HEAR_TAIL}`;
  return GUIDE_CARDS[index].body;
}

export function guideShouldOpen(storage: KeyStore): boolean {
  try {
    if (storage.getItem(GUIDE_KEY) === '1') return false;
    if (storage.getItem(AUTO_KEY)) return false;
    if (hasProjects(storage.getItem(LIST_KEY))) return false;
    return true;
  } catch {
    return false;
  }
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(name);
  return value;
}

function fillGlossary(list: HTMLElement): void {
  for (const group of GLOSSARY) {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = group.title;
    const blurb = document.createElement('p');
    blurb.className = 'blurb';
    blurb.textContent = group.blurb;
    section.append(heading, blurb);
    for (const line of group.lines) {
      const extra = document.createElement('p');
      extra.className = 'blurb';
      extra.textContent = line;
      section.append(extra);
    }
    if (group.items.length > 0) {
      const defs = document.createElement('dl');
      for (const entry of group.items) {
        const name = document.createElement('dt');
        name.textContent = entry.name;
        const tip = document.createElement('dd');
        tip.textContent = entry.tip;
        defs.append(name, tip);
      }
      section.append(defs);
    }
    list.append(section);
  }
}

export function mountGuide(): void {
  const guide = required(document.querySelector<HTMLDialogElement>('#guide'), 'guide');
  const step = required(document.querySelector<HTMLElement>('#guide-step'), 'guide-step');
  const title = required(document.querySelector<HTMLElement>('#guide-title'), 'guide-title');
  const body = required(document.querySelector<HTMLElement>('#guide-body'), 'guide-body');
  const back = required(document.querySelector<HTMLButtonElement>('#guide-back'), 'guide-back');
  const next = required(document.querySelector<HTMLButtonElement>('#guide-next'), 'guide-next');
  const skip = required(document.querySelector<HTMLButtonElement>('#guide-skip'), 'guide-skip');
  const glossary = required(document.querySelector<HTMLDialogElement>('#glossary'), 'glossary');
  const list = required(document.querySelector<HTMLElement>('#glossary-list'), 'glossary-list');
  const openGlossary = required(document.querySelector<HTMLButtonElement>('#glossary-open'), 'glossary-open');

  let index = 0;
  let replay = false;

  function showCard(nextIndex: number): void {
    index = nextIndex;
    const card = GUIDE_CARDS[index];
    step.textContent = `${index + 1} of ${GUIDE_CARDS.length}`;
    title.textContent = card.title;
    body.textContent = guideCardBody(index, replay);
    back.hidden = index === 0;
    const last = index === GUIDE_CARDS.length - 1;
    next.textContent = last ? 'Done' : 'Next';
  }

  function dismiss(): void {
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // the choice can stay for this visit
    }
    if (guide.open) guide.close();
  }

  function openGuide(again: boolean): void {
    replay = again;
    showCard(0);
    if (glossary.open) glossary.close();
    if (!guide.open) guide.show();
    skip.focus({ preventScroll: true });
  }

  function settleGlossary(): void {
    list.style.maxHeight = '';
    const view = list.getBoundingClientRect();
    if (view.height < 1) return;
    for (const node of list.querySelectorAll<HTMLElement>('h3, p, dt, dd')) {
      const box = node.getBoundingClientRect();
      if (box.top >= view.top && box.top < view.bottom && box.bottom > view.bottom + 0.5) {
        const next = Math.floor(box.top - view.top);
        if (next > 80) list.style.maxHeight = `${next}px`;
        return;
      }
    }
  }

  fillGlossary(list);
  showCard(0);
  skip.addEventListener('click', dismiss);
  back.addEventListener('click', () => {
    if (index > 0) showCard(index - 1);
  });
  next.addEventListener('click', () => {
    if (index >= GUIDE_CARDS.length - 1) dismiss();
    else showCard(index + 1);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !guide.open || glossary.open) return;
    event.preventDefault();
    dismiss();
  });
  openGlossary.addEventListener('click', () => {
    if (!glossary.open) glossary.showModal();
    settleGlossary();
  });
  required(document.querySelector<HTMLButtonElement>('#glossary-tutorial'), 'glossary-tutorial').addEventListener('click', () => {
    openGuide(true);
  });
  window.addEventListener('resize', () => {
    if (glossary.open) settleGlossary();
  });

  if (!guideShouldOpen(localStorage)) return;
  openGuide(false);
}
