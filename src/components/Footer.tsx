import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function Footer({ locale }: Props) {
  const t = getTranslations(locale);

  return (
    <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p>{t.footer.copyright}</p>
        <div className="mt-4 space-x-4">
          <a href="#" className="hover:text-white transition">{t.footer.privacy}</a>
          <a href="#" className="hover:text-white transition">{t.footer.terms}</a>
        </div>
      </div>
    </footer>
  );
}
