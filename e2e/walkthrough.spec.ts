import { expect, test } from '@playwright/test';

test('the first-run guide can be skipped and the glossary stays available', async ({ page }) => {
  await page.goto('/');
  const guide = page.locator('#guide');
  await expect(guide).toBeVisible();
  await expect(page.locator('#guide-step')).toHaveText('1 of 4');
  await expect(page.locator('#guide-title')).toHaveText('Hear the beat');
  await expect(guide).toContainText('starter beat');
  await page.locator('#play').click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Write a note');
  await expect(page.locator('#guide-step')).toHaveText('2 of 4');
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Change the sound');
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Save it');
  await expect(page.locator('#guide-next')).toHaveText('Done');
  await page.locator('#guide-back').click();
  await expect(page.locator('#guide-title')).toHaveText('Change the sound');
  await page.locator('#guide-skip').click();
  await expect(guide).toBeHidden();

  await page.locator('#glossary-open').click();
  const glossary = page.locator('#glossary');
  await expect(glossary).toBeVisible();
  await expect(glossary).toContainText('Start the song, or stop it.');
  await expect(glossary).toContainText('How fast the song goes. Low is slow, high is fast.');
  await glossary.getByRole('button', { name: 'Close' }).click();
  await expect(glossary).toBeHidden();

  await page.reload();
  await expect(page.locator('#grid')).toBeVisible();
  await expect(guide).toBeHidden();
});

test('a saved song skips the first-run guide', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chiptune-autosave', '{"v":1}');
  });
  await page.goto('/');
  await expect(page.locator('#grid')).toBeVisible();
  await expect(page.locator('#guide')).toBeHidden();
  await page.locator('#glossary-open').click();
  await expect(page.locator('#glossary')).toBeVisible();
});
