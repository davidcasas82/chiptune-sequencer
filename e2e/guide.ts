import { expect, type Page } from '@playwright/test';

export async function dismissGuide(page: Page): Promise<void> {
  const guide = page.locator('#guide');
  if (await guide.isVisible()) {
    await page.locator('#guide-skip').click();
    await expect(guide).toBeHidden();
  }
}
