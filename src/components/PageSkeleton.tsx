// 화면을 불러오는 동안 바로 보여 주는 자리 (2026-10-02 의뢰인: 누르면 1초 넘게 멈춘 것처럼 보임).
// 이 파일이 있으면 탭을 누르는 즉시 화면이 바뀌고, 내용은 서버가 끝나는 대로 채워진다.
// 움직이는 효과(깜빡임·등장 애니메이션) 없음 — 회색 자리만 (R-10-8).
import { useTranslations } from 'next-intl';

export function PageSkeleton() {
  const t = useTranslations('common');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4" aria-busy="true" aria-label={t('working')}>
      <div className="h-8 w-1/2 rounded-button bg-surface" />
      <div className="h-40 rounded-card bg-surface" />
      <div className="h-24 rounded-card bg-surface" />
      <div className="h-24 rounded-card bg-surface" />
    </div>
  );
}
