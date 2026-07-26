import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web TexturePacker - 無料オンラインスプライトシート生成ツール',
  description: '無料のオンラインテクスチャパッカー。ゲームや Web 向けに最適化されたスプライトシートを作成できます。JSON、CSS、XML、Cocos2d、Phaser3、Unity など複数のエクスポート形式に対応。',
  keywords: 'テクスチャパッカー, スプライトシート, テクスチャアトラス, ゲーム開発, Web 最適化, 画像パッカー, 無料オンラインツール',
  openGraph: {
    title: 'Web TexturePacker - 無料オンラインスプライトシート生成ツール',
    description: '無料のオンラインテクスチャパッカー。ゲームや Web 向けに最適化されたスプライトシートを作成できます。',
    type: 'website',
    locale: 'ja_JP',
    siteName: 'Web TexturePacker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web TexturePacker - 無料オンラインスプライトシート生成ツール',
    description: '無料のオンラインテクスチャパッカー。ゲームや Web 向けに最適化されたスプライトシートを作成できます。',
  },
  alternates: {
    canonical: '/ja',
    languages: {
      'en': '/',
      'zh': '/zh',
      'ja': '/ja',
      'ko': '/ko',
      'es': '/es',
    },
  },
};

export default function JaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
