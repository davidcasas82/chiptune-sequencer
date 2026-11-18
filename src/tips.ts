import { SECTION_TIPS } from './section-tips';

export const TIP_HOLD_MS = 500;
export const TIP_STILL_PX = 8;

const PANEL: Record<string, keyof typeof SECTION_TIPS> = {
  'play-title': 'play',
  'edit-title': 'edit',
  'song-title': 'song',
  'craft-title': 'craft',
  'songs-title': 'songs',
  'look-title': 'look',
  'tracks-title': 'tracks',
  'sound-title': 'sound',
  'shape-title': 'shape',
  'note-title': 'note',
  'mix-title': 'mix',
};

const SHORT: Record<string, string> = {
  Pat: 'Pattern',
  Qnt: 'Quantize',
  Rnd: 'Random',
  Rand: 'Random',
  Hum: 'Humanize',
  Var: 'Variation',
  Fill: 'Fill',
  Arp: 'Arpeggio',
  Rec: 'Record',
  Chr: 'Chromatic',
  Maj: 'Major',
  Min: 'Minor',
  Pent: 'Pentatonic',
  Cust: 'Custom',
  Tri: 'Triangle',
  UpDn: 'Up and down',
  UD: 'Up and down',
  Dn: 'Down',
  CH: 'Same as the part',
  WavP: 'Pattern audio',
  WavS: 'Song audio',
  JSON: 'Song file',
  Scan: 'Scan lines',
  MIDI: 'MIDI',
  Len: 'Length',
  Onion: 'Onion skin',
  Fit: 'Fit the grid',
  All: 'Whole song',
  Hear: 'Hear this piece',
  Mark: 'Mark this piece',
  New: 'New pattern',
};

type Press = {
  button: HTMLButtonElement;
  pointerId: number;
  x: number;
  y: number;
  timer: number;
  held: boolean;
  moved: boolean;
};

let tip: HTMLDivElement | null = null;
let nameEl: HTMLParagraphElement | null = null;
let bodyEl: HTMLParagraphElement | null = null;
let openButton: HTMLButtonElement | null = null;
let openFrom: 'hover' | 'hold' | null = null;
let press: Press | null = null;
let suppress: HTMLButtonElement | null = null;
let knobHold: HTMLButtonElement | null = null;
let touchUntil = 0;

export function plainText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return SHORT[clean] ?? clean;
}

export function tipText(name: string, detail: string): { title: string; detail: string } {
  const title = name.replace(/\s+/g, ' ').trim();
  const body = detail.replace(/\s+/g, ' ').trim();
  if (!body || body.toLowerCase() === title.toLowerCase()) return { title, detail: '' };
  return { title, detail: body };
}

export function consumeKnobHold(button: HTMLButtonElement): boolean {
  if (knobHold !== button) return false;
  knobHold = null;
  return true;
}

function controlName(button: HTMLButtonElement): string {
  const aria = button.getAttribute('aria-label');
  if (aria) return plainText(aria);
  if (button.hasAttribute('data-channel')) {
    const track = button.querySelector('.track-name')?.textContent ?? '';
    const name = plainText(track);
    if (name) return name;
  }
  if (button.dataset.steps) return `${button.dataset.steps} steps`;
  if (button.closest('#pats')) {
    const number = plainText(button.textContent ?? '');
    return number ? `Pattern ${number}` : 'Pattern';
  }
  if (button.closest('#lane')) return 'Song piece';
  const text = plainText(button.textContent ?? '');
  if (button.closest('#pcs')) {
    const group = button.closest('[aria-label]')?.getAttribute('aria-label')?.trim() || 'Custom scale';
    return text ? `${group} ${text}` : group;
  }
  const group = button.parentElement?.getAttribute('aria-label')?.trim();
  if (group && text && /^\d/.test(text)) return `${group} ${text}`;
  return text;
}

function sectionCopy(button: HTMLButtonElement): string {
  if (button.hasAttribute('data-drum')) return SECTION_TIPS.drums;
  const dialog = button.closest('dialog');
  if (dialog) {
    const text = dialog.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return text.split(' ').length >= 3 ? text : '';
  }
  const id = button.closest('section[aria-labelledby]')?.getAttribute('aria-labelledby') ?? '';
  const key = PANEL[id];
  return key ? SECTION_TIPS[key] : '';
}

function tipTarget(node: EventTarget | null): HTMLButtonElement | null {
  if (!(node instanceof Element)) return null;
  const button = node.closest('button');
  if (!(button instanceof HTMLButtonElement)) return null;
  if (button.disabled || button.closest('[hidden]') || button.closest('#radial') || button.closest('canvas')) return null;
  return button;
}

