import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { selectMenuItem, uploadSprites } from './helpers';

test('batch convert renders 3 images at 2 scales into 6 output files', async ({ page }) => {
  await page.goto('/');

  // Upload three synthetic PNGs. Wait for the sprite count to update in the
  // status bar before opening the batch dialog — otherwise the dialog opens
  // against an empty workspace and short-circuits with the "no images" toast.
  await uploadSprites(page, 3, 32);
  await expect(page.getByText('3 sprites', { exact: true }).last()).toBeVisible();

  await selectMenuItem(page, 'File', 'Batch Convert…');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Batch', selected: true })).toBeVisible();

  // PNG is already the default — click it explicitly so a future default
  // change doesn't silently pass this test.
  await dialog.getByRole('button', { name: 'PNG', exact: true }).click();

  // Scales: @1x is default, add @2x. The @0.5x checkbox stays off.
  await dialog.getByRole('checkbox', { name: '@2x' }).check();
  await expect(dialog.getByText('3 images × 2 scales = 6 files', { exact: true })).toBeVisible();

  // Bundle into a single .zip so we get one deterministic download rather
  // than six anchor-tag clicks racing the browser's download UI.
  await dialog.getByRole('checkbox', { name: 'Bundle all files into a .zip' }).check();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Convert', exact: true }).click();

  // Dialog closes on success and the status bar toasts a summary
  // (t.publish.batchDone = "Converted {n} images").
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/Converted 6 image/)).toBeVisible();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('batch.zip');

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  // 3 inputs × 2 scales = 6 files. Names are deterministic through the
  // {name}{suffix}{n}.{ext} template so we just count entries.
  expect(Object.keys(zip.files)).toHaveLength(6);
});
