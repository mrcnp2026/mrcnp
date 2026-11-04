// 리포트 화면(근태 · 휴가 · 연간) 공통 조각 — 2026-10-23 의뢰인: 「정신없고 빡빡하다 · 볼드 남발 · 서체 크기가 제각각 · 전문성이 없어 보인다」.
// 글자 단계는 네 가지만: 화면 제목 24 · 구역 제목 16 · 본문(표 · 값) 14 · 설명 12. 굵기는 제목 · 큰 숫자에만(semibold), 표 안은 보통(이름만 medium).
// 표: 세로선 없음 · 머리글은 작고 옅게 · 숫자는 오른쪽 맞춤 · 0은 옅은 「–」 · 합계 줄만 옅은 바탕.
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { HelpTip } from '@/components/Help';

export const R = {
  card: 'rounded-card border border-border bg-bg shadow-card',
  // 1024~1279px: 여백 · 이름 칸을 줄이고 머리글 줄바꿈 허용 — 표가 상자 안에서 옆으로 밀리지 않게 (2026-10-29 가로 넘침 검사)
  th: 'px-1.5 py-3 text-right text-xs font-medium text-muted first:text-left xl:px-4 xl:whitespace-nowrap xl:first:w-44',
  td: 'num px-1.5 py-3 text-right text-sm whitespace-nowrap text-text first:text-left first:whitespace-normal xl:px-4 xl:first:whitespace-nowrap',
  tr: 'border-b border-border/60 last:border-b-0 hover:bg-surface/60',
  total: 'border-t border-border bg-surface/70',
  control: 'h-9 rounded-button border border-border bg-bg px-3 text-sm text-text',
  primary: 'inline-flex h-9 items-center justify-center rounded-button bg-primary px-4 text-sm font-medium text-on-primary',
  ghost: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-button border border-border bg-bg px-3.5 text-sm font-medium text-text hover:bg-surface',
  link: 'text-sm font-medium text-primary hover:underline',
};

/** 화면 제목 한 줄 — 오른쪽에는 쓸 수 있는 단추 */
export function ReportHead({ title, help, children }: { title: string; help?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-1 text-2xl font-semibold tracking-tight">
        {title}
        {help && <HelpTip>{help}</HelpTip>}
      </h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** 조건 막대 — 한 줄(폰에서는 두 칸씩). 이름표는 작고 옅게 */
export function FilterBar({ action, hidden, children }: { action: string; hidden?: Record<string, string>; children: ReactNode }) {
  return (
    <form action={action} className="grid grid-cols-2 items-end gap-3 lg:flex lg:flex-wrap">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </form>
  );
}
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/** pcOnly: 폰에서는 숨긴다 — 두 칸씩 놓이는 폰에서 개수를 짝수로 맞출 때 (2026-10-27 의뢰인: 근태 리포트 다섯 칸 → 폰 넷) */
export type Kpi = { label: string; value: ReactNode; tone?: 'default' | 'primary' | 'warn' | 'danger' | 'faint'; sub?: ReactNode; href?: string; active?: boolean; pcOnly?: boolean; meter?: number | null };
const TONE = { default: 'text-text', primary: 'text-primary', warn: 'text-warn', danger: 'text-danger', faint: 'text-faint' };
// 관리자 첫 화면과 같은 숫자 칸 — 한 판을 선으로 나눈다 (2026-10-28 taste 기준: 파스텔 타일 4색 · 그림자를 뺐다. 색은 숫자의 tone에만)
const COLS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' };
/** 숫자 요약 — 파스텔 타일 한 줄 (폰은 두 칸씩) */
export function KpiStrip({ items, className = '' }: { items: Kpi[]; className?: string }) {
  const n = items.length;
  const phone = items.filter((k) => !k.pcOnly);
  const lastPhone = phone[phone.length - 1];
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded-card border border-border bg-bg ${COLS[Math.min(6, Math.max(3, n))]} ${className}`}>
      {items.map((k, i) => {
        // 칸 사이 1px 선: PC는 둘째 칸부터 왼쪽 선, 폰(2칸)은 폰에서 보이는 순서로 오른쪽 칸 왼쪽 선 · 둘째 줄부터 위 선
        const pi = phone.indexOf(k);
        const lines = `${i > 0 ? 'lg:border-l lg:border-border' : ''} ${pi % 2 === 1 ? 'max-lg:border-l max-lg:border-border' : ''} ${pi >= 2 ? 'max-lg:border-t max-lg:border-border' : ''}`;
        const cls = `relative flex min-w-0 flex-col gap-2 p-4 lg:p-5 ${lines} ${k.active ? 'bg-surface' : ''} ${k.href ? 'transition-colors duration-300 hover:bg-surface' : ''} ${k.pcOnly ? 'max-lg:hidden' : ''} ${k === lastPhone && phone.length % 2 === 1 ? 'col-span-2 lg:col-span-1' : ''}`;
        const body = (
          <>
            <span className={`truncate text-sm ${k.active ? 'font-semibold text-primary' : 'text-muted'}`}>{k.label}</span>
            <span className={`num text-2xl leading-none font-bold tracking-tight lg:text-3xl ${TONE[k.tone ?? 'default']}`}>{k.value}</span>
            {k.sub && <span className="text-xs text-muted">{k.sub}</span>}
            {/* meter: 타일 안 알약 진행 막대 (소진율처럼 0~100%) — 2026-10-27 휴가 리포트 게이지 대신 */}
            {k.meter != null && (
              <span aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-rail">
                <span className="fx-grow-x block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, k.meter))}%` }} />
              </span>
            )}
          </>
        );
        return k.href ? (
          <Link prefetch={false} key={k.label} href={k.href} aria-current={k.active ? 'true' : undefined} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** 구역 — 제목(16) + 설명(12) + 내용. 구역 사이는 넉넉히 */
export function Block({ title, count, note, aside, children }: { title: string; count?: number; note?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {title}
          {count !== undefined && <span className="num ml-2 text-sm font-normal text-muted">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
      {note && <p className="text-xs text-muted">{note}</p>}
    </section>
  );
}

/** 표 바깥 — 옆으로 넘치면 이 안에서만 스크롤 */
export function TableCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-x-auto ${R.card} ${className}`}>{children}</div>;
}

/** 목록 줄 바깥(폰) */
export function ListCard({ children, className = '', ...rest }: ComponentProps<'ul'>) {
  return (
    <ul {...rest} className={`flex flex-col divide-y divide-border/60 ${R.card} ${className}`}>
      {children}
    </ul>
  );
}

/** 0이면 옅은 「–」 */
export const dim = (v: ReactNode, zero: boolean) => (zero ? <span className="text-faint">–</span> : v);

/** 작은 막대 + 숫자 (출근율 · 소진율) — 숫자는 줄을 바꾸지 않는다(2026-10-27 의뢰인: 「%」가 아랫줄로 떨어져 줄이 안 맞았다) */
export function Meter({ value, label, width = 'w-16' }: { value: number | null; label: ReactNode; width?: string }) {
  if (value === null) return <span className="text-faint">–</span>;
  const v = Math.min(100, Math.max(0, value));
  return (
    <span className="inline-flex items-center justify-end gap-3 whitespace-nowrap">
      <span aria-hidden className={`h-2 shrink-0 overflow-hidden rounded-full bg-rail ${width}`}>
        <span className="fx-grow-x block h-full rounded-full" style={{ width: `${v}%`, background: 'linear-gradient(to right, var(--t-color-accent-2), var(--t-color-primary))' }} />
      </span>
      <span className="num w-14 shrink-0 text-right">{label}</span>
    </span>
  );
}
