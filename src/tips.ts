import { tipFor } from './tip-copy';

export const TIP_HOLD_MS = 500;
export const TIP_HOVER_MS = 600;
export const TIP_STILL_PX = 8;

type Press = {
  button: HTMLElement;
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
let openButton: HTMLElement | null = null;
let openFrom: 'hover' | 'hold' | null = null;
let press: Press | null = null;
let suppress: HTMLElement | null = null;
let knobHold: HTMLButtonElement | null = null;
let touchUntil = 0;
let hoverTimer = 0;
let hoverTarget: HTMLElement | null = null;

export function consumeKnobHold(button: HTMLButtonElement): boolean {
  if (knobHold !== button) return false;
  knobHold = null;
  return true;
}

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  if (node.closest('canvas, input, select, textarea')) return null;
  const host = node.closest('button, [data-tip], #iso');
  if (!(host instanceof HTMLElement)) return null;
  if (host.closest('[hidden]')) return null;
  if (host instanceof HTMLButtonElement && host.disabled) return null;
  if (!tipFor(host)) return null;
  return host;
}

function canHover(event: PointerEvent): boolean {
  if (event.pointerType === 'touch' || event.buttons !== 0) return false;
  if (event.pointerType === 'pen') return true;
  return event.pointerType === 'mouse' && performance.now() > touchUntil;
}

function rememberTouch(event: PointerEvent): void {
  if (event.pointerType === 'touch') touchUntil = performance.now() + 900;
}

function place(button: HTMLElement): void {
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

function showTip(button: HTMLElement, from: 'hover' | 'hold'): void {
  if (!tip || !nameEl || !bodyEl) return;
  const copy = tipFor(button);
  if (!copy) return;
  if (openButton === button && openFrom === from && !tip.hidden && nameEl.textContent === copy) return;
  nameEl.textContent = copy;
  bodyEl.textContent = '';
  bodyEl.hidden = true;
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

function cancelHover(): void {
  if (hoverTimer) window.clearTimeout(hoverTimer);
  hoverTimer = 0;
  hoverTarget = null;
}

function scheduleHover(button: HTMLElement): void {
  if (openFrom === 'hover' && openButton === button && tip && !tip.hidden) return;
  if (hoverTarget === button && hoverTimer) return;
  cancelHover();
  hoverTarget = button;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = 0;
    if (hoverTarget !== button) return;
    showTip(button, 'hover');
  }, TIP_HOVER_MS);
}

function onPointerDown(event: PointerEvent): void {
  rememberTouch(event);
  if (!event.isPrimary || event.button !== 0) return;
  suppress = null;
  const button = tipTarget(event.target);
  clearPress();
  cancelHover();
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
    cancelHover();
    if (openFrom === 'hover') hideTip();
    return;
  }
  scheduleHover(button);
}

function onPointerOver(event: PointerEvent): void {
  if (press || !canHover(event)) return;
  const button = tipTarget(event.target);
  if (!button) return;
  scheduleHover(button);
}

function onPointerOut(event: PointerEvent): void {
  const leaving = tipTarget(event.target);
  if (hoverTarget && leaving === hoverTarget) {
    const next = event.relatedTarget;
    if (!(next instanceof Node && hoverTarget.contains(next))) cancelHover();
  }
  if (openFrom !== 'hover' || !openButton) return;
  if (leaving !== openButton) return;
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
  if (held && !moved && button instanceof HTMLButtonElement && button.closest('.knob')) knobHold = button;
  if (openFrom === 'hold') hideTip();
  if (event.type === 'pointercancel') return;
  const over = tipTarget(document.elementFromPoint(event.clientX, event.clientY));
  if (over && canHover(event)) scheduleHover(over);
}

function onClick(event: MouseEvent): void {
  const held = suppress;
  if (!held) return;
  suppress = null;
  const target = event.target;
  if (!(target instanceof Node)) return;
  const label = held.closest('label');
  const controlId = label?.getAttribute('for');
  const labeled = controlId !== undefined && target instanceof Element && target.id === controlId;
  if (held.contains(target) || labeled) {
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
