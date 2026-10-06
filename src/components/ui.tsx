// 공통 화면 조각. 색·모서리·글자 크기는 theme.ts 토큰 이름(bg-primary, rounded-card …)만 쓴다 (R-10-8).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { AlertTriangle, Check, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Help } from './Help';

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

// sm: 표 안·한 줄에 여러 개 놓이는 버튼 (PC 요청 표, 2026-10-06 의뢰인)
const SIZE = { md: 'min-h-12 px-4 py-2 text-base', sm: 'min-h-9 px-3 py-1 text-sm' } as const;

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-button font-bold disabled:opacity-60 ${SIZE[size]} ${VARIANT[variant]} ${className}`}
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
    <span className={`inline-flex items-center gap-1 rounded-chip px-2.5 py-1 text-xs font-bold whitespace-nowrap ${cls[tone]}`}>
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
export function CardTitle({ children, aside, help }: { icon?: LucideIcon; children: ReactNode; aside?: ReactNode; help?: ReactNode }) {
  // help: 한 번 읽으면 되는 설명은 ? 아이콘 뒤로 접는다 (2026-10-06 의뢰인)
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      <h2 className="text-sm font-medium text-muted">{children}</h2>
      {help && <Help>{help}</Help>}
      {aside && <span className="ml-auto flex items-center">{aside}</span>}
    </div>
  );
}

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  // 화면 좌우 16px, 폰 기준 폭 (4-9). 폰에서는 언제나 좁은 한 칸이다.
  // PC(1024px~, 2026-10-06 의뢰인: PC가 폰 화면 그대로였다): 기본은 입력·읽기 좋은 폭, wide는 현황판·목록·표를 화면 가득 펼친다
  return <main className={`mx-auto flex w-full flex-col gap-3 px-4 py-4 lg:gap-4 lg:px-8 lg:py-6 ${wide ? 'max-w-md md:max-w-3xl lg:max-w-7xl' : 'max-w-md lg:max-w-3xl'}`}>{children}</main>;
}
