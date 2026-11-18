import { expect, test } from '@playwright/test';

test('keeps the current song selected when a switch is canceled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#grid')).toBeVisible();

  const name = page.locator('#name');
  const projects = page.locator('#projects');
  const selected = projects.locator('option:checked');

  await name.fill('First');
  await page.locator('#save').click();
  await expect(selected).toHaveText('First');

  await page.locator('#new-song').click();
  await expect(name).toHaveValue('Song');
  await name.fill('Second');
  await page.locator('#save').click();
  await expect(selected).toHaveText('Second');

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
  await expect(name).toHaveValue('Second');
  await expect(selected).toHaveText('Second');
  await expect(page.locator('#bpm-out')).toHaveText('144');

  await page.locator('#bpm').fill('160');
  await expect(page.locator('#bpm-out')).toHaveText('160');
  await projects.selectOption({ label: 'First' });
  const ask = page.locator('#ask-save');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Save this song first?');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();

  await expect(selected).toHaveText('Second');
  await expect(name).toHaveValue('Second');
  await expect(page.locator('#bpm-out')).toHaveText('160');
});
