import { Metadata } from 'next';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Web TexturePacker — Generador de hojas de sprites en línea al estilo IDE',
  description:
    'Empaquetador de hojas de sprites en el navegador con un flujo de trabajo al estilo IDE de escritorio. Empaqueta texturas con MaxRects, previsualiza con desplazamiento/zoom y exporta a JSON, CSS, XML, Cocos2d, Phaser 3, Unity y más, todo en tu navegador.',
  alternates: {
    canonical: '/es',
    languages: {
      en: '/',
      zh: '/zh',
      ja: '/ja',
      ko: '/ko',
      es: '/es',
    },
  },
};

export default function EsHomePage() {
  return <AppShell locale="es" />;
}
