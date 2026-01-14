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
    <div className="min-h-screen bg-gray-50">
      <Header locale={locale} />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {t.nav.title}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
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
