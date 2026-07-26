import { deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

/**
 * Playwright helpers shared across the e2e specs. Keep everything here
 * pure and framework-agnostic (except for the small Page-driven wrappers)
 * so that specs stay focused on the behaviour they exercise.
 */

// -- PNG synthesis -----------------------------------------------------------

// Precomputed CRC-32 table (IEEE polynomial 0xEDB88320). PNG chunks require a
// CRC over `type + data`, so we ship one instead of pulling in an npm dep.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

/** RGBA color tuple; each channel 0..255. */
export type Rgba = readonly [number, number, number, number];

/**
 * Build a minimal RGBA PNG whose pixels come from `pick(x, y)`. Uses filter
 * mode 0 (None) on every scanline — enough for the tiny test images we feed
 * to the app, and easy to verify by hand.
 */
export function makePng(
  width: number,
  height: number,
  pick: (x: number, y: number) => Rgba,
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw.writeUInt8(0, rowStart); // filter byte: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pick(x, y);
      const offset = rowStart + 1 + x * 4;
      raw.writeUInt8(r, offset);
      raw.writeUInt8(g, offset + 1);
      raw.writeUInt8(b, offset + 2);
      raw.writeUInt8(a, offset + 3);
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Convenience wrapper for a solid-color PNG. */
export function solidPng(
  width: number,
  height: number,
  color: Rgba = [64, 128, 255, 255],
): Buffer {
  return makePng(width, height, () => color);
}

// -- Sprite upload -----------------------------------------------------------

export interface UploadedSprite {
  name: string;
  mimeType: 'image/png';
  buffer: Buffer;
}

/**
 * Fabricate `count` distinct-coloured PNGs and hand them to the hidden
 * sprite file input the app renders in `AppShell` (`data-testid="sprite-file-input"`).
 * Callers still control when they navigate — call `page.goto('/')` first.
 */
export async function uploadSprites(
  page: Page,
  count: number,
  size = 32,
): Promise<UploadedSprite[]> {
  const files: UploadedSprite[] = [];
  for (let i = 0; i < count; i++) {
    // Space out the hue across the palette so each sprite is visually
    // distinct — makes debugging failed runs easier.
    const hue = Math.round((i / Math.max(1, count)) * 200);
    files.push({
      name: `sprite-${String(i + 1).padStart(2, '0')}.png`,
      mimeType: 'image/png',
      buffer: solidPng(size, size, [hue, (hue + 80) % 255, (hue + 160) % 255, 255]),
    });
  }
  await page.getByTestId('sprite-file-input').setInputFiles(files);
  return files;
}

// -- MenuBar interaction -----------------------------------------------------

/**
 * Open a top-level MenuBar entry (File, Edit, View, Effects, Help) by its
 * visible label. The buttons render as plain `<button>` elements so
 * `getByRole` finds them; we simply click to toggle open.
 */
export async function openMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

/**
 * Open `menuName`, then click the item labeled `itemName`. Menu items pair
 * their label with a shortcut hint (e.g. "Cut Sprite Sheet… Ctrl+Shift+X"),
 * so we anchor on the label prefix with a regex rather than an exact-name
 * accessible-name match.
 */
export async function selectMenuItem(
  page: Page,
  menuName: string,
  itemName: string,
): Promise<void> {
  await openMenu(page, menuName);
  const namePattern = new RegExp(`^${escapeRegExp(itemName)}(\\s|$)`);
  await page.getByRole('button', { name: namePattern }).click();
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -- Notifications -----------------------------------------------------------

/**
 * Wait for the transient status-bar notification to contain the given text
 * (or match the given pattern). Notifications auto-dismiss, so we don't
 * assert absence afterwards — call sites should decide what happens next.
 */
export async function waitForNotification(
  page: Page,
  textOrPattern: string | RegExp,
): Promise<void> {
  await expect(page.getByText(textOrPattern).first()).toBeVisible();
}
