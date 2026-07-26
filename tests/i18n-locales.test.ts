import { describe, expect, it } from 'vitest';
import {
  defaultLocale,
  getLocaleFromPath,
  getTranslations,
  locales,
  type Locale,
} from '../src/lib/i18n';

// Recursively collects every leaf path in a translation tree ("nav.title",
// "features.feature1.desc", etc.). A missing key in a non-en locale would
// leave its path absent from that locale's list; an extra key would appear
// on one side but not the other. Comparing the sorted path lists therefore
// tells us exactly which key drifted.
function collectPaths(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return [prefix];
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    out.push(...collectPaths(value, next));
  }
  return out.sort();
}

// Match `{name}` style placeholders — Object.values on a translations tree
// gives us all the leaf strings interpolated by the UI. If en uses `{n}`
// but ja drops it, translations silently render literal braces.
function extractPlaceholders(text: string): string[] {
  return (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
}

function flatEntries(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  if (node === null || typeof node !== 'object') return [];
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    out.push(...flatEntries(value, next));
  }
  return out;
}

describe('i18n locales', () => {
  it('exposes the expected set of locales', () => {
    expect([...locales]).toEqual(['en', 'zh', 'ja', 'ko', 'es']);
    expect(defaultLocale).toBe('en');
  });

  const enPaths = collectPaths(getTranslations('en'));

  for (const locale of locales) {
    it(`${locale} has the same translation keys as en`, () => {
      const localePaths = collectPaths(getTranslations(locale));
      // Descriptive diffs so a missing key names the exact path.
      const missing = enPaths.filter((p) => !localePaths.includes(p));
      const extra = localePaths.filter((p) => !enPaths.includes(p));
      expect(missing, `${locale} is missing keys: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `${locale} has extra keys not in en: ${extra.join(', ')}`).toEqual([]);
    });
  }

  const enEntries = flatEntries(getTranslations('en'));

  for (const locale of locales) {
    if (locale === 'en') continue;
    it(`${locale} preserves every {placeholder} present in en`, () => {
      const map = new Map(flatEntries(getTranslations(locale)));
      for (const [path, enText] of enEntries) {
        const enPlaceholders = extractPlaceholders(enText);
        if (enPlaceholders.length === 0) continue;
        const localeText = map.get(path);
        expect(localeText, `${locale} missing string for ${path}`).toBeTypeOf('string');
        const localePlaceholders = extractPlaceholders(localeText ?? '');
        expect(
          localePlaceholders,
          `${locale} → ${path}: expected placeholders ${enPlaceholders.join(', ')}, got ${localePlaceholders.join(', ') || '(none)'}`,
        ).toEqual(enPlaceholders);
      }
    });
  }
});

describe('getLocaleFromPath', () => {
  it.each<[string, Locale]>([
    ['/', 'en'],
    ['', 'en'],
    ['/zh', 'zh'],
    ['/zh/', 'zh'],
    ['/ja', 'ja'],
    ['/ja/sub', 'ja'],
    ['/ko', 'ko'],
    ['/es', 'es'],
    ['/unknown', 'en'],
    ['/fr', 'en'],
  ])('%s resolves to %s', (path, expected) => {
    expect(getLocaleFromPath(path)).toBe(expected);
  });
});
