import { expect, test } from '@playwright/test';
import { dismissGuide } from './guide';

test('a canceled open keeps the unsaved song after reload', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();

  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  const name = page.locator('#name');

  await name.fill('First');
  await page.locator('#save').click();
  await expect(page.locator('#song-list button')).toHaveText(['First']);

  await page.locator('#new-song').click();
  await expect(name).toHaveValue('Song');
  await name.fill('Second');
  await page.locator('#save').click();
  await expect(page.locator('#song-list button').first()).toHaveText('Second');
  await page.locator('#songs-close').click();

  await page.locator('#bpm').fill('144');
  await page.waitForFunction(
    () => {
      const body = localStorage.getItem('chiptune-autosave') ?? '';
      return body.includes('"name":"Second"') && body.includes('"bpm":144');
    },
    undefined,
    { timeout: 5000 },
  );
  await page.reload();
  await expect(page.locator('#grid')).toBeVisible();
  await page.locator('#songs-open').click();
  await expect(page.locator('#save')).toBeEnabled();
  await expect(name).toHaveValue('Second');
  await expect(page.locator('#bpm-out')).toHaveText('144');
  await expect(page.locator('#songs-dirty')).toHaveText('Not saved');

  await page.locator('#song-list').getByRole('option', { name: 'First', exact: true }).click();
  await page.locator('#song-open').click();
  const ask = page.locator('#ask-save');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Save this song first?');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();

  await expect(name).toHaveValue('Second');
  await expect(page.locator('#bpm-out')).toHaveText('144');
  await expect(page.locator('#song-list').getByRole('option', { name: 'Second', exact: true })).toHaveAttribute(
    'aria-selected',
    'false',
  );
});
