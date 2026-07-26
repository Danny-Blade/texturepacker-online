import { Metadata } from 'next';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Web TexturePacker — IDE 스타일 온라인 스프라이트시트 생성기',
  description:
    '데스크톱 IDE 스타일 워크플로우를 갖춘 브라우저 기반 스프라이트시트 패커. MaxRects 패킹, 팬/줌 미리보기, JSON, CSS, XML, Cocos2d, Phaser 3, Unity 등 다양한 형식으로 내보내기까지 모두 브라우저에서 완료됩니다.',
  alternates: {
    canonical: '/ko',
    languages: {
      en: '/',
      zh: '/zh',
      ja: '/ja',
      ko: '/ko',
      es: '/es',
    },
  },
};

export default function KoHomePage() {
  return <AppShell locale="ko" />;
}
