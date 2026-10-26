// 공통 화면 조각. 색·모서리·글자 크기는 theme.ts 토큰 이름(bg-primary, rounded-card …)만 쓴다 (R-10-8).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { AlertTriangle, Check, Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Help } from './Help';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  // 시프티풍 (2026-10-10 의뢰인): 모서리가 거의 각진 흰 카드 + 얇은 테두리
  // 부르는 쪽이 여백(p-…)을 주면 기본 여백을 빼서 겹치지 않게
  const pad = /(^|\s)p-/.test(className) ? '' : 'p-5';
  // PC(2026-10-16 디자인 2차): 견본 「나 · 파랑」처럼 아주 옅은 그림자
  return <section id={id} className={`rounded-card border border-border bg-bg lg:shadow-card ${pad} ${className}`}>{children}</section>;
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

type Tone = 'neutral' | 'ok' | 'warn' | 'info' | 'danger'; // danger: 지각처럼 꼭 봐야 하는 것 (2026-10-19)
// 주황은 ⚠, 초록은 ✓ 아이콘과 글자를 항상 함께 — 색만으로 의미를 전하지 않는다 (R-10-8 색 규칙 3)
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const cls: Record<Tone, string> = {
    neutral: 'bg-surface text-muted',
    ok: 'bg-ok-tint text-ok',
    warn: 'bg-warn-tint text-warn',
    info: 'bg-primary-tint text-primary',
    danger: 'bg-danger-tint text-danger',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-button px-2 py-1 text-xs font-bold whitespace-nowrap ${cls[tone]}`}>
      {tone === 'ok' && <Check aria-hidden size={14} strokeWidth={1.75} />}
      {(tone === 'warn' || tone === 'danger') && <AlertTriangle aria-hidden size={14} strokeWidth={1.75} />}
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
      {/* 폰: 작은 회색 한 줄(토스풍) · PC(2026-10-16 디자인 2차): 견본처럼 진하고 굵은 제목 */}
      <h2 className="text-sm font-medium text-muted lg:text-base lg:font-bold lg:text-text">{children}</h2>
      {help && <Help>{help}</Help>}
      {aside && <span className="ml-auto flex items-center">{aside}</span>}
    </div>
  );
}

export function PageShell({ children, wide = false, flush = false }: { children: ReactNode; wide?: boolean; flush?: boolean }) {
  // 화면 좌우 16px, 폰 기준 폭 (4-9). 폰에서는 언제나 좁은 한 칸이다.
  // PC(1024px~): wide는 본문 전체 폭 — 목록·표·달력은 전부 이것을 쓴다 (2026-10-11 의뢰인: PC 화면 전체를 쓸 것, 2분할 금지).
  //   기본(좁은 쪽)은 상세·입력 화면용으로 왼쪽에 붙인 읽기 좋은 폭이다(가운데로 모으지 않는다)
  // flush: 폰에서 위 여백·사이 여백 없이 — 목록 위 줄(ListBar)이 화면 맨 위에 붙고 목록이 바로 이어진다 (2026-10-11)
  return <main className={`mx-auto flex w-full flex-col px-4 lg:gap-4 lg:px-8 lg:py-6 ${flush ? 'gap-0 pb-4' : 'gap-3 py-4'} ${wide ? 'max-w-md md:max-w-3xl lg:mx-0 lg:max-w-none' : 'max-w-md lg:mx-0 lg:max-w-5xl'}`}>{children}</main>;
}

/**
 * 항목 바로 밑 설명 상자 (2026-10-22 의뢰인: 다우오피스 통합설정 「사원급여」처럼 설명이 들어가 있는 것이 좋다 — 결정 사항 개발-52).
 * 설명을 화면 위에 몰아 두지 않고 그 항목 밑에 붙인다. 숫자 · 조건만 강조색(em)으로 — 훑어 읽어도 대상인지 알게.
 * 줄바꿈(
)은 그대로 보인다. link: 공식 안내 한 곳
 */
const linkCls = 'mt-2 flex w-fit min-h-9 items-center gap-1 rounded-button border border-border bg-bg px-3 text-sm font-medium whitespace-normal text-text hover:bg-surface';
export function Explain({ children, link }: { children: ReactNode; link?: { href: string; label: string } }) {
  return (
    <div className="rounded-button border border-primary/25 bg-bg/70 px-4 py-3 text-sm leading-6 whitespace-pre-line text-muted">
      {children}
      {link &&
        (link.href.startsWith('/') ? (
          <Link href={link.href} className={linkCls}>
            {link.label} →
          </Link>
        ) : (
          <a href={link.href} target="_blank" rel="noreferrer" className={linkCls}>
            {link.label} →
          </a>
        ))}
    </div>
  );
}
/** Explain 안의 강조 — t.rich(key, { em }) */
export const em = (chunks: ReactNode) => <strong className="font-semibold text-primary">{chunks}</strong>;

/** 빈 화면 — 글자 한 줄 대신 아이콘 + 제목 + 한 줄 설명 (2026-10-22 디자인: 「요청이 없습니다」 한 줄만 덩그러니 있었다) */
export function Empty({ title, desc, icon: Icon = Inbox, children }: { title: string; desc?: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-bg px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-chip bg-primary-tint text-primary">
        <Icon aria-hidden size={24} strokeWidth={1.75} />
      </span>
      <p className="text-base font-bold text-text">{title}</p>
      {desc && <p className="max-w-md text-sm text-muted">{desc}</p>}
      {children}
    </div>
  );
}
