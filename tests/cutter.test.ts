import { describe, expect, it } from 'vitest';
import {
  cutGrid,
  cutTransparentStrips,
  parseAtlasData,
  type CutFrame,
} from '../src/lib/cutter';

const zeroMargins = { marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 };

describe('cutGrid', () => {
  it('emits 16 named frames for a 64x64 image sliced into 16x16 cells', () => {
    const frames = cutGrid(64, 64, {
      cellWidth: 16,
      cellHeight: 16,
      ...zeroMargins,
      namePrefix: 'sprite_',
      startIndex: 0,
      padDigits: 2,
    });
    expect(frames).toHaveLength(16);
    expect(frames[0]).toEqual({ name: 'sprite_00', x: 0, y: 0, w: 16, h: 16 });
    expect(frames[15]).toEqual({ name: 'sprite_15', x: 48, y: 48, w: 16, h: 16 });
    // Frames are laid out row-major.
    expect(frames[3]).toMatchObject({ x: 48, y: 0 });
    expect(frames[4]).toMatchObject({ x: 0, y: 16 });
  });

  it('accounts for margins and spacing when placing cells', () => {
    // Layout: 2 margin + (16 cell + 4 spacing) * n − 4 (last cell has no
    // trailing spacing) + 2 margin. For a 42-wide sheet with 16 cells and
    // 4 spacing we fit exactly 2 cells: 2 + 16 + 4 + 16 + 2 = 40 ≤ 42.
    const frames = cutGrid(40, 40, {
      cellWidth: 16,
      cellHeight: 16,
      marginX: 2,
      marginY: 2,
      spacingX: 4,
      spacingY: 4,
      namePrefix: 'tile_',
      startIndex: 0,
      padDigits: 0,
    });
    // Expected cells: (2,2), (22,2), (2,22), (22,22).
    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual({ name: 'tile_0', x: 2, y: 2, w: 16, h: 16 });
    expect(frames[1]).toEqual({ name: 'tile_1', x: 22, y: 2, w: 16, h: 16 });
    expect(frames[2]).toEqual({ name: 'tile_2', x: 2, y: 22, w: 16, h: 16 });
    expect(frames[3]).toEqual({ name: 'tile_3', x: 22, y: 22, w: 16, h: 16 });
  });

  it('respects startIndex and padDigits when naming', () => {
    const frames = cutGrid(16, 16, {
      cellWidth: 16,
      cellHeight: 16,
      ...zeroMargins,
      namePrefix: 'run_',
      startIndex: 7,
      padDigits: 4,
    });
    expect(frames).toHaveLength(1);
    expect(frames[0].name).toBe('run_0007');
  });

  it('drops a partial cell that would extend past the image edge', () => {
    // 20 wide with 16 cells and 0 spacing → only 1 cell fits (partial not
    // included).
    const frames = cutGrid(20, 16, {
      cellWidth: 16,
      cellHeight: 16,
      ...zeroMargins,
      namePrefix: 's_',
      startIndex: 0,
      padDigits: 0,
    });
    expect(frames).toHaveLength(1);
  });
});

describe('cutTransparentStrips', () => {
  function makeImageData(width: number, height: number, fill: (x: number, y: number) => number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = fill(x, y);
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = alpha;
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData;
  }

  it('finds two opaque islands separated by a transparent gap', () => {
    // 12x4 image: left half [0..4]x[0..4] opaque, gap column 5, right half [6..11]x[0..4] opaque.
    const img = makeImageData(12, 4, (x) => (x <= 4 || x >= 6 ? 255 : 0));
    const frames = cutTransparentStrips(img, 0);
    expect(frames).toHaveLength(2);
    // Sorted by minY then minX; both start at y=0, so left island comes first.
    expect(frames[0]).toMatchObject({ x: 0, y: 0, w: 5, h: 4 });
    expect(frames[1]).toMatchObject({ x: 6, y: 0, w: 6, h: 4 });
  });

  it('respects the alpha threshold', () => {
    const img = makeImageData(4, 4, () => 10);
    // Threshold 15 makes every pixel transparent → no islands.
    expect(cutTransparentStrips(img, 15)).toHaveLength(0);
    // Threshold 0 keeps them opaque → one island covering the whole image.
    const frames = cutTransparentStrips(img, 0);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 4 });
  });
});

