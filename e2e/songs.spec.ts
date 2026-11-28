import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createEngine } from '../src/audio/engine';
import { stringifyProject } from '../src/audio/project';
import { DATA_WARNING } from '../src/audio/library';
import { dismissGuide } from './guide';

test('save as new keeps both songs and replace asks first', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#new-song').click();
  await expect(page.locator('#name')).toHaveValue('Song');
  await page.locator('#songs-close').click();
  await page.locator('#bpm').fill('180');
  await page.locator('#songs-open').click();
  await page.locator('#save').click();
  await expect(page.locator('#song-list button')).toHaveText(['Song']);

  await page.locator('#new-song').click();
  await expect(page.locator('#name')).toHaveValue('Song 2');
  await page.locator('#songs-close').click();
  await page.locator('#bpm').fill('90');
  await page.locator('#songs-open').click();
  await page.locator('#name').fill('Song');
  await page.locator('#save').click();
  const ask = page.locator('#ask-replace');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Replace your song named Song?');
  await expect(ask.locator('button').first()).toHaveText('Save as new');
  await ask.getByRole('button', { name: 'Save as new' }).click();
  await expect(page.locator('#song-list button')).toHaveCount(2);

  await page.locator('#song-list').getByRole('option', { name: 'Song', exact: true }).nth(1).click();
  await page.locator('#song-open').click();
  await expect(page.locator('#bpm-out')).toHaveText('180');
  await page.locator('#song-list').getByRole('option', { name: 'Song', exact: true }).first().click();
  await page.locator('#song-open').click();
  await expect(page.locator('#bpm-out')).toHaveText('90');
});

test('replace writes over the other song', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await page.locator('#bpm').fill('180');
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#name').fill('Alpha');
  await page.locator('#save').click();
  await page.locator('#new-song').click();
  await page.locator('#songs-close').click();
  await page.locator('#bpm').fill('90');
  await page.locator('#songs-open').click();
  await page.locator('#name').fill('Alpha');
  await page.locator('#save').click();
  await page.locator('#ask-replace').getByRole('button', { name: 'Replace' }).click();
  await expect(page.locator('#songs-dirty')).toHaveText('');
  await expect(page.locator('#song-list button')).toHaveText(['Alpha']);
  await page.reload();
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await expect(page.locator('#name')).toHaveValue('Alpha');
  await expect(page.locator('#bpm-out')).toHaveText('90');
  await expect(page.locator('#songs-dirty')).toHaveText('');
});

test('one delete can be undone after reload and does not come back by itself', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await page.locator('#bpm').fill('90');
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#name').fill('Night Ride');
  await page.locator('#save').click();
  await page.locator('#song-list').getByRole('option', { name: 'Night Ride', exact: true }).click();
  await page.locator('#song-delete').click();
  await page.locator('#ask-delete').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#song-undo-text')).toHaveText('Night Ride deleted.');
  await page.reload();
  await page.locator('#songs-open').click();
  await expect(page.locator('#song-undo')).toBeVisible();
  await expect(page.locator('#song-undo-text')).toHaveText('Night Ride deleted.');
  await expect(page.locator('#name')).not.toHaveValue('Night Ride');
  await expect(page.locator('#song-list')).not.toContainText('Night Ride');
  await page.locator('#song-undo-btn').click();
  await expect(page.locator('#song-undo')).toBeHidden();
  await page.locator('#song-list').getByRole('option', { name: 'Night Ride', exact: true }).click();
  await page.locator('#song-open').click();
  await expect(page.locator('#name')).toHaveValue('Night Ride');
  await expect(page.locator('#bpm-out')).toHaveText('90');
});

test('the name field fits 40 characters and strips the rest as they are typed', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  const fit = await page.locator('#name').evaluate((el: HTMLInputElement) => {
    el.value = 'M'.repeat(40);
    return el.scrollWidth <= el.clientWidth + 1;
  });
  expect(fit).toBe(true);
  await page.locator('#name').fill('Night!!Ride');
  await expect(page.locator('#name')).toHaveValue('NightRide');
  await page.locator('#name').fill('!!!');
  await page.locator('#name').blur();
  await expect(page.locator('#name')).toHaveValue('Demo');
  await expect(page.locator('#songs-note')).toHaveText(DATA_WARNING);
});

test('a cancelled share and a bad file are said out loud', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await page.evaluate(() => {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    nav.canShare = () => true;
    nav.share = () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  });
  await page.locator('#json-out').click();
  await expect(page.locator('#songs-alert')).toHaveText('Share cancelled.');
  await page.locator('#file').setInputFiles({
    name: 'nope.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"v":2,"name":"Nope"}'),
  });
  await expect(page.locator('#songs-alert')).toHaveText('This file is not a version 1 song.');
  await expect(page.locator('#name')).toHaveValue('Demo');
});

test('hiding the page writes the scratch copy', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();
  const body = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#bpm');
    if (!input) return '';
    input.value = '155';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
    return localStorage.getItem('chiptune-autosave') ?? '';
  });
  expect(body).toContain('"bpm":155');
});

test('songs already in the old list are copied with nothing lost', async ({ page }) => {
  const engine = createEngine();
  engine.setTitle('Older');
  engine.setBpm(100);
  const older = stringifyProject(engine.snapshot());
  engine.setTitle('Kept tune');
  engine.setBpm(132);
  const kept = stringifyProject(engine.snapshot());
  await page.addInitScript(
    ({ olderBody, keptBody }) => {
      localStorage.setItem(
        'chiptune-projects',
        JSON.stringify([
          { id: 'old', name: 'Older', body: olderBody },
          { id: 'kept', name: 'Kept tune', body: keptBody },
        ]),
      );
      localStorage.setItem('chiptune-autosave', keptBody);
    },
    { olderBody: older, keptBody: kept },
  );
  await page.goto('/');
  await expect(page.locator('#grid')).toBeVisible();
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await expect(page.locator('#name')).toHaveValue('Kept tune');
  await expect(page.locator('#bpm-out')).toHaveText('132');
  await expect(page.locator('#songs-dirty')).toHaveText('');
  await expect(page.locator('#song-list button')).toHaveText(['Kept tune', 'Older']);
  const stored = await page.evaluate(async () => {
    const list = localStorage.getItem('chiptune-projects');
    const auto = localStorage.getItem('chiptune-autosave');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chiptune');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Array<{ id: string; name: string; body: string }>>((resolve, reject) => {
      const request = db.transaction('songs', 'readonly').objectStore('songs').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ id: string; name: string; body: string }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { list, auto, rows };
  });
  expect(stored.list).toBeNull();
  expect(stored.auto).toBe(kept);
  expect(stored.rows.find((row) => row.id === 'kept')?.body).toBe(kept);
  expect(stored.rows.find((row) => row.id === 'old')?.body).toBe(older);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-all').click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const file = await readFile(path ?? '', 'utf8');
  const parsed = JSON.parse(file) as { songs: Array<{ name: string; body: string }> };
  expect(parsed.songs.map((item) => item.name)).toEqual(['Kept tune', 'Older']);
  expect(parsed.songs.map((item) => item.body)).toEqual([kept, older]);
  expect(file).not.toContain('Super Mario Bros.');
});
