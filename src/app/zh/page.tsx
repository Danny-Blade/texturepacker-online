import { Metadata } from 'next';
import Header from '@/components/Header';
import TexturePacker from '@/components/TexturePacker';
import Features from '@/components/Features';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Web TexturePacker - 免费在线精灵图生成器',
  description: '免费在线图集打包工具。为游戏和网页创建优化的精灵图。支持多种导出格式，包括 JSON、CSS、XML、Cocos2d、Phaser3 和 Unity。',
  alternates: {
    canonical: '/zh',
    languages: {
      'en': '/',
      'zh': '/zh',
    },
  },
};

export default function ZhHomePage() {
  const locale = 'zh';
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
