import { Metadata } from 'next';
import Header from '@/components/Header';
import TexturePacker from '@/components/TexturePacker';
import Features from '@/components/Features';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Web TexturePacker - Free Online Sprite Sheet Generator',
  description: 'Free online texture packer tool. Create optimized sprite sheets for games and web. Supports multiple export formats including JSON, CSS, XML, Cocos2d, Phaser3, and Unity.',
  alternates: {
    canonical: '/',
    languages: {
      'en': '/',
      'zh': '/zh',
    },
  },
};

export default function HomePage() {
  const locale = 'en';
  const t = getTranslations(locale);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <Header locale={locale} />
      
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            {t.nav.title}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            {t.meta.description}
          </p>
        </div>

        <TexturePacker locale={locale} />
        <Features locale={locale} />
        <FAQ locale={locale} />
      </main>

      <Footer locale={locale} />
    </div>
  );
}
