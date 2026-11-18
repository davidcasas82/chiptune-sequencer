import { expect, test, type Page } from '@playwright/test';

async function songSnapshot(page: Page): Promise<string> {
  let last = '';
  await expect.poll(async () => {
    const now = await page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '');
    const stable = now.includes('"name":"Keep this"') && now === last;
    last = now;
    return stable;
  }).toBe(true);
  return last;
}

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
  await expect(glossary.getByRole('button', { name: 'Start the tutorial' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Start the tutorial' })).toBeVisible();
});

test('the glossary tutorial replays the four cards and leaves the song alone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chiptune-guide', '1');
    localStorage.setItem('chiptune-projects', '[{"id":"kept","name":"Kept","body":"{}"}]');
  });
  await page.goto('/');
  await expect(page.locator('#grid')).toBeVisible();
  await expect(page.locator('#guide')).toBeHidden();

  await page.locator('#name').fill('Keep this');
  await page.locator('#name').blur();
  await page.locator('#bpm').evaluate((input: HTMLInputElement) => {
    input.value = '90';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#clear-pattern').click();
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await expect(page.locator('#bpm-out')).toHaveText('90');
  const before = await songSnapshot(page);

  await page.locator('#glossary-open').click();
  const glossary = page.locator('#glossary');
  await expect(glossary).toBeVisible();
  await glossary.getByRole('button', { name: 'Start the tutorial' }).click();
  const guide = page.locator('#guide');
  await expect(glossary).toBeHidden();
  await expect(guide).toBeVisible();
  await expect(page.locator('#guide-step')).toHaveText('1 of 4');
  await expect(page.locator('#guide-title')).toHaveText('Hear the beat');
  await expect(page.locator('#guide-body')).toHaveText(
    'The green notes are the beat already in this song. Press Play to hear it, then press Play again to stop. BPM is the speed. Low is slow, and high is fast.',
  );
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await expect(page.locator('#bpm-out')).toHaveText('90');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')).toBe(before);

  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Write a note');
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Change the sound');
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toHaveText('Save it');
  await expect(page.locator('#guide-next')).toHaveText('Done');
  await page.locator('#guide-next').click();
  await expect(guide).toBeHidden();
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await expect(page.locator('#bpm-out')).toHaveText('90');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')).toBe(before);

  await page.reload();
  await expect(page.locator('#guide')).toBeHidden();
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await page.locator('#glossary-open').click();
  await glossary.getByRole('button', { name: 'Start the tutorial' }).click();
  await expect(page.locator('#guide-title')).toHaveText('Hear the beat');
  await expect(page.locator('#guide-step')).toHaveText('1 of 4');
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await expect(page.locator('#bpm-out')).toHaveText('90');
});

test('skipping the guide still leaves the tutorial replay', async ({ page }) => {
  await page.goto('/');
  await page.locator('#guide-skip').click();
  await expect(page.locator('#guide')).toBeHidden();
  await page.locator('#name').fill('Keep this');
  await page.locator('#name').blur();
  const before = await songSnapshot(page);
  await page.locator('#glossary-open').click();
  await page.getByRole('button', { name: 'Start the tutorial' }).click();
  await expect(page.locator('#guide-title')).toHaveText('Hear the beat');
  await expect(page.locator('#guide-body')).toContainText('the beat already in this song');
  await expect(page.locator('#guide-body')).not.toContainText('starter beat');
  await expect(page.locator('#name')).toHaveValue('Keep this');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')).toBe(before);
});

test('the glossary scroll shows its last line', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/');
  if (await page.locator('#guide').isVisible()) await page.locator('#guide-skip').click();
  await page.locator('#glossary-open').click();
  const glossary = page.locator('#glossary');
  await expect(glossary).toBeVisible();
  const fit = await page.locator('#glossary-list').evaluate((list) => {
    const edge = list.getBoundingClientRect().bottom;
    const cut: string[] = [];
    for (const node of list.querySelectorAll('h3, p, dt, dd')) {
      const box = node.getBoundingClientRect();
      if (box.top < edge - 0.5 && box.bottom > edge + 0.5) cut.push(node.textContent ?? '');
    }
    list.scrollTop = list.scrollHeight;
    const rows = list.querySelectorAll('dd');
    const last = rows[rows.length - 1];
    const range = document.createRange();
    range.selectNodeContents(last);
    const text = range.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    return {
      cut,
      last: last.textContent,
      gap: view.bottom - text.bottom,
    };
  });
  expect(fit.cut).toEqual([]);
  expect(fit.last).toBe('Hear only Extra Drums.');
  expect(fit.gap).toBeGreaterThan(8);
});
