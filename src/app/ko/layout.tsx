import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web TexturePacker - 무료 온라인 스프라이트시트 생성기',
  description: '무료 온라인 텍스처 패커 도구. 게임과 웹을 위한 최적화된 스프라이트시트를 만들 수 있습니다. JSON, CSS, XML, Cocos2d, Phaser3, Unity 등 다양한 내보내기 형식을 지원합니다.',
  keywords: '텍스처 패커, 스프라이트시트, 텍스처 아틀라스, 게임 개발, 웹 최적화, 이미지 패커, 무료 온라인 도구',
  openGraph: {
    title: 'Web TexturePacker - 무료 온라인 스프라이트시트 생성기',
    description: '무료 온라인 텍스처 패커 도구. 게임과 웹을 위한 최적화된 스프라이트시트를 만들 수 있습니다.',
    type: 'website',
    locale: 'ko_KR',
    siteName: 'Web TexturePacker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web TexturePacker - 무료 온라인 스프라이트시트 생성기',
    description: '무료 온라인 텍스처 패커 도구. 게임과 웹을 위한 최적화된 스프라이트시트를 만들 수 있습니다.',
  },
  alternates: {
    canonical: '/ko',
    languages: {
      'en': '/',
      'zh': '/zh',
      'ja': '/ja',
      'ko': '/ko',
      'es': '/es',
    },
  },
};

export default function KoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
