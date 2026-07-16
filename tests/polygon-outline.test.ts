import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from '../src/lib/i18n';
import type { TrimMode } from '../src/lib/packer';
import { useTpStore } from '../src/lib/store';
import { parseTpsPlist } from '../src/lib/tpsCompat';

function element(tagName: string, textContent = '', children: Element[] = []): Element {
  return { tagName, textContent, children } as unknown as Element;
}

function installTpsDom(): void {
  const settings = element('dict', '', [
    element('key', 'algorithm'),
    element('enum', 'Polygon'),
    element('key', 'trimMode'),
    element('enum', 'Polygon'),
  ]);
  const root = element('dict', '', [element('key', 'settings'), settings]);
  const plist = element('plist', '', [root]);
  const document = {
    getElementsByTagName: (name: string) => {
      if (name === 'plist') return [plist];
      return [];
    },
  } as unknown as Document;

  vi.stubGlobal(
    'DOMParser',
    class {
      parseFromString(): Document {
        return document;
      }
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  useTpStore.getState().setSettings({ trimMode: 'rect', trimAlpha: true });
});

describe('Polygon Outline semantics', () => {
  it('uses explicit outline wording in both user interfaces', () => {
    const en = getTranslations('en').inspector;
    const zh = getTranslations('zh').inspector;

    expect([en.trimPolygon, en.polygonTolerance]).toEqual([
      'Polygon Outline',
      'Outline tolerance',
    ]);
    expect([zh.trimPolygon, zh.polygonTolerance]).toEqual(['多边形轮廓', '轮廓容差']);
  });

  it('normalizes the legacy polygon setting to the only outline processing mode', () => {
    useTpStore.getState().setSettings({ trimMode: 'polygon' as TrimMode });

    expect(useTpStore.getState().settings.trimMode).toBe('polygon-outline');
  });

  it('downgrades desktop polygon packing and trim with explicit rectangular warnings', () => {
    installTpsDom();
    const imported = parseTpsPlist('<plist/>');

    expect(imported.settings).toMatchObject({
      algorithm: 'maxrects-bssf',
      trimMode: 'polygon-outline',
      trimAlpha: true,
    });
    expect(imported.warnings).toContain(
      'Polygon packing is not supported — falling back to MaxRects BSSF.',
    );
    expect(imported.warnings).toContain(
      'Polygon trim imported as polygon outline metadata; packing remains rectangular.',
    );
  });
});
