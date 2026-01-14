'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function Header({ locale }: Props) {
  const t = getTranslations(locale);
  const pathname = usePathname();

  const switchLocaleHref = locale === 'en' ? '/zh' : '/';

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div>
          <Link href={locale === 'zh' ? '/zh' : '/'} className="text-2xl font-bold text-indigo-600">
            🖼️ {t.nav.title}
          </Link>
          <p className="text-sm text-gray-500">{t.nav.subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={switchLocaleHref}
            className="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition text-sm"
          >
            {locale === 'en' ? '中文' : 'English'}
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-900 transition"
          >
            {t.nav.github}
          </a>
        </div>
      </div>
    </header>
  );
}
