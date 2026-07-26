import { expect, test } from '@playwright/test';
import { makePng, selectMenuItem, solidPng } from './helpers';

test.describe('Sprite sheet cutter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('grid mode splits a 128×128 image into 16 sprites', async ({ page }) => {
    await selectMenuItem(page, 'File', 'Cut Sprite Sheet…');

    const dialog = page.getByRole('dialog', { name: 'Sprite Sheet Cutter' });
    await expect(dialog).toBeVisible();

    // Feed the atlas — a solid-colour 128×128 image is enough because grid
    // mode ignores pixel content and just measures the canvas.
    await page.getByTestId('cutter-image-input').setInputFiles({
      name: 'atlas.png',
      mimeType: 'image/png',
      buffer: solidPng(128, 128, [200, 40, 40, 255]),
    });

    // Defaults are already 32×32; assert once to catch any future regression.
    await expect(dialog.getByLabel('Cell width')).toHaveValue('32');
    await expect(dialog.getByLabel('Cell height')).toHaveValue('32');

    // 128 / 32 = 4 columns × 4 rows = 16 frames.
    await expect(dialog.getByText('16 frames detected')).toBeVisible();

    const addButton = dialog.getByRole('button', { name: 'Add 16 sprites' });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    await expect(dialog).toBeHidden();

    // The SpritesPanel footer and the StatusBar both surface the sprite
    // count. `.last()` targets the StatusBar entry, mirroring publish.spec.
    await expect(page.getByText('16 sprites', { exact: true }).last()).toBeVisible();
  });

  test('transparent-strips mode detects two opaque islands', async ({ page }) => {
    await selectMenuItem(page, 'File', 'Cut Sprite Sheet…');

    const dialog = page.getByRole('dialog', { name: 'Sprite Sheet Cutter' });
    await expect(dialog).toBeVisible();

    // Two 16×16 opaque squares separated by a fully-transparent gutter.
    // Everything outside the two islands is alpha=0, so the strip detector
    // must find exactly 2 frames.
    const width = 48;
    const height = 16;
    const inFirstIsland = (x: number, y: number): boolean =>
      x >= 0 && x < 16 && y >= 0 && y < 16;
    const inSecondIsland = (x: number, y: number): boolean =>
      x >= 32 && x < 48 && y >= 0 && y < 16;
    const buffer = makePng(width, height, (x, y) => {
      if (inFirstIsland(x, y)) return [255, 0, 0, 255];
      if (inSecondIsland(x, y)) return [0, 255, 0, 255];
      return [0, 0, 0, 0];
    });

    await page.getByTestId('cutter-image-input').setInputFiles({
      name: 'islands.png',
      mimeType: 'image/png',
      buffer,
    });

    // Switch to strips mode. The button label comes from t.cutter.modeStrips
    // ("Transparent strips" in English).
    await dialog.getByRole('button', { name: 'Transparent strips', exact: true }).click();

    await expect(dialog.getByText('2 frames detected')).toBeVisible();
  });
});
