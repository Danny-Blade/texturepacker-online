import { Metadata } from 'next';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Web TexturePacker — IDE-style Online Sprite Sheet Generator',
  description:
    'A browser-based sprite sheet packer with a desktop-IDE workflow. Pack textures with MaxRects, preview with pan/zoom, export to JSON, CSS, XML, Cocos2d, Phaser 3, Unity and more — all in your browser.',
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      zh: '/zh',
    },
  },
};

export default function HomePage() {
  return <AppShell locale="en" />;
}
