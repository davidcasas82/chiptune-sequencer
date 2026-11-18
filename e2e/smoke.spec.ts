import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { dismissGuide } from './guide';

function pcmRms(wav: Buffer, channel: 0 | 1): number {
  let acc = 0;
  let count = 0;
  for (let offset = 44 + channel * 2; offset + 1 < wav.length; offset += 4) {
    const sample = wav.readInt16LE(offset) / 32767;
    acc += sample * sample;
    count += 1;
  }
  return count ? Math.sqrt(acc / count) : 0;
}

async function waitIsolated(page: { evaluate: (fn: () => boolean) => Promise<boolean>; waitForTimeout: (ms: number) => Promise<void> }): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const ready = await page.evaluate(() => {
        const root = document.documentElement;
        return root.dataset.isolated === '1' && root.dataset.scope === '1';
      });
      if (ready) return;
    } catch {
      // the isolation reload replaces the page
    }
    await page.waitForTimeout(200);
  }
  throw new Error('page did not become cross-origin isolated');
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address !== 'string' ? address.port : 0;
      probe.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('could not reserve a free port'));
        else resolve(port);
      });
    });
  });
}

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // the server is still coming up
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`nested server did not start: ${url}`);
}

test('loads, plays, and stays quiet in the console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();
  await page.waitForFunction(async () => {
    const names = await caches.keys();
    if (!names.includes('chiptune-5')) return false;
    const cache = await caches.open('chiptune-5');
    const keys = await cache.keys();
    return keys.some((key) => key.url.includes('chiptune-worklet.js'));
  }, undefined, { timeout: 15000 });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? '');
  expect(scope.endsWith('/')).toBe(true);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(350);

  const html = readFileSync('dist/index.html', 'utf8');
  expect(html.includes('src="/')).toBe(false);
  expect(html.includes('href="/')).toBe(false);

  const colors = await page.evaluate(() => {
    const canvas = document.querySelector('#grid') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return { green: 0, amber: 0 };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let green = 0;
    let amber = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > 160 && g > r * 1.3 && b < 160) green += 1;
      if (r > 160 && g > 100 && g < 220 && b < 90) amber += 1;
    }
    return { green, amber };
  });
  expect(colors.green).toBeGreaterThan(10);
  expect(colors.amber).toBeGreaterThan(5);

  await expect(page.locator('#scope')).toBeVisible();
  await expect(page.getByRole('button', { name: '12.5' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-isolated', '1');
  await expect(page.locator('html')).toHaveAttribute('data-scope', '1');
  await page.getByRole('button', { name: 'Song', exact: true }).click();
  await expect(page.locator('#lane button')).toHaveCount(3);

  mkdirSync('test-results', { recursive: true });
  await page.locator('#crt').click();
  await expect(page.locator('#veil')).toBeVisible();
  await page.screenshot({ path: 'test-results/stage5-crt-1366x1024.png' });
  const crtShot = readFileSync('test-results/stage5-crt-1366x1024.png');
  expect(crtShot.readUInt32BE(16)).toBe(1366);
  expect(crtShot.readUInt32BE(20)).toBe(1024);
  await page.locator('#neon').click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'neon');
  await page.screenshot({ path: 'test-results/stage5-neon-1366x1024.png' });
  const neonShot = readFileSync('test-results/stage5-neon-1366x1024.png');
  expect(neonShot.readUInt32BE(16)).toBe(1366);
  expect(neonShot.readUInt32BE(20)).toBe(1024);
  await page.locator('#neon').click();
  await page.locator('#crt').click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'crt');
  await expect(page.locator('#veil')).toBeHidden();
  const bundled = readdirSync('dist/assets').filter((name) => name.endsWith('.js')).map((name) => readFileSync(`dist/assets/${name}`, 'utf8')).join('\n');
  expect(bundled.includes('scope:`./`')).toBe(true);

  const worklet = await page.request.get('/chiptune-worklet.js');
  expect(worklet.ok()).toBeTruthy();
  const source = await worklet.text();
  expect(source).toContain('registerProcessor');
  expect(source.includes('import ')).toBe(false);

  const box = await page.locator('#grid').boundingBox();
  expect(box).toBeTruthy();
  if (box) await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.15);
  const roll = await page.locator('#roll').boundingBox();
  expect(roll).toBeTruthy();
  if (roll) await page.mouse.click(roll.x + 90, roll.y + 14);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#undo')).toBeDisabled();
  await page.getByRole('button', { name: 'Short', exact: true }).click();
  await expect(page.locator('#note-out')).toHaveText('SHT');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.locator('#bpm').fill('180');
  await expect(page.locator('#bpm-out')).toHaveText('180');
  const knob = await page.locator('#knob-vol').boundingBox();
  if (knob) {
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(knob.x + knob.width / 2, knob.y + 40);
    await page.mouse.up();
  }

  const b64 = await page.evaluate(async () => {
    const render = (window as unknown as { renderDemoWav: () => Promise<string> }).renderDemoWav;
    return render();
  });
  const wav = Buffer.from(b64, 'base64');
  expect(wav.subarray(0, 4).toString('utf8')).toBe('RIFF');
  expect(wav.subarray(8, 12).toString('utf8')).toBe('WAVE');
  expect(pcmRms(wav, 0)).toBeGreaterThan(0.02);
  expect(pcmRms(wav, 1)).toBeGreaterThan(0.02);
  const rate = wav.readUInt32LE(24);
  const seconds = (wav.length - 44) / 4 / rate;
  expect(seconds).toBeGreaterThan(20);
  expect(seconds).toBeLessThan(30);
  writeFileSync('test-results/stage5.wav', wav);
  await page.locator('#help-open').click();
  await expect(page.locator('#help')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.locator('#channels').getByRole('button', { name: 'TRI' }).click();
  await expect(page.locator('#wave')).toBeVisible();
  await expect(page.locator('#duty-row')).toBeHidden();
  const table = await page.locator('#wave').boundingBox();
  if (table) {
    await page.mouse.move(table.x + 6, table.y + 8);
    await page.mouse.down();
    await page.mouse.move(table.x + table.width - 6, table.y + table.height - 8);
    await page.mouse.up();
  }
  await page.locator('#channels').getByRole('button', { name: 'NSE' }).click();
  await expect(page.locator('#lfsr-short')).toBeVisible();
  await expect(page.locator('#wave')).toBeHidden();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('plays from a nested path', async ({ browser }) => {
  rmSync('test-results/subroot', { recursive: true, force: true });
  mkdirSync('test-results/subroot', { recursive: true });
  cpSync('dist', 'test-results/subroot/nested', { recursive: true });
  const port = await freePort();
  const nestedUrl = `http://127.0.0.1:${port}/nested/`;
  const server: ChildProcess = spawn('python3', [resolve('scripts/serve.py'), String(port)], {
    cwd: 'test-results/subroot',
    stdio: 'ignore',
  });
  try {
    await waitFor(nestedUrl);
    const page = await browser.newPage({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(nestedUrl);
    await waitIsolated(page);
    await dismissGuide(page);
    const nested = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const cache = await caches.open('chiptune-5');
      const keys = await cache.keys();
      return {
        scope: registration?.scope ?? '',
        worklet: keys.some((key) => key.url.includes('chiptune-worklet.js')),
      };
    });
    expect(nested.scope.endsWith('/nested/')).toBe(true);
    expect(nested.worklet).toBe(true);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.waitForTimeout(400);
    await page.context().setOffline(true);
    await page.reload();
    await waitIsolated(page);
    const offline = await page.evaluate(async () => {
      const cache = await caches.open('chiptune-5');
      const keys = await cache.keys();
      let coop = '';
      let coep = '';
      for (const key of keys) {
        if (!key.url.endsWith('index.html') && !key.url.endsWith('/')) continue;
        const response = await cache.match(key);
        if (!response) continue;
        coop = response.headers.get('cross-origin-opener-policy') ?? '';
        coep = response.headers.get('cross-origin-embedder-policy') ?? '';
        if (coop && coep) break;
      }
      return { coop, coep, isolated: window.crossOriginIsolated, count: keys.length };
    });
    expect(offline.isolated).toBe(true);
    expect(offline.coop).toBe('same-origin');
    expect(offline.coep).toBe('require-corp');
    expect(offline.count).toBeGreaterThan(3);
    await expect(page.locator('#grid')).toBeVisible();
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.context().setOffline(false);
    const b64 = await page.evaluate(async () => {
      return (window as unknown as { renderDemoWav: () => Promise<string> }).renderDemoWav();
    });
    expect(Buffer.from(b64, 'base64').subarray(0, 4).toString('utf8')).toBe('RIFF');
    expect(errors, errors.join('\n')).toEqual([]);
    await page.close();
  } finally {
    server.kill('SIGTERM');
  }
});