function canHover(event: PointerEvent): boolean {
  if (event.pointerType === 'touch' || event.buttons !== 0) return false;
  if (event.pointerType === 'pen') return true;
  return event.pointerType === 'mouse' && performance.now() > touchUntil;
}

function rememberTouch(event: PointerEvent): void {
  if (event.pointerType === 'touch') touchUntil = performance.now() + 900;
}

function place(button: HTMLButtonElement): void {
  if (!tip) return;
  const anchor = button.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const margin = 8;
  let left = anchor.left + anchor.width / 2 - box.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));
  let top = anchor.top - box.height - 6;
  if (top < margin) top = anchor.bottom + 6;
  if (top + box.height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - box.height - margin);
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideTip(): void {
  if (!tip) return;
  tip.hidden = true;
  if (tip.parentElement !== document.body) document.body.append(tip);
  if (openButton) openButton.removeAttribute('aria-describedby');
  openButton = null;
  openFrom = null;
}

function showTip(button: HTMLButtonElement, from: 'hover' | 'hold'): void {
  if (!tip || !nameEl || !bodyEl) return;
  const copy = tipText(controlName(button), sectionCopy(button));
  if (!copy.title && !copy.detail) return;
  if (
    openButton === button &&
    openFrom === from &&
    !tip.hidden &&
    nameEl.textContent === copy.title &&
    bodyEl.textContent === copy.detail
  ) {
    return;
  }
  nameEl.textContent = copy.title;
  bodyEl.textContent = copy.detail;
  bodyEl.hidden = copy.detail.length === 0;
  const dialog = button.closest('dialog');
  const parent = dialog ?? document.body;
  if (tip.parentElement !== parent) parent.append(tip);
  tip.hidden = false;
  if (openButton && openButton !== button) openButton.removeAttribute('aria-describedby');
  button.setAttribute('aria-describedby', 'tip');
  openButton = button;
  openFrom = from;
  place(button);
}

function clearPress(): void {
  if (!press) return;
  window.clearTimeout(press.timer);
  press = null;
}

function onPointerDown(event: PointerEvent): void {
  rememberTouch(event);
  if (!event.isPrimary || event.button !== 0) return;
  suppress = null;
  const button = tipTarget(event.target);
  clearPress();
  hideTip();
  if (!button) return;
  const tracked = button;
  const timer = window.setTimeout(() => {
    if (!press || press.button !== tracked || press.moved || !tracked.isConnected) return;
    press.held = true;
    showTip(tracked, 'hold');
  }, TIP_HOLD_MS);
  press = {
    button,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timer,
    held: false,
    moved: false,
  };
}

function onPointerMove(event: PointerEvent): void {
  rememberTouch(event);
  if (press && event.pointerId === press.pointerId) {
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (distance > TIP_STILL_PX) {
      press.moved = true;
      window.clearTimeout(press.timer);
      if (press.button.closest('.knob')) hideTip();
    }
    return;
  }
  if (press || !canHover(event)) return;
  const button = tipTarget(event.target);
  if (!button) {
    if (openFrom === 'hover') hideTip();
    return;
  }
  showTip(button, 'hover');
}

function onPointerOver(event: PointerEvent): void {
  if (press || !canHover(event)) return;
  const button = tipTarget(event.target);
  if (!button) return;
  showTip(button, 'hover');
}

function onPointerOut(event: PointerEvent): void {
  if (openFrom !== 'hover' || !openButton) return;
  if (tipTarget(event.target) !== openButton) return;
  const next = event.relatedTarget;
  if (next instanceof Node && openButton.contains(next)) return;
  hideTip();
}

function onPointerUp(event: PointerEvent): void {
  if (!press || event.pointerId !== press.pointerId) return;
  rememberTouch(event);
  const button = press.button;
  const held = press.held;
  const moved = press.moved;
  clearPress();
  if (held) suppress = button;
  if (held && !moved && button.closest('.knob')) knobHold = button;
  if (openFrom === 'hold') hideTip();
  if (event.type === 'pointercancel') return;
  const over = tipTarget(document.elementFromPoint(event.clientX, event.clientY));
  if (over && canHover(event)) showTip(over, 'hover');
}

function onClick(event: MouseEvent): void {
  const held = suppress;
  if (!held) return;
  suppress = null;
  if (event.target instanceof Node && held.contains(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onContextMenu(event: MouseEvent): void {
  if (tipTarget(event.target)) event.preventDefault();
}

function onScroll(): void {
  if (openButton && tip && !tip.hidden) place(openButton);
}

export function mountTips(): void {
  tip = document.createElement('div');
  tip.id = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  nameEl = document.createElement('p');
  nameEl.id = 'tip-name';
  bodyEl = document.createElement('p');
  bodyEl.id = 'tip-body';
  tip.append(nameEl, bodyEl);
  document.body.append(tip);

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
}
