import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { dismissGuide } from './guide';

const LABEL = 84;
const GUTTER = 12;

type PointerKind = 'pen' | 'touch' | 'mouse';

async function frames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, count);
}

async function settle(page: Page): Promise<void> {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-isolated', '1');
  await page.locator('#clear-pattern').click();
  await frames(page);
}

async function session(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

async function point(client: CDPSession, input: {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved';
  x: number;
  y: number;
  kind: PointerKind;
  pressure: number;
  buttons: number;
}): Promise<void> {
  await client.send('Input.dispatchMouseEvent', {
    type: input.type,
    x: input.x,
    y: input.y,
    button: input.type === 'mouseMoved' && input.buttons === 0 ? 'none' : 'left',
    buttons: input.buttons,
    pointerType: input.kind,
    force: input.pressure,
    clickCount: input.type === 'mousePressed' ? 1 : 0,
  });
}

async function rollBox(page: Page): Promise<{ x: number; y: number; width: number; height: number; stepW: number }> {
  const box = await page.locator('#roll').boundingBox();
  expect(box).toBeTruthy();
  if (!box) throw new Error('piano roll has no box');
  return { ...box, stepW: (box.width - LABEL - GUTTER) / 16 };
}

function cellX(roll: { x: number; stepW: number }, step: number): number {
  return roll.x + LABEL + (step + 0.5) * roll.stepW;
}

async function labelHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#roll');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    const context = canvas.getContext('2d');
    if (!context) return '';
    const width = Math.min(80, canvas.width);
    const data = context.getImageData(0, 0, width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 16) {
      hash ^= data[i] + (data[i + 1] << 8);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  });
}

async function rowReport(page: Page): Promise<{ step: number; rows: number; unlabeled: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#roll');
    if (!(canvas instanceof HTMLCanvasElement)) return { step: 0, rows: 0, unlabeled: 0 };
    const context = canvas.getContext('2d');
    if (!context) return { step: 0, rows: 0, unlabeled: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    const sampleX = Math.min(width - 1, Math.max(0, Math.round(2 * dpr)));
    const inkLeft = Math.round(4 * dpr);
    const inkRight = Math.min(width, Math.round(78 * dpr));
    const limit = Math.max(0, height - Math.round(12 * dpr));
    const at = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      return [data[index], data[index + 1], data[index + 2]];
    };
    const gap = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const inked = (r: number, g: number, b: number) => r > 45 && r > g + 4 && r > b + 8;
    const runs: { start: number; end: number }[] = [];
    let start = 0;
    let color = at(sampleX, 0);
    for (let y = 1; y < limit; y++) {
      const next = at(sampleX, y);
      if (gap(color, next) < 6) continue;
      runs.push({ start, end: y });
      start = y;
      color = next;
    }
    runs.push({ start, end: limit });
    const measured = runs
      .map((run) => (run.end - run.start) / dpr)
      .filter((css) => css >= 8);
    const shortest = Math.min(...measured);
    const singles = measured.filter((css) => css <= shortest * 1.5);
    const ordered = [...singles].sort((a, b) => a - b);
    const step = ordered[Math.floor(ordered.length / 2)] ?? 0;
    let rows = 0;
    let unlabeled = 0;
    const hasInk = (y0: number, y1: number) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = inkLeft; x < inkRight; x += 2) {
          const [r, g, b] = at(x, y);
          if (inked(r, g, b)) return true;
        }
      }
      return false;
    };
    for (const run of runs) {
      const css = (run.end - run.start) / dpr;
      if (css < step * 0.6 || step <= 0) continue;
      const parts = Math.max(1, Math.round(css / step));
      const slice = (run.end - run.start) / parts;
      for (let part = 0; part < parts; part++) {
        const y0 = Math.floor(run.start + part * slice);
        const y1 = Math.floor(run.start + (part + 1) * slice);
        if (y1 - y0 < step * dpr * 0.6) continue;
        rows += 1;
        if (!hasInk(y0, y1)) unlabeled += 1;
      }
    }
    return { step, rows, unlabeled };
  });
}

