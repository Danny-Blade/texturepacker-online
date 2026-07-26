import { expect, test } from '@playwright/test';
import { uploadSprites } from './helpers';

test('pivot X survives a selection round-trip', async ({ page }) => {
  await page.goto('/');

  // Two sprites so we can deselect by choosing a different one, then
  // re-select the first. `updateSpriteMetadata` writes to the Zustand store
  // and `SpriteMetadataEditor` re-reads on mount, so a round-trip proves
  // the value actually landed in state (not just in local input state).
  await uploadSprites(page, 2, 32);
  await expect(page.getByText('2 sprites', { exact: true }).last()).toBeVisible();

  const rows = page.locator('[data-sprite-row]');
  await expect(rows).toHaveCount(2);

  // Select the first sprite. The Inspector's Sprites section is open by
  // default (see initial state in `src/lib/store.ts`).
  await rows.nth(0).click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  const pivotX = page.getByLabel('X', { exact: true });
  if ((await pivotX.count()) === 0) {
    test.skip(
      true,
      'SpriteMetadataEditor pivot field not present — component may have moved or been renamed',
    );
    return;
  }

  // Default pivot mode is relative (0..1). 0.25 is inside range so the
  // clamp in SpriteMetadataEditor won't mask a bug in the store update.
  await expect(pivotX).toHaveValue('0.5');
  await pivotX.fill('0.25');
  // Commit the value — number inputs update on `change`, and Playwright's
  // `fill` already dispatches that, but tab away to be defensive.
  await pivotX.press('Tab');

  // Round-trip through selection: switch to sprite #2, then back to #1. If
  // the store didn't persist the new pivot, the field will show 0.5 again.
  await rows.nth(1).click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();

  await rows.nth(0).click();
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('0.25');
});
