import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Web TexturePacker - Free Online Sprite Sheet Generator',
  description: 'Free online texture packer tool. Create optimized sprite sheets for games and web. Supports multiple export formats including JSON, CSS, XML, Cocos2d, Phaser3, and Unity.',
  keywords: 'texture packer, sprite sheet, sprite atlas, game development, web optimization, image packer, free online tool',
  authors: [{ name: 'Web TexturePacker' }],
  openGraph: {
    title: 'Web TexturePacker - Free Online Sprite Sheet Generator',
    description: 'Free online texture packer tool. Create optimized sprite sheets for games and web.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Web TexturePacker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web TexturePacker - Free Online Sprite Sheet Generator',
    description: 'Free online texture packer tool. Create optimized sprite sheets for games and web.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/',
    languages: {
      'en': '/',
      'zh': '/zh',
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
