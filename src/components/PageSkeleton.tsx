// 화면을 불러오는 동안 바로 보여 주는 자리 (2026-10-02 의뢰인: 누르면 1초 넘게 멈춘 것처럼 보임).
// 이 파일이 있으면 탭을 누르는 즉시 화면이 바뀌고, 내용은 서버가 끝나는 대로 채워진다.
// 움직이는 효과(깜빡임·등장 애니메이션) 없음 (R-10-8).
// ★ 2026-10-06 의뢰인: "메뉴를 눌러도 진행 중인지 모르겠다" — 자리 표시가 화면 바탕과 같은 회색이라 보이지 않았다.
//   흰 카드 모양 + 「처리하는 중」 글자로 바꾸고, PC에서는 본문 폭에 맞춘다.
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function PageSkeleton() {
  const t = useTranslations('common');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 lg:max-w-7xl lg:px-8 lg:py-6" aria-busy="true">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Clock aria-hidden size={18} strokeWidth={1.75} />
        {t('working')}
      </p>
      <div className="h-10 w-1/2 rounded-button bg-bg lg:w-1/4" />
      <div className="h-40 rounded-card bg-bg" />
      <div className="h-24 rounded-card bg-bg" />
      <div className="h-24 rounded-card bg-bg" />
    </div>
  );
}
