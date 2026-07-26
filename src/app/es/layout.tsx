import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web TexturePacker - Generador gratuito de hojas de sprites en línea',
  description: 'Herramienta gratuita de empaquetado de texturas en línea. Crea hojas de sprites optimizadas para juegos y web. Admite múltiples formatos de exportación como JSON, CSS, XML, Cocos2d, Phaser3 y Unity.',
  keywords: 'empaquetador de texturas, hoja de sprites, atlas de sprites, desarrollo de juegos, optimización web, empaquetador de imágenes, herramienta gratuita en línea',
  openGraph: {
    title: 'Web TexturePacker - Generador gratuito de hojas de sprites en línea',
    description: 'Herramienta gratuita de empaquetado de texturas en línea. Crea hojas de sprites optimizadas para juegos y web.',
    type: 'website',
    locale: 'es_ES',
    siteName: 'Web TexturePacker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web TexturePacker - Generador gratuito de hojas de sprites en línea',
    description: 'Herramienta gratuita de empaquetado de texturas en línea. Crea hojas de sprites optimizadas para juegos y web.',
  },
  alternates: {
    canonical: '/es',
    languages: {
      'en': '/',
      'zh': '/zh',
      'ja': '/ja',
      'ko': '/ko',
      'es': '/es',
    },
  },
};

export default function EsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
