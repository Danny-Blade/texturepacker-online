import { expect, test } from '@playwright/test';

test('pressing ? opens and Escape closes the ShortcutsDialog', async ({ page }) => {
  await page.goto('/');

  // Focus the body so the AppShell keydown handler runs (the handler
  // ignores events targeting INPUT/TEXTAREA/contenteditable — see
  // `src/components/AppShell.tsx`).
  await page.locator('body').click();

  // ShortcutsDialog renders an <h2> with the title text but does not set
  // role="dialog" on its outer container. We identify the dialog by the
  // heading it exposes to assistive tech.
  const shortcutsHeading = page.getByRole('heading', {
    name: 'Keyboard Shortcuts',
    exact: true,
  });
  await expect(shortcutsHeading).toHaveCount(0);

  // `?` requires Shift on US keyboards; Playwright's key syntax handles
  // this via a modifier + physical key.
  await page.keyboard.press('Shift+/');

  await expect(shortcutsHeading).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(shortcutsHeading).toHaveCount(0);
});
