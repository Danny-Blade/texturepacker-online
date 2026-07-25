import { describe, expect, it } from 'vitest';
import {
  packIntoSheets,
  type ImageItem,
  type PackerOptions,
} from '../src/lib/packer';
import { detectNormalPairs } from '../src/lib/normalMapPairing';

function fakeImage(id: string, name: string, w: number, h: number): ImageItem {
  return {
    id,
    name,
    width: w,
    height: h,
    image: {
      src: `test:${id}`,
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
    } as unknown as HTMLImageElement,
    url: `test:${id}`,
  };
}

function baseOptions(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    maxWidth: 64,
    maxHeight: 64,
    borderPadding: 0,
    shapePadding: 0,
    innerPadding: 0,
    allowRotation: false,
    powerOfTwo: false,
    forceSquare: false,
    algorithm: 'maxrects-bssf',
    trimAlpha: false,
    trimThreshold: 1,
    trimMode: 'none',
    polygonTolerance: 2,
    extrude: 0,
    multipack: false,
    ...overrides,
  };
}

describe('detectNormalPairs', () => {
  it('pairs hero+hero_n and foe+foe_normal with 0 unpaired', () => {
    const hero = fakeImage('hero-id', 'hero', 8, 8);
    const heroN = fakeImage('hero-n-id', 'hero_n', 8, 8);
    const foe = fakeImage('foe-id', 'foe', 8, 8);
    const foeNormal = fakeImage('foe-normal-id', 'foe_normal', 8, 8);

    const result = detectNormalPairs(
      [hero, heroN, foe, foeNormal],
      ['_n', '_nrm', '_normal'],
    );

    expect(result.pairs).toHaveLength(2);
    expect(result.unpaired).toHaveLength(2);
    const pairIds = result.pairs.map((p) => [p.colorId, p.normalId]).sort();
    expect(pairIds).toEqual([
      ['foe-id', 'foe-normal-id'],
      ['hero-id', 'hero-n-id'],
    ]);
    expect(result.unpaired.map((i) => i.id).sort()).toEqual(['foe-id', 'hero-id']);
  });

  it('respects the current folder when matching stems', () => {
    // walk/0001 must pair with walk/0001_n even though run/0001_n exists.
    const walk = fakeImage('walk', 'hero/walk/0001', 8, 8);
    const walkN = fakeImage('walk-n', 'hero/walk/0001_n', 8, 8);
    const runN = fakeImage('run-n', 'hero/run/0001_n', 8, 8);
    const result = detectNormalPairs([walk, walkN, runN], ['_n']);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].colorId).toBe('walk');
    expect(result.pairs[0].normalId).toBe('walk-n');
    // run/0001_n has no colour match in the same folder → stays unpaired.
    expect(result.unpaired.map((i) => i.id).sort()).toEqual(['run-n', 'walk']);
  });

  it('is case-insensitive on the suffix', () => {
    const hero = fakeImage('hero', 'HERO', 8, 8);
    const heroN = fakeImage('hero-n', 'HERO_N', 8, 8);
    const result = detectNormalPairs([hero, heroN], ['_n']);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].normalId).toBe('hero-n');
  });

  it('returns everything as unpaired when suffix list is empty', () => {
    const items = [
      fakeImage('a', 'hero', 8, 8),
      fakeImage('b', 'hero_n', 8, 8),
    ];
    expect(detectNormalPairs(items, [])).toEqual({ pairs: [], unpaired: items });
  });
});

describe('normal-map pairing inside packIntoSheets', () => {
  it('drops paired normals from the pack and attaches them to their colour sprite', () => {
    const hero = fakeImage('hero-id', 'hero', 8, 8);
    const heroN = fakeImage('hero-n-id', 'hero_n', 8, 8);
    const foe = fakeImage('foe-id', 'foe', 8, 8);
    const foeNormal = fakeImage('foe-normal-id', 'foe_normal', 8, 8);

    const result = packIntoSheets(
      [hero, heroN, foe, foeNormal],
      baseOptions({ normalMapPairing: true }),
    );

    expect(result.sheets).toHaveLength(1);
    const sheet = result.sheets[0];
    expect(sheet.packed).toHaveLength(2);
    const ids = sheet.packed.map((p) => p.id).sort();
    expect(ids).toEqual(['foe-id', 'hero-id']);

    for (const packed of sheet.packed) {
      const pairImage = packed.id === 'hero-id' ? heroN.image : foeNormal.image;
      expect(packed.normalMapImage).toBe(pairImage);
      expect(packed.normalMapFrame).toBeDefined();
      const nf = packed.normalMapFrame!;
      expect(nf).toEqual({ x: packed.x, y: packed.y, w: packed.width, h: packed.height });
    }
  });

  it('leaves the sprite list untouched when normalMapPairing is off', () => {
    const hero = fakeImage('hero-id', 'hero', 8, 8);
    const heroN = fakeImage('hero-n-id', 'hero_n', 8, 8);
    const result = packIntoSheets([hero, heroN], baseOptions({ normalMapPairing: false }));
    expect(result.packed).toHaveLength(2);
    for (const p of result.packed) {
      expect(p.normalMapImage).toBeUndefined();
      expect(p.normalMapFrame).toBeUndefined();
    }
  });
});
