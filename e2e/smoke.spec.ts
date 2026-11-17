import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
  throw new Error('nested server did not start');
}

test('loads, plays, and stays quiet in the console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.goto('/');
  await expect(page.locator('#grid')).toBeVisible();
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

  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/stage3-1366x1024.png' });
  const shot = readFileSync('test-results/stage3-1366x1024.png');
  expect(shot.readUInt32BE(16)).toBe(1366);
  expect(shot.readUInt32BE(20)).toBe(1024);

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
  writeFileSync('test-results/stage3.wav', wav);

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
  const server: ChildProcess = spawn('python3', ['-m', 'http.server', '4179', '--bind', '127.0.0.1'], {
    cwd: 'test-results/subroot',
    stdio: 'ignore',
  });
  try {
    await waitFor('http://127.0.0.1:4179/nested/');
    const page = await browser.newPage({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('http://127.0.0.1:4179/nested/');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
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
