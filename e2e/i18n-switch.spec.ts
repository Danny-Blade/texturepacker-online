import { expect, test } from '@playwright/test';

/**
 * The English and Chinese pages mount the same `AppShell` with different
 * `locale` props (see `src/app/page.tsx` vs `src/app/zh/page.tsx`). There's
 * no in-app language switcher — locale is driven purely by URL — so we just
 * assert the panel label swaps for the corresponding route.
 */

test('SpritesPanel header uses the English label on /', async ({ page }) => {
  await page.goto('/');
  // t.panels.sprites = 'Sprites'. Rendered uppercased via CSS
  // (`tracking-wider`), so the DOM text is still the raw source string.
  await expect(page.getByText('Sprites', { exact: true }).first()).toBeVisible();
});

test('SpritesPanel header uses the Chinese label on /zh', async ({ page }) => {
  await page.goto('/zh');
  // t.panels.sprites = '图块' — 2 CJK chars, exact match keeps us from
  // hitting any English fallback that might slip into the page.
  await expect(page.getByText('图块', { exact: true }).first()).toBeVisible();
});
