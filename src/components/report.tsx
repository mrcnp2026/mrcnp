// 리포트 화면(근태 · 휴가 · 연간) 공통 조각 — 2026-10-23 의뢰인: 「정신없고 빡빡하다 · 볼드 남발 · 서체 크기가 제각각 · 전문성이 없어 보인다」.
// 글자 단계는 네 가지만: 화면 제목 24 · 구역 제목 16 · 본문(표 · 값) 14 · 설명 12. 굵기는 제목 · 큰 숫자에만(semibold), 표 안은 보통(이름만 medium).
// 표: 세로선 없음 · 머리글은 작고 옅게 · 숫자는 오른쪽 맞춤 · 0은 옅은 「–」 · 합계 줄만 옅은 바탕.
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { HelpTip } from '@/components/Help';

export const R = {
  card: 'rounded-card border border-border bg-bg',
  th: 'px-4 py-3 text-right text-xs font-medium whitespace-nowrap text-muted first:text-left',
  td: 'num px-4 py-3 text-right text-sm whitespace-nowrap text-text first:text-left',
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

const COLS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' };
const lgCols = (n: number) => (n <= 6 ? Math.max(3, n) : 4); // 일곱 칸 넘으면 네 칸씩 줄바꿈
export type Kpi = { label: string; value: ReactNode; tone?: 'default' | 'primary' | 'warn' | 'danger' | 'faint'; sub?: ReactNode; href?: string; active?: boolean };
const TONE = { default: 'text-text', primary: 'text-primary', warn: 'text-warn', danger: 'text-danger', faint: 'text-faint' };
/** 숫자 요약 — 상자를 따로 쪼개지 않고 한 장 안에 칸으로 나눈다 */
export function KpiStrip({ items, className = '' }: { items: Kpi[]; className?: string }) {
  const n = items.length;
  const cols = lgCols(n);
  const filler = (cols - (n % cols)) % cols; // 마지막 줄의 빈자리는 같은 바탕으로 채운다
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border ${COLS[cols]} ${className}`}>
      {items.map((k, i) => {
        const cls = `flex min-w-0 flex-col gap-1.5 px-5 py-4 ${k.active ? 'bg-primary-tint' : 'bg-bg'} ${k.href && !k.active ? 'transition-colors hover:bg-surface' : ''} ${i === n - 1 && n % 2 === 1 ? 'col-span-2 lg:col-span-1' : ''}`;
        const body = (
          <>
            <span className={`truncate text-xs ${k.active ? 'font-medium text-primary' : 'text-muted'}`}>{k.label}</span>
            <span className={`num text-2xl font-semibold tracking-tight ${TONE[k.tone ?? 'default']}`}>{k.value}</span>
            {k.sub && <span className="text-xs text-muted">{k.sub}</span>}
          </>
        );
        return k.href ? (
          <Link key={k.label} href={k.href} aria-current={k.active ? 'true' : undefined} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
      {Array.from({ length: filler }, (_, i) => (
        <div key={`f${i}`} aria-hidden className="hidden bg-bg lg:block" />
      ))}
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

/** 작은 막대 + 숫자 (출근율 · 소진율) */
export function Meter({ value, label, width = 'w-14' }: { value: number | null; label: ReactNode; width?: string }) {
  if (value === null) return <span className="text-faint">–</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2.5">
      <span aria-hidden className={`h-1.5 overflow-hidden rounded-chip bg-surface ${width}`}>
        <span className="fx-grow-x block h-full rounded-chip bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="w-12 text-right">{label}</span>
    </span>
  );
}
