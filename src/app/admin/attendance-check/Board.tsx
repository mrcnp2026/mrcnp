'use client';
// 근태 점검 — 직원 고르기를 화면 안에서 바로 바꾼다 (2026-11-03 의뢰인: 「다른 인원을 클릭하면 안 바뀐다」 · 「첫 화면이 무조건 한 사람으로 나오는 건 이상」).
// 처음에는 아무도 고르지 않은 상태 — 오른쪽에는 안내만 (2026-11-03 의뢰인: 왼쪽을 눌러야 오른쪽이 나오게). 직원을 누르면 그 직원 항목, 다시 누르면 안내로.
// 폰: 처음에는 목록만, 직원을 누르면 그 직원 항목만(뒤로 가기). 주소의 ?e=도 같이 바꿔 새로 고쳐도 그대로 보인다.
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

export type BoardRow = { id: string; row: ReactNode; detail: ReactNode };

export function Board({ rows, initial, top, head, axis, empty }: { rows: BoardRow[]; initial: string | null; top: ReactNode; head: ReactNode; axis: ReactNode; empty: ReactNode }) {
  const t = useTranslations('admin.attendanceCheck');
  const [sel, setSel] = useState<string | null>(rows.some((r) => r.id === initial) ? initial : null);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (sel) u.searchParams.set('e', sel);
    else u.searchParams.delete('e');
    window.history.replaceState(window.history.state, '', u.toString());
  }, [sel]);
  const pick = (id: string) => {
    setSel((cur) => (cur === id ? null : id));
    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 });
  };
  const shown = sel ? rows.find((r) => r.id === sel) ?? null : null;

  return (
    <>
    {/* 폰에서 직원을 고르면 위쪽(달 · 건수 · 칩)은 숨기고 항목부터 (2026-11-03 폰 확인: 위쪽이 화면 절반을 차지했다) */}
    <div className={`flex flex-col gap-3 lg:gap-4 ${sel ? 'max-lg:hidden' : ''}`}>{top}</div>
    {/* PC: 왼쪽 목록 | 세로선 | 오른쪽 항목 — 두 칸은 같은 높이(세로선이 끝까지), 왼쪽은 화면에 고정 (2026-11-04 의뢰인: 좌우 높이 · 구분) */}
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-0 lg:border-t lg:border-border">
      <div className={`lg:border-r lg:border-border lg:pt-4 lg:pr-6 ${sel ? 'max-lg:hidden' : ''}`}>
      <section aria-label={t('listLabel')} className="flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        {/* 보기 단추(data-keep)를 누르면 고른 직원을 주소에 붙여 간다 — 고르기는 화면 안에서만 바뀌어 서버가 만든 주소에는 없다 */}
        <div onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a[data-keep]') as HTMLAnchorElement | null; if (a && sel) { const u = new URL(a.href); u.searchParams.set('e', sel); a.href = u.toString(); } }}>{head}</div>
        {/* 색 뜻 — 목록 바로 위에 (2026-11-03 의뢰인: 색이 무슨 뜻인지 모르겠다) */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2 text-xs text-muted">
          {(['decide', 'month', 'block', 'handled', 'fine'] as const).map((k) => ( // 쉬는 날 · 기록 없음은 이상 없음과 같은 칸, 승인된 날은 처리 완료와 같은 칸 (2026-11-04 의뢰인)
            <span key={k} className="inline-flex items-center gap-1">
              <span aria-hidden className={`size-3 rounded-xs ${{ decide: 'bg-alert', month: 'bg-alert/35', block: 'bg-danger', handled: 'bg-ok', fine: 'bg-border' }[k]}`} />
              {t(`legend.${k}`)}
            </span>
          ))}
        </p>
        {axis}
        {rows.length === 0 ? empty : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r.id)} aria-pressed={sel === r.id}
                  className={`block w-full px-2 py-2.5 text-left transition-colors duration-150 ${sel === r.id ? 'bg-primary-tint' : 'hover:bg-surface'}`}>
                  {r.row}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      <div className={`lg:min-h-[calc(100vh-14rem)] lg:pt-4 lg:pl-6 ${sel ? '' : 'max-lg:hidden'}`}>
        {shown ? (
          <>
            <button type="button" onClick={() => setSel(null)} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-text lg:hidden">
              <ChevronLeft aria-hidden size={16} />
              {t('backToList')}
            </button>
            {shown.detail}
          </>
        ) : (
          // 아무도 안 골랐을 때 — 무엇을 하는 곳인지 한 번에
          <div className="flex flex-col gap-1 rounded-card bg-surface px-6 py-8 text-sm text-muted">
            <p className="text-base font-bold text-text">{t('guide.title')}</p>
            <p>{t('guide.pick')}</p>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