async function textBands(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#roll');
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    const inkLeft = Math.round(4 * dpr);
    const inkRight = Math.min(width, Math.round(78 * dpr));
    const limit = Math.max(0, height - Math.round(12 * dpr));
    const marked: boolean[] = [];
    for (let y = 0; y < limit; y++) {
      let ink = false;
      for (let x = inkLeft; x < inkRight; x += 2) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (r > 70 && r > g + 8 && r > b + 20) {
          ink = true;
          break;
        }
      }
      marked.push(ink);
    }
    let bands = 0;
    let gap = 99;
    for (const ink of marked) {
      if (!ink) {
        gap += 1;
        continue;
      }
      if (gap > 3) bands += 1;
      gap = 0;
    }
    return bands;
  });
}

async function scopeReach(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('#scope');
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    const mid = height / 2;
    let reach = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (g > 140 && g > r * 1.4 && g > b) reach = Math.max(reach, Math.abs(y - mid));
      }
    }
    return reach;
  });
}

async function zoomIn(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) await page.locator('#zoom-in').click();
  await frames(page);
}

test('a pencil hover stays quiet and a press previews an audible note', async ({ page }) => {
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('data-scope', '1');
  const roll = await rollBox(page);
  const client = await session(page);
  const x = cellX(roll, 1);
  const y = roll.y + roll.height / 2;
  await expect(page.locator('#note-out')).toHaveText('C5');
  await expect(page.locator('#vol-read')).toHaveText('0F');
  await point(client, { type: 'mouseMoved', x, y, kind: 'pen', pressure: 0, buttons: 0 });
  await page.locator('#roll').evaluate((node, pos) => {
    const down = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'pen',
      isPrimary: true,
      button: 0,
      buttons: 0,
      pressure: 0,
      clientX: pos.x,
      clientY: pos.y,
    });
    node.dispatchEvent(down);
    node.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'pen',
      isPrimary: true,
      button: 0,
      buttons: 0,
      pressure: 0,
      clientX: pos.x,
      clientY: pos.y,
    }));
  }, { x, y });
  await frames(page);
  await expect(page.locator('#note-out')).toHaveText('C5');
  await expect(page.locator('#vol-read')).toHaveText('0F');

  const quiet = await scopeReach(page);
  await point(client, { type: 'mousePressed', x, y, kind: 'pen', pressure: 1, buttons: 1 });
  await expect.poll(() => scopeReach(page), { timeout: 4000 }).toBeGreaterThan(quiet + 2);
  await expect(page.locator('#vol-read')).toHaveText('0F');
  await expect(page.locator('#note-out')).not.toHaveText('C5');
  await point(client, { type: 'mouseReleased', x, y, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#vol-read')).toHaveText('0F');

  const lightX = cellX(roll, 3);
  await point(client, { type: 'mousePressed', x: lightX, y, kind: 'pen', pressure: 0.02, buttons: 1 });
  await frames(page);
  await expect(page.locator('#vol-read')).toHaveText('04');
  await point(client, { type: 'mouseReleased', x: lightX, y, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#vol-read')).toHaveText('04');
});

test('a pencil stroke keeps its peak loudness when the lift falls', async ({ page }) => {
  await settle(page);
  const roll = await rollBox(page);
  const client = await session(page);
  const x = cellX(roll, 5);
  const y = roll.y + roll.height / 2;
  await point(client, { type: 'mousePressed', x, y, kind: 'pen', pressure: 0.35, buttons: 1 });
  await page.waitForTimeout(40);
  await point(client, { type: 'mouseMoved', x: x + 6, y, kind: 'pen', pressure: 0.8, buttons: 1 });
  await page.waitForTimeout(150);
  await point(client, { type: 'mouseMoved', x: x + 12, y, kind: 'pen', pressure: 0.1, buttons: 1 });
  await point(client, { type: 'mouseReleased', x: x + 12, y, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#vol-read')).toHaveText('0C');
});

test('a pencil stroke locks scrolling', async ({ page }) => {
  await settle(page);
  await zoomIn(page);
  const roll = await rollBox(page);
  const x = cellX(roll, 6);
  const y = roll.y + roll.height / 2;
  await page.mouse.move(x, y);
  const parked = await labelHash(page);
  await page.mouse.wheel(0, 420);
  await frames(page);
  const scrolled = await labelHash(page);
  expect(scrolled).not.toBe(parked);
  await page.locator('#fit').click();
  await zoomIn(page);
  await page.mouse.move(x, y);
  const lockedAt = await labelHash(page);
  const client = await session(page);
  await point(client, { type: 'mousePressed', x, y, kind: 'pen', pressure: 0.4, buttons: 1 });
  await frames(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 420);
  await frames(page);
  expect(await labelHash(page)).toBe(lockedAt);
  await point(client, { type: 'mouseReleased', x, y, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 420);
  await frames(page);
  expect(await labelHash(page)).not.toBe(lockedAt);
});

test('a pencil drag keeps the pitch and the frozen range', async ({ page }) => {
  await settle(page);
  const roll = await rollBox(page);
  const client = await session(page);
  const x = cellX(roll, 8);
  const y = roll.y + roll.height / 2;
  const before = await labelHash(page);
  await point(client, { type: 'mousePressed', x, y, kind: 'pen', pressure: 0.5, buttons: 1 });
  await frames(page);
  const note = await page.locator('#note-out').innerText();
  await point(client, { type: 'mouseMoved', x, y: y - 96, kind: 'pen', pressure: 0.5, buttons: 1 });
  await frames(page);
  await expect(page.locator('#note-out')).toHaveText(note);
  expect(await labelHash(page)).toBe(before);
  await point(client, { type: 'mouseReleased', x, y: y - 96, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#note-out')).toHaveText(note);
  expect(await labelHash(page)).toBe(before);
});

test('a pencil tap above or below the musical range clamps', async ({ page }) => {
  await settle(page);
  await zoomIn(page);
  const roll = await rollBox(page);
  const client = await session(page);
  const x = cellX(roll, 2);
  await page.mouse.move(x, roll.y + 20);
  await page.mouse.wheel(0, -2400);
  await frames(page);
  await point(client, { type: 'mousePressed', x, y: roll.y + 3, kind: 'pen', pressure: 0.5, buttons: 1 });
  await point(client, { type: 'mouseReleased', x, y: roll.y + 3, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#note-out')).toHaveText('C6');

  const lowX = cellX(roll, 4);
  await page.mouse.move(lowX, roll.y + roll.height - 20);
  await page.mouse.wheel(0, 4800);
  await frames(page);
  const lowY = roll.y + roll.height - GUTTER - 3;
  await point(client, { type: 'mousePressed', x: lowX, y: lowY, kind: 'pen', pressure: 0.5, buttons: 1 });
  await point(client, { type: 'mouseReleased', x: lowX, y: lowY, kind: 'pen', pressure: 0, buttons: 0 });
  await frames(page);
  await expect(page.locator('#note-out')).toHaveText('C3');
});

test('a pencil tip sits below a control, or above it at the screen edge', async ({ page }) => {
  await settle(page);
  const client = await session(page);
  const play = await page.locator('#play').boundingBox();
  expect(play).toBeTruthy();
  if (!play) return;
  const playX = play.x + play.width / 2;
  const playY = play.y + play.height / 2;
  await point(client, { type: 'mouseMoved', x: playX, y: playY, kind: 'pen', pressure: 0, buttons: 0 });
  await expect(page.locator('#tip')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#tip-name')).toHaveText('Start the song, or stop it.');
  const placed = await page.evaluate(() => {
    const tip = document.querySelector('#tip');
    const anchor = document.querySelector('#play');
    if (!(tip instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return null;
    const tipBox = tip.getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    return {
      tipTop: tipBox.top,
      tipBottom: tipBox.bottom,
      tipLeft: tipBox.left,
      tipRight: tipBox.right,
      anchorTop: anchorBox.top,
      anchorBottom: anchorBox.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(placed).toBeTruthy();
  if (!placed) return;
  expect(placed.tipTop).toBeGreaterThan(placed.anchorBottom);
  expect(placed.tipLeft).toBeGreaterThanOrEqual(8);
  expect(placed.tipRight).toBeLessThanOrEqual(placed.width - 8);
  expect(placed.tipBottom).toBeLessThanOrEqual(placed.height - 8);

  const edge = page.locator('[data-mute="5"]');
  const edgeBox = await edge.boundingBox();
  expect(edgeBox).toBeTruthy();
  if (!edgeBox) return;
  const edgeX = edgeBox.x + edgeBox.width / 2;
  const edgeY = edgeBox.y + edgeBox.height / 2;
  await point(client, { type: 'mouseMoved', x: edgeX, y: edgeY, kind: 'pen', pressure: 0, buttons: 0 });
  await expect(page.locator('#tip-name')).toHaveText('Silence Extra Drums.');
  const flipped = await page.evaluate(() => {
    const tip = document.querySelector('#tip');
    const anchor = document.querySelector('[data-mute="5"]');
    if (!(tip instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return null;
    const tipBox = tip.getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    return {
      tipTop: tipBox.top,
      tipBottom: tipBox.bottom,
      anchorTop: anchorBox.top,
      anchorBottom: anchorBox.bottom,
      height: window.innerHeight,
    };
  });
  expect(flipped).toBeTruthy();
  if (!flipped) return;
  const room = flipped.height - 8 - (flipped.anchorBottom + 14 + (flipped.tipBottom - flipped.tipTop));
  if (room >= 0) expect(flipped.tipTop).toBeGreaterThan(flipped.anchorBottom);
  else expect(flipped.tipBottom).toBeLessThanOrEqual(flipped.anchorTop);
  expect(flipped.tipTop).toBeGreaterThanOrEqual(8);
});

test('a pencil press does not open the menu, and the callout is blocked', async ({ page }) => {
  await settle(page);
  const roll = await rollBox(page);
  const client = await session(page);
  const x = cellX(roll, 7);
  const y = roll.y + roll.height / 2;
  await point(client, { type: 'mousePressed', x, y, kind: 'pen', pressure: 0.05, buttons: 1 });
  await page.waitForTimeout(40);
  await point(client, { type: 'mouseMoved', x: x + 2, y, kind: 'pen', pressure: 0.6, buttons: 1 });
  await page.waitForTimeout(800);
  await expect(page.locator('#radial')).toBeHidden();
  await point(client, { type: 'mouseReleased', x: x + 2, y, kind: 'pen', pressure: 0, buttons: 0 });

  await point(client, { type: 'mousePressed', x, y: y + 30, kind: 'touch', pressure: 0, buttons: 1 });
  await expect(page.locator('#radial')).toBeVisible({ timeout: 2000 });
  await point(client, { type: 'mouseReleased', x, y: y + 30, kind: 'touch', pressure: 0, buttons: 0 });

  const prevented = await page.locator('#roll').evaluate((node) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  const playPrevented = await page.locator('#play').evaluate((node) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  expect(playPrevented).toBe(true);
});

test('every piano-roll row has a label', async ({ page }) => {
  await settle(page);
  const melody = await rowReport(page);
  expect(melody.unlabeled, JSON.stringify(melody)).toBe(0);
  expect(melody.rows).toBeGreaterThan(10);
  expect(melody.step).toBeLessThan(20);
  await page.locator('#channels').getByRole('button', { name: 'NSE' }).click();
  await frames(page);
  expect(await textBands(page)).toBe(5);
});

test.describe('touch rows', () => {
  test.use({
    hasTouch: true,
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 1,
  });

  test('touch rows stay tall enough to land on', async ({ page }) => {
    await settle(page);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    const melody = await rowReport(page);
    expect(melody.unlabeled, JSON.stringify(melody)).toBe(0);
    expect(melody.rows).toBeGreaterThan(4);
    expect(melody.step).toBeGreaterThanOrEqual(24);
  });
});
