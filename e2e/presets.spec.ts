import { expect, test } from '@playwright/test';
import { dismissGuide } from './guide';

test('a preset highlight stays on its track and opens the arpeggio box', async ({ page }) => {
  await page.goto('/');
  await dismissGuide(page);
  const presets = page.locator('#presets');
  const arp = presets.getByRole('button', { name: 'Arp', exact: true });
  const lead = presets.getByRole('button', { name: 'Lead', exact: true });

  await expect(page.locator('#presets-label')).toHaveText('Presets');
  await expect(page.locator('#arp-more')).toBeHidden();
  await arp.click();
  await expect(arp).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#arp-more')).toBeVisible();
  await expect(page.locator('#arp-graph')).toBeVisible();
  await expect(page.locator('#duty-row').getByRole('button', { name: '12.5' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-tip="arp-speed"]')).toHaveText('Speed');
  await expect(page.locator('[data-tip="arp-direction"]')).toHaveText('Direction');
  await expect(page.locator('#arp-row').getByRole('button', { name: 'Up', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const attack = await page.locator('#knob-attack').boundingBox();
  expect(attack).toBeTruthy();
  if (attack) {
    await page.mouse.move(attack.x + attack.width / 2, attack.y + attack.height / 2);
    await page.mouse.down();
    await page.mouse.move(attack.x + attack.width / 2, attack.y - 36);
    await page.mouse.up();
  }
  await expect(arp).toHaveAttribute('aria-pressed', 'false');

  await lead.click();
  await expect(lead).toHaveAttribute('aria-pressed', 'true');
  await expect(arp).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#arp-more')).toBeHidden();
  await page.locator('#channels').getByRole('button', { name: 'TRI' }).click();
  await expect(lead).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#channels').getByRole('button', { name: 'P1' }).click();
  await expect(lead).toHaveAttribute('aria-pressed', 'true');
});
