import { expect, test, type Page } from '@playwright/test';
import { dismissGuide } from './guide';

const PRESETS = [
  { name: 'Super Mario Bros. Overworld', bpm: '180' },
  { name: 'Zelda Overworld', bpm: '108' },
  { name: 'Tetris Korobeiniki Type A', bpm: '150' },
  { name: 'Mega Man 2 Wily Stage 1', bpm: '168' },
] as const;

async function openSongs(page: Page): Promise<void> {
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
}

async function libraryRows(page: Page): Promise<Array<{ id: string; name: string; body: string }>> {
  return page.evaluate(async () => {
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
    return rows;
  });
}

test('built-in songs can be played or copied and are not saved into the library', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();
  await openSongs(page);

  await expect(page.locator('#builtin-list button')).toHaveText(PRESETS.map((preset) => preset.name));
  await expect(page.locator('#song-list button')).toHaveCount(0);

  await page.locator('#name').fill('Kept tune');
  await page.locator('#save').click();
  await expect(page.locator('#song-list button')).toHaveText(['Kept tune']);
  const before = await libraryRows(page);
  expect(before.map((row) => row.name)).toEqual(['Kept tune']);
  expect(before.some((row) => row.id.startsWith('builtin:'))).toBe(false);

  for (const preset of PRESETS) {
    await page.locator('#builtin-list').getByRole('option', { name: preset.name, exact: true }).click();
    await page.locator('#builtin-play').click();
    await expect(page.locator('#builtin-play')).toHaveText('Stop');
    await expect(page.locator('#name')).toHaveValue('Kept tune');
    await expect(page.locator('#bpm-out')).not.toHaveText(preset.bpm);
    await page.locator('#builtin-play').click();
    await expect(page.locator('#builtin-play')).toHaveText('Play');
    await expect.poll(async () => libraryRows(page)).toEqual(before);
  }

  await page.locator('#builtin-list').getByRole('option', { name: PRESETS[3].name, exact: true }).click();
  await page.locator('#builtin-copy').click();
  await expect(page.locator('#name')).toHaveValue(PRESETS[3].name);
  await expect(page.locator('#bpm-out')).toHaveText(PRESETS[3].bpm);
  await expect(page.locator('#songs-dirty')).toHaveText('Not saved');
  await expect.poll(async () => (await libraryRows(page)).map((row) => row.id)).toEqual(before.map((row) => row.id));

  await page.locator('#save').click();
  await expect(page.locator('#song-list button').first()).toHaveText(PRESETS[3].name);
  const after = await libraryRows(page);
  expect(after.some((row) => row.id.startsWith('builtin:'))).toBe(false);
  expect(after.find((row) => row.name === 'Kept tune')?.body).toBe(before[0].body);
  expect(after.some((row) => row.name === PRESETS[3].name && !row.id.startsWith('builtin:'))).toBe(true);
});
