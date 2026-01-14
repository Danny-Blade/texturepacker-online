import { getTranslations, Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
}

export default function Footer({ locale }: Props) {
  const t = getTranslations(locale);

  return (
    <footer className="bg-gradient-to-br from-gray-900 to-gray-800 text-gray-400 py-12 mt-20">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-xl">
              🖼️
            </div>
            <span className="text-white font-semibold">Web TexturePacker</span>
          </div>
          <p className="text-sm">{t.footer.copyright}</p>
          <div className="flex gap-6">
            <a href="#" className="text-sm hover:text-white transition">{t.footer.privacy}</a>
            <a href="#" className="text-sm hover:text-white transition">{t.footer.terms}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
