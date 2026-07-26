import { Metadata } from 'next';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Web TexturePacker — IDE スタイルのオンラインスプライトシート生成ツール',
  description:
    'ブラウザで動作するスプライトシートパッカー。デスクトップ IDE 風のワークフローで、MaxRects によるパッキング、パン/ズームプレビュー、JSON、CSS、XML、Cocos2d、Phaser 3、Unity など多彩な形式へのエクスポートに対応します。',
  alternates: {
    canonical: '/ja',
    languages: {
      en: '/',
      zh: '/zh',
      ja: '/ja',
      ko: '/ko',
      es: '/es',
    },
  },
};

export default function JaHomePage() {
  return <AppShell locale="ja" />;
}
