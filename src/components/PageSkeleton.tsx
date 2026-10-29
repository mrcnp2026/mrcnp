// 화면을 불러오는 동안 바로 보여 주는 자리 (2026-10-02 의뢰인: 누르면 1초 넘게 멈춘 것처럼 보임).
// 이 파일이 있으면 탭을 누르는 즉시 화면이 바뀌고, 내용은 서버가 끝나는 대로 채워진다.
// ★ 2026-10-06 의뢰인: "메뉴를 눌러도 진행 중인지 모르겠다" — 흰 카드 모양 + 「처리하는 중」 글자, PC에서는 본문 폭에 맞춘다.
// ★ 2026-10-27 의뢰인: 「화면 전환 때 아무것도 안 나오는 빈 페이지 · 동작 안 하는 것 같은 순간을 줄여라」
//   → 예전엔 0.25초 동안 투명했다(late-in) — 그사이 이전 화면은 이미 사라져 빈 화면이 보였다. 이제 바로 보이고(0.12초 페이드),
//     카드는 시안처럼 반짝여서(od-shimmer) 「불러오는 중」임이 보인다. 첫 줄은 숫자 타일 4칸 모양 — 대부분 화면의 첫 줄과 같다.
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

const SHINE = 'sk-shine rounded-card border border-border';

export function PageSkeleton() {
  const t = useTranslations('common');
  return (
    <div className="sk-in mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 lg:mx-0 lg:max-w-none lg:px-8 lg:py-6" aria-busy="true">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Clock aria-hidden size={18} strokeWidth={1.75} />
        {t('working')}
      </p>
      <div className="sk-shine h-9 w-1/2 rounded-button lg:w-1/4" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${SHINE} h-24`} />
        ))}
      </div>
      <div className={`${SHINE} h-48`} />
      <div className={`${SHINE} h-32`} />
    </div>
  );
}
