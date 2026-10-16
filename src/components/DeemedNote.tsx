// 출퇴근기록 화면에서 뺀 간주 근무자 안내 한 줄 (2026-10-17 의뢰인: 「간주 근무자는 어차피 계속 근무로 찍히는데 굳이 보여 줘야 하나」).
// 근무일정 틀이 간주 근무인 사람(임원 등)은 기본으로 빼고, 이름으로 찾거나 [함께 보기]를 누르면 보인다. 월 집계 · 마감 · 급여에는 그대로 들어간다.
import Link from 'next/link';

export function DeemedNote({ names, shown, href, labels }: { names: string[]; shown: boolean; href: string; labels: { hidden: string; show: string; hide: string } }) {
  if (names.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 py-2 text-sm text-faint">
      {!shown && <span>{labels.hidden}</span>}
      <Link href={href} scroll={false} className="inline-flex min-h-9 items-center font-semibold text-primary">
        {shown ? labels.hide : labels.show}
      </Link>
    </p>
  );
}
