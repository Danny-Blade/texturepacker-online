import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const spriteSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8">
    <rect width="12" height="8" fill="#ff3366"/>
    <rect x="2" y="2" width="8" height="4" fill="#44ccff" fill-opacity="0.7"/>
  </svg>
`;

async function uploadAndWaitForPack(page: Page): Promise<void> {
  await page.goto('/');
  const workerPromise = page.waitForEvent('worker');
  await page.getByTestId('sprite-file-input').setInputFiles({
    name: 'player.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(spriteSvg),
  });

  await expect(page.getByText('1 sprites', { exact: true }).last()).toBeVisible();
  expect((await workerPromise).url()).toBe('http://127.0.0.1:3100/packer.worker.js');
  await expect(page.getByText('packed', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Publish sprite sheet' })).toBeEnabled();
}

async function openPublishDialog(page: Page) {
  await page.getByRole('button', { name: 'Publish sprite sheet' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Publish Sprite Sheet' })).toBeVisible();
  return dialog;
}

function pngDimensions(bytes: Uint8Array): [number, number] {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

test('uploads, packs and downloads a regular PNG atlas', async ({ page }) => {
  await uploadAndWaitForPack(page);
  const dialog = await openPublishDialog(page);

  await expect(dialog.getByRole('button', { name: 'PNG', exact: true })).toBeVisible();
  await expect(dialog.getByText('spritesheet.png', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('spritesheet.png');
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const png = await readFile(downloadPath!);
  expect(pngDimensions(png)).toEqual([16, 8]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('bundles all multi-scale image and metadata files into one ZIP', async ({ page }) => {
  await uploadAndWaitForPack(page);
  const dialog = await openPublishDialog(page);

  await dialog.getByRole('checkbox', { name: '@0.5x' }).check();
  await dialog.getByRole('checkbox', { name: '@2x' }).check();
  await dialog.getByRole('checkbox', { name: 'Bundle all files into a .zip' }).check();
  await expect(dialog.getByText('1 sheets × 3 scales = 6 files', { exact: true })).toBeVisible();

  const expectedFiles = [
    'spritesheet@0.5x.json',
    'spritesheet@0.5x.png',
    'spritesheet.json',
    'spritesheet.png',
    'spritesheet@2x.json',
    'spritesheet@2x.png',
  ].sort();
  for (const name of expectedFiles) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('spritesheet.zip');

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  expect(Object.keys(zip.files).sort()).toEqual(expectedFiles);

  const sizes: Record<string, [number, number]> = {};
  for (const name of expectedFiles.filter((entry) => entry.endsWith('.png'))) {
    const bytes = await zip.file(name)!.async('uint8array');
    sizes[name] = pngDimensions(bytes);
  }
  expect(sizes).toEqual({
    'spritesheet@0.5x.png': [8, 4],
    'spritesheet.png': [16, 8],
    'spritesheet@2x.png': [32, 16],
  });
});
