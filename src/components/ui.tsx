// 공통 화면 조각. 색·모서리·글자 크기는 theme.ts 토큰 이름(bg-primary, rounded-card …)만 쓴다 (R-10-8).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { AlertTriangle, Check, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-border bg-bg p-4 shadow-card ${className}`}>{children}</section>;
}

type Variant = 'primary' | 'ok' | 'outline';
const VARIANT: Record<Variant, string> = {
  // 한 화면에 색을 채운 버튼은 하나만 (R-10-7). 보조 행동은 outline
  primary: 'bg-primary text-on-primary',
  ok: 'bg-ok text-on-primary',
  outline: 'border border-border bg-bg text-primary',
};

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-4 py-2 text-base font-semibold disabled:opacity-60 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'info';
// 주황은 ⚠, 초록은 ✓ 아이콘과 글자를 항상 함께 — 색만으로 의미를 전하지 않는다 (R-10-8 색 규칙 3)
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const cls: Record<Tone, string> = {
    neutral: 'bg-surface text-muted border-border',
    ok: 'bg-ok-tint text-ok border-ok',
    warn: 'bg-warn-tint text-warn border-warn',
    info: 'bg-primary-tint text-primary border-primary-tint',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-chip border px-2 py-1 text-xs font-semibold ${cls[tone]}`}>
      {tone === 'ok' && <Check aria-hidden size={14} strokeWidth={1.75} />}
      {tone === 'warn' && <AlertTriangle aria-hidden size={14} strokeWidth={1.75} />}
      {children}
    </span>
  );
}

/** 카드 제목 — 연한 파랑 타일 안의 선 아이콘 + 제목. 색 면적은 작게 (R-10-8 색 규칙 1) */
export function CardTitle({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-3 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-button bg-primary-tint text-primary">
          <Icon aria-hidden size={18} strokeWidth={1.75} />
        </span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  // 화면 좌우 16px, 폰 기준 폭 (4-9). wide: 넓은 화면에서 표를 펼치는 화면(월간 집계) — 폰에서는 똑같이 좁다
  return <main className={`mx-auto flex w-full flex-col gap-4 px-4 py-6 ${wide ? 'max-w-md md:max-w-3xl lg:max-w-5xl' : 'max-w-md'}`}>{children}</main>;
}