describe('parseAtlasData', () => {
  it('parses a minimal JSON Hash atlas', () => {
    const json = JSON.stringify({
      meta: { image: 'sheet.png', size: { w: 128, h: 128 } },
      frames: {
        'hero.png': { frame: { x: 0, y: 0, w: 32, h: 32 } },
        'bullet.png': { frame: { x: 32, y: 0, w: 8, h: 8 } },
      },
    });
    const frames = parseAtlasData(json, 128, 128);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(2);
    const byName = new Map<string, CutFrame>();
    for (const f of frames!) byName.set(f.name, f);
    expect(byName.get('hero.png')).toEqual({ name: 'hero.png', x: 0, y: 0, w: 32, h: 32 });
    expect(byName.get('bullet.png')).toEqual({ name: 'bullet.png', x: 32, y: 0, w: 8, h: 8 });
  });

  it('parses a JSON Array atlas', () => {
    const json = JSON.stringify({
      meta: { image: 'sheet.png' },
      frames: [
        { filename: 'a.png', frame: { x: 0, y: 0, w: 4, h: 4 } },
        { filename: 'b.png', frame: { x: 4, y: 0, w: 4, h: 4 } },
      ],
    });
    const frames = parseAtlasData(json, 16, 16);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(2);
    expect(frames![0].name).toBe('a.png');
    expect(frames![1]).toEqual({ name: 'b.png', x: 4, y: 0, w: 4, h: 4 });
  });

  it('parses Starling XML', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<TextureAtlas imagePath="sheet.png" width="64" height="64">\n' +
      '  <SubTexture name="alpha" x="0" y="0" width="16" height="16"/>\n' +
      '  <SubTexture name="beta" x="16" y="0" width="16" height="16"/>\n' +
      '</TextureAtlas>';
    const frames = parseAtlasData(xml, 64, 64);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(2);
    expect(frames![0]).toEqual({ name: 'alpha', x: 0, y: 0, w: 16, h: 16 });
    expect(frames![1]).toEqual({ name: 'beta', x: 16, y: 0, w: 16, h: 16 });
  });

  it('parses a Spine / LibGDX .atlas', () => {
    const atlas =
      'sheet.png\n' +
      'size: 64,64\n' +
      'format: RGBA8888\n' +
      'filter: Linear,Linear\n' +
      'repeat: none\n' +
      '\n' +
      'alpha\n' +
      '  rotate: false\n' +
      '  xy: 0, 0\n' +
      '  size: 16, 16\n' +
      '  orig: 16, 16\n' +
      '  offset: 0, 0\n' +
      '  index: -1\n' +
      '\n' +
      'beta\n' +
      '  rotate: false\n' +
      '  xy: 16, 0\n' +
      '  size: 24, 24\n' +
      '  orig: 24, 24\n' +
      '  offset: 0, 0\n' +
      '  index: -1\n';
    const frames = parseAtlasData(atlas, 64, 64);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(2);
    expect(frames![0]).toEqual({ name: 'alpha', x: 0, y: 0, w: 16, h: 16 });
    expect(frames![1]).toEqual({ name: 'beta', x: 16, y: 0, w: 24, h: 24 });
  });

  it('parses a Cocos2d plist atlas', () => {
    const plist =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0">\n<dict>\n' +
      '  <key>frames</key>\n  <dict>\n' +
      '    <key>alpha</key>\n    <dict>\n' +
      '      <key>frame</key>\n' +
      '      <string>{{0,0},{16,16}}</string>\n' +
      '      <key>rotated</key><false/>\n' +
      '    </dict>\n' +
      '    <key>beta</key>\n    <dict>\n' +
      '      <key>frame</key>\n' +
      '      <string>{{16,0},{16,16}}</string>\n' +
      '      <key>rotated</key><false/>\n' +
      '    </dict>\n' +
      '  </dict>\n' +
      '  <key>metadata</key>\n  <dict>\n' +
      '    <key>size</key><string>{64,64}</string>\n' +
      '  </dict>\n' +
      '</dict>\n</plist>';
    const frames = parseAtlasData(plist, 64, 64);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(2);
    expect(frames![0]).toEqual({ name: 'alpha', x: 0, y: 0, w: 16, h: 16 });
    expect(frames![1]).toEqual({ name: 'beta', x: 16, y: 0, w: 16, h: 16 });
  });

  it('returns null for content that is not any known atlas format', () => {
    expect(parseAtlasData('<html><body>hello</body></html>', 64, 64)).toBeNull();
    expect(parseAtlasData('', 64, 64)).toBeNull();
  });

  it('drops frames that would fall outside the source image', () => {
    const json = JSON.stringify({
      frames: {
        'ok.png': { frame: { x: 0, y: 0, w: 8, h: 8 } },
        'out.png': { frame: { x: 100, y: 100, w: 8, h: 8 } },
      },
    });
    const frames = parseAtlasData(json, 16, 16);
    expect(frames).not.toBeNull();
    expect(frames!).toHaveLength(1);
    expect(frames![0].name).toBe('ok.png');
  });
});
