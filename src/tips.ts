import { tipFor } from './tip-copy';

export const TIP_HOLD_MS = 500;
export const TIP_HOVER_MS = 600;
export const TIP_STILL_PX = 8;
export const TIP_GAP = 14;
export const TIP_HAND = 36;

export type TipRect = { left: number; top: number; width: number; height: number };

function overlaps(a: TipRect, b: TipRect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

function clearSpot(input: {
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  anchorHeight: number;
  tipWidth: number;
  tipHeight: number;
  screenWidth: number;
  screenHeight: number;
  obstacles?: TipRect[];
}): { left: number; top: number; below: boolean } | null {
  const obstacles = input.obstacles;
  if (!obstacles) return null;
  const margin = 8;
  const belowTop = input.anchorTop + input.anchorHeight + TIP_GAP;
  const aboveTop = input.anchorTop - input.tipHeight - TIP_GAP;
  const centered = input.anchorLeft + input.anchorWidth / 2 - input.tipWidth / 2;
  const maxLeft = Math.max(margin, input.screenWidth - input.tipWidth - margin);
  const candidates: { left: number; top: number }[] = [
    { left: centered, top: belowTop },
    { left: centered, top: aboveTop },
    { left: input.anchorLeft + input.anchorWidth + TIP_GAP, top: input.anchorTop },
    { left: input.anchorLeft - input.tipWidth - TIP_GAP, top: input.anchorTop },
  ];
  for (let shift = 12; shift <= input.screenWidth; shift += 12) {
    candidates.push({ left: centered - shift, top: belowTop });
    candidates.push({ left: centered + shift, top: belowTop });
    candidates.push({ left: centered - shift, top: aboveTop });
    candidates.push({ left: centered + shift, top: aboveTop });
  }
  for (const spot of candidates) {
    const left = Math.max(margin, Math.min(spot.left, maxLeft));
    if (spot.top < margin || spot.top + input.tipHeight > input.screenHeight - margin) continue;
    const box = { left, top: spot.top, width: input.tipWidth, height: input.tipHeight };
    if (obstacles.some((item) => overlaps(box, item))) continue;
    const below = spot.top >= input.anchorTop + input.anchorHeight;
    return { left: Math.round(left), top: Math.round(spot.top), below };
  }
  return null;
}

export function tipPlace(input: {
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  anchorHeight: number;
  tipWidth: number;
  tipHeight: number;
  screenWidth: number;
  screenHeight: number;
  obstacles?: TipRect[];
}): { left: number; top: number; below: boolean } {
  const cleared = clearSpot(input);
  if (cleared) return cleared;
  const margin = 8;
  const belowTop = input.anchorTop + input.anchorHeight + TIP_GAP;
  const aboveTop = input.anchorTop - input.tipHeight - TIP_GAP;
  const below = belowTop + input.tipHeight <= input.screenHeight - margin;
  let top = below ? belowTop : aboveTop;
  if (top < margin) top = margin;
  let left = input.anchorLeft + input.anchorWidth / 2 - input.tipWidth / 2 - TIP_HAND;
  const maxLeft = Math.max(margin, input.screenWidth - input.tipWidth - margin);
  if (left < margin) left = margin;
  if (left > maxLeft) left = maxLeft;
  return { left: Math.round(left), top: Math.round(top), below };
}

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

function buttonObstacles(anchor: HTMLElement): TipRect[] {
  const boxes: TipRect[] = [];
  for (const node of document.querySelectorAll('button')) {
    if (!(node instanceof HTMLElement) || node === anchor) continue;
    if (anchor.contains(node) || node.contains(anchor)) continue;
    if (node.closest('[hidden]')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    boxes.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }
  const own = anchor.getBoundingClientRect();
  boxes.push({ left: own.left, top: own.top, width: own.width, height: own.height });
  return boxes;
}

function place(button: HTMLElement): void {
  if (!tip) return;
  const anchor = button.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const spot = tipPlace({
    anchorLeft: anchor.left,
    anchorTop: anchor.top,
    anchorWidth: anchor.width,
    anchorHeight: anchor.height,
    tipWidth: box.width,
    tipHeight: box.height,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    obstacles: buttonObstacles(button),
  });
  tip.style.left = `${spot.left}px`;
  tip.style.top = `${spot.top}px`;
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
  if (!tip || !nameEl) return;
  const copy = tipFor(button);
  if (!copy) return;
  if (openButton === button && openFrom === from && !tip.hidden && nameEl.textContent === copy) return;
  nameEl.textContent = copy;
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

function hoverWait(event: PointerEvent): number {
  return event.pointerType === 'pen' ? TIP_HOVER_MS : 0;
}

function disabledUnder(x: number, y: number): HTMLElement | null {
  for (const node of document.querySelectorAll('button:disabled')) {
    if (!(node instanceof HTMLButtonElement)) continue;
    const rect = node.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    return tipTarget(node);
  }
  return null;
}

function tipHostAt(event: PointerEvent): HTMLElement | null {
  return disabledUnder(event.clientX, event.clientY) ?? tipTarget(event.target);
}

function scheduleHover(button: HTMLElement, delay: number): void {
  if (openFrom === 'hover' && openButton === button && tip && !tip.hidden) return;
  if (delay > 0 && hoverTarget === button && hoverTimer) return;
  cancelHover();
  hoverTarget = button;
  if (delay <= 0) {
    showTip(button, 'hover');
    return;
  }
  hoverTimer = window.setTimeout(() => {
    hoverTimer = 0;
    if (hoverTarget !== button) return;
    showTip(button, 'hover');
  }, delay);
}

function onPointerDown(event: PointerEvent): void {
  rememberTouch(event);
  if (!event.isPrimary || event.button !== 0) return;
  suppress = null;
  const button = tipHostAt(event);
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
  const button = tipHostAt(event);
  if (!button) {
    cancelHover();
    if (openFrom === 'hover') hideTip();
    return;
  }
  scheduleHover(button, hoverWait(event));
}

function onPointerOver(event: PointerEvent): void {
  if (press || !canHover(event)) return;
  const button = tipHostAt(event);
  if (!button) return;
  scheduleHover(button, hoverWait(event));
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
  const over = disabledUnder(event.clientX, event.clientY)
    ?? tipTarget(document.elementFromPoint(event.clientX, event.clientY));
  if (over && canHover(event)) scheduleHover(over, hoverWait(event));
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
  tip.append(nameEl);
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
