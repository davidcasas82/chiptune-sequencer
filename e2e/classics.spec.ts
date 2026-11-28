import { expect, test, type Page } from '@playwright/test';
import { dismissGuide } from './guide';

const PRESETS = [
  { name: 'Super Mario Bros. Overworld', bpm: '180' },
  { name: 'Zelda Overworld', bpm: '108' },
  { name: 'Tetris Korobeiniki Type A', bpm: '150' },
  { name: 'Mega Man 2 Wily Stage 1', bpm: '168' },
] as const;

async function stored(page: Page): Promise<{ auto: string; list: string }> {
  return page.evaluate(() => ({
    auto: localStorage.getItem('chiptune-autosave') ?? '',
    list: localStorage.getItem('chiptune-projects') ?? '',
  }));
}

async function staysStored(page: Page, before: { auto: string; list: string }): Promise<void> {
  const start = Date.now();
  await expect.poll(async () => {
    const now = await stored(page);
    return now.auto === before.auto && now.list === before.list && Date.now() - start > 600;
  }).toBe(true);
}

test('each built-in song opens and plays without touching saved songs', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();

  const projects = page.locator('#projects');
  await expect(projects.locator('optgroup[label="Built in"] option')).toHaveText(PRESETS.map((preset) => preset.name));
  await expect(projects.locator('optgroup[label="Saved"]')).toHaveCount(0);

  await page.locator('#name').fill('Kept tune');
  await page.locator('#save').click();
  await expect(projects.locator('option:checked')).toHaveText('Kept tune');
  await expect(projects.locator('optgroup[label="Saved"] option')).toHaveText(['Kept tune']);
  await expect.poll(async () => (await stored(page)).auto).toContain('"name":"Kept tune"');
  const before = await stored(page);
  expect(before.list).toContain('Kept tune');
  expect(before.list).not.toContain('Super Mario Bros. Overworld');

  for (const preset of PRESETS) {
    await projects.selectOption({ label: preset.name });
    await expect(page.locator('#name')).toHaveValue(preset.name);
    await expect(page.locator('#bpm-out')).toHaveText(preset.bpm);
    await expect(projects.locator('option:checked')).toHaveText(preset.name);
    await expect(page.locator('#delete-saved')).toBeDisabled();
    await page.locator('#play').click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await staysStored(page, before);
    await expect(projects.locator('optgroup[label="Saved"] option')).toHaveText(['Kept tune']);
  }
});
