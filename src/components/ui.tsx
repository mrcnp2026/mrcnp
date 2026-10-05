// 공통 화면 조각. 색·모서리·글자 크기는 theme.ts 토큰 이름(bg-primary, rounded-card …)만 쓴다 (R-10-8).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { AlertTriangle, Check, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // 토스풍: 테두리·그림자 없는 큰 흰 카드. 회색 바탕 위에서 흰색만으로 묶음이 보인다
  // 부르는 쪽이 여백(p-…)을 주면 기본 여백을 빼서 겹치지 않게
  const pad = /(^|\s)p-/.test(className) ? '' : 'p-5';
  return <section className={`rounded-card bg-bg ${pad} ${className}`}>{children}</section>;
}

type Variant = 'primary' | 'ok' | 'outline' | 'danger';
const VARIANT: Record<Variant, string> = {
  // 한 화면에 색을 채운 버튼은 하나만 (R-10-7). 보조 행동은 outline
  primary: 'bg-primary text-on-primary',
  ok: 'bg-ok text-on-primary',
  // 보조 버튼: 연한 파랑 바탕 + 파랑 글자 (흰 카드 위·회색 바탕 위 어디서나 보인다)
  outline: 'bg-primary-tint text-primary',
  // 되돌리기 어려운 확인(퇴사 처리·폰 해제)에만 (theme.ts: danger는 되돌릴 수 없는 확인창에만)
  danger: 'bg-danger text-on-primary',
};

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-4 py-2 text-base font-bold disabled:opacity-60 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'info';
// 주황은 ⚠, 초록은 ✓ 아이콘과 글자를 항상 함께 — 색만으로 의미를 전하지 않는다 (R-10-8 색 규칙 3)
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const cls: Record<Tone, string> = {
    neutral: 'bg-surface text-muted',
    ok: 'bg-ok-tint text-ok',
    warn: 'bg-warn-tint text-warn',
    info: 'bg-primary-tint text-primary',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-xs font-bold ${cls[tone]}`}>
      {tone === 'ok' && <Check aria-hidden size={14} strokeWidth={1.75} />}
      {tone === 'warn' && <AlertTriangle aria-hidden size={14} strokeWidth={1.75} />}
      {children}
    </span>
  );
}

/**
 * 카드 제목 — 토스풍: 아이콘 타일 없이 작은 회색 글자 한 줄 (2026-10-02 의뢰인: "AI로 뚝딱 만든 느낌" — 카드마다 같은 아이콘 타일을 반복하던 것을 없앰).
 * icon은 예전 호출과 맞추려고 받기만 하고 그리지 않는다.
 */
export function CardTitle({ children, aside }: { icon?: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted">{children}</h2>
      {aside}
    </div>
  );
}

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  // 화면 좌우 16px, 폰 기준 폭 (4-9). wide: 넓은 화면에서 표를 펼치는 화면(월간 집계) — 폰에서는 똑같이 좁다
  return <main className={`mx-auto flex w-full flex-col gap-3 px-4 py-4 ${wide ? 'max-w-md md:max-w-3xl lg:max-w-5xl' : 'max-w-md'}`}>{children}</main>;
}
