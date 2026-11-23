import { expect, test, type Page } from '@playwright/test';
import { dismissGuide } from './guide';

async function playingView(page: Page): Promise<string> {
  const play = await page.locator('#lane button').evaluateAll((nodes) =>
    nodes.findIndex((node) => node.getAttribute('data-play') === '1'),
  );
  const pat = await page.locator('#pat').innerText();
  return `${play}:${pat}`;
}

test('song playback follows the sounding section and its step', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.locator('#grid')).toBeVisible();

  const follow = page.locator('#follow');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#mode-song').click();
  await expect(page.locator('#mode-song')).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');

  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#mode-pat').click();
  await page.locator('#mode-song').click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#bpm').fill('300');
  await expect(page.locator('#bpm-out')).toHaveText('300');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')).toContain('"bpm":300');
  const before = JSON.parse(await page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')) as {
    song: { patterns: unknown; orderPat: unknown; orderLen: unknown; current: unknown; entry: unknown; playSong: unknown };
  };

  await page.locator('#play').click();
  await expect(page.locator('#pat')).toHaveText('02');
  const head = page.locator('#head');
  const firstHead = await head.textContent();
  await expect.poll(async () => head.textContent()).not.toBe(firstHead);

  const during = JSON.parse(await page.evaluate(() => localStorage.getItem('chiptune-autosave') ?? '')) as typeof before;
  expect(during.song.patterns).toEqual(before.song.patterns);
  expect(during.song.orderPat).toEqual(before.song.orderPat);
  expect(during.song.orderLen).toBe(before.song.orderLen);
  expect(during.song.current).toBe(before.song.current);
  expect(during.song.entry).toBe(before.song.entry);
  expect(during.song.playSong).toBe(before.song.playSong);

  await page.locator('#play').click();
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#pats button').first().click();
  await expect(page.locator('#pat')).toHaveText('01');
  await page.locator('#play').click();
  await expect.poll(async () => playingView(page), { timeout: 8000 }).toBe('1:01');

  await follow.click();
  await expect.poll(async () => playingView(page), { timeout: 8000 }).toBe('1:02');
});
