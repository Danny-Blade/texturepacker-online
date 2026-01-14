import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web TexturePacker - 免费在线精灵图生成器',
  description: '免费在线图集打包工具。为游戏和网页创建优化的精灵图。支持多种导出格式，包括 JSON、CSS、XML、Cocos2d、Phaser3 和 Unity。',
  keywords: '图集打包, 精灵图, 纹理图集, 游戏开发, 网页优化, 图片打包, 免费在线工具',
  openGraph: {
    title: 'Web TexturePacker - 免费在线精灵图生成器',
    description: '免费在线图集打包工具。为游戏和网页创建优化的精灵图。',
    type: 'website',
    locale: 'zh_CN',
    siteName: 'Web TexturePacker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web TexturePacker - 免费在线精灵图生成器',
    description: '免费在线图集打包工具。为游戏和网页创建优化的精灵图。',
  },
  alternates: {
    canonical: '/zh',
    languages: {
      'en': '/',
      'zh': '/zh',
    },
  },
};

export default function ZhLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
