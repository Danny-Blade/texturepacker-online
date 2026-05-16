import { Metadata } from 'next';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Web TexturePacker — IDE 风格在线精灵图生成器',
  description:
    '浏览器端的精灵图打包器，桌面 IDE 风格工作流。支持 MaxRects 打包、缩放/平移预览，可导出为 JSON、CSS、XML、Cocos2d、Phaser 3、Unity 等多种格式 — 完全在浏览器中完成。',
  alternates: {
    canonical: '/zh',
    languages: {
      en: '/',
      zh: '/zh',
    },
  },
};

export default function ZhHomePage() {
  return <AppShell locale="zh" />;
}
