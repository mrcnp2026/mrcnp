// 공통 화면 조각. 색·모서리·글자 크기는 theme.ts 토큰 이름(bg-primary, rounded-card …)만 쓴다 (R-10-8).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { AlertTriangle, Check, Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Clamp } from './ClampText';
import { Help } from './Help';
import { MorphButton } from './MorphButton';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  // 2026-10-27 키트: 둥근 미색 카드 + 얇은 테두리 + 아래로 퍼지는 옅은 그림자 (이전: 시프티풍 각진 카드)
  // 부르는 쪽이 여백(p-…)을 주면 기본 여백을 빼서 겹치지 않게
  const pad = /(^|\s)p-/.test(className) ? '' : 'p-5';
  // PC(2026-10-16 디자인 2차): 견본 「나 · 파랑」처럼 아주 옅은 그림자
  return <section id={id} className={`rounded-card border border-border bg-bg shadow-card ${pad} ${className}`}>{children}</section>;
}

// 아이콘 네모 — 2026-10-28 taste 기준으로 중립색 하나로(종류마다 파스텔 색을 칠하지 않는다: 색은 숫자 · 데이터에만).
// tone은 예전 호출과 맞추려고 받기만 한다. 주의가 필요하면 아이콘이 아니라 옆의 숫자 · 글자에 색을 쓴다
const ICON_TONE = { 1: 'bg-surface text-muted', 2: 'bg-surface text-muted', 3: 'bg-surface text-muted', 4: 'bg-surface text-muted' } as const;
export function IconTile({ icon: Icon, tone = 2, size = 36 }: { icon: LucideIcon; tone?: 1 | 2 | 3 | 4; size?: number }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-button ${ICON_TONE[tone]}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.47)} strokeWidth={1.9} />
    </span>
  );
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
    // 누르면 줄어들어 고리가 도는 움직임 (MorphButton, 2026-10-27) — 부르는 쪽의 disabled={busy}로 저절로 동작
    <MorphButton
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
      {/* 폰 · PC 같은 모양: 진하고 굵은 제목 (2026-10-29 의뢰인: 폰만 작은 회색이라 PC와 달라 보였다. 이전 폰: 토스풍 작은 회색) */}
      <h2 className="text-base font-bold text-text">{children}</h2>
      {help && <Help>{help}</Help>}
      {aside && <span className="ml-auto flex items-center">{aside}</span>}
    </div>
  );
}

const WIDTH = 'max-w-md md:max-w-3xl lg:mx-0 lg:max-w-none'; // 모든 화면이 같은 폭 — PC는 옆 판 오른쪽 남은 영역을 끝까지 쓴다(다우오피스처럼, 2026-10-30 의뢰인 스샷2/사이즈 · 사이즈1 — 1920px 모니터에서 1280px 제한은 오른쪽이 비었다)
export function PageShell({ children, flush = false }: { children: ReactNode; wide?: boolean; flush?: boolean }) {
  // 화면 좌우 16px, 폰 기준 폭 (4-9). 폰에서는 언제나 좁은 한 칸이다.
  // 2026-10-30 의뢰인: 「모든 메뉴 · 하위 메뉴의 화면 좌우 폭이 같아야 한다 — 늘었다 줄었다 하면 어지럽다(다우오피스처럼)」 →
  //   폭은 한 가지: 옆 메뉴 판 오른쪽 남은 영역을 채운다(제한 없음). 오른쪽은 남긴다 — 왼쪽 40px · 오른쪽 64px(넓은 화면 112px). 다우오피스의 오른쪽 메뉴 자리만큼(같은 날 의뢰인: 「끝까지 채우는 게 아니라 우리는 우측에 메뉴가 없잖아」)
  //   wide는 예전 화면 코드와 맞추려고 남겨 둔 칸이고 이제 폭에 영향을 주지 않는다. 화면 안에서 폭을 따로 좁히지 않는다.
  // flush: 폰에서 위 여백·사이 여백 없이 — 목록 위 줄(ListBar)이 화면 맨 위에 붙고 목록이 바로 이어진다 (2026-10-11)
  return <main className={`mx-auto flex w-full flex-col px-4 lg:gap-4 lg:pr-16 lg:pl-10 lg:py-6 xl:pr-28 ${flush ? 'gap-0 pb-4' : 'gap-3 py-4'} ${WIDTH}`}>{children}</main>;
}

/**
 * 항목 바로 밑 설명 상자 (2026-10-22 의뢰인: 다우오피스 통합설정 「사원급여」처럼 설명이 들어가 있는 것이 좋다 — 결정 사항 개발-52).
 * 설명을 화면 위에 몰아 두지 않고 그 항목 밑에 붙인다. 숫자 · 조건만 강조색(em)으로 — 훑어 읽어도 대상인지 알게.
 * 줄바꿈(
)은 그대로 보인다. link: 공식 안내 한 곳
 */
const linkCls = 'mt-2 flex w-fit min-h-9 items-center gap-1 rounded-button border border-border bg-bg px-3 text-sm font-medium whitespace-normal text-text hover:bg-surface';
// 2026-10-28 의뢰인(「긴 텍스트 · 전부 초록」): 처음엔 두 줄만(Fold) — 「자세히」로 펼친다. 테두리 · 강조를 초록에서 차분한 색으로.
//   초록은 저장 · 고른 값 같은 「누를 것」에만, 되돌릴 수 없는 경고는 주황(warn), 숫자 · 조건은 진한 글씨(em)
export function Explain({ children, link }: { children: ReactNode; link?: { href: string; label: string } }) {
  const more = link ? (link.href.startsWith('/') ? (
    <Link prefetch={false} href={link.href} className={linkCls}>
      {link.label} →
    </Link>
  ) : (
    <a href={link.href} target="_blank" rel="noreferrer" className={linkCls}>
      {link.label} →
    </a>
  )) : undefined;
  return (
    <Clamp lines={2} after={more} className="rounded-button border-l-2 border-border bg-surface/60 px-4 py-2.5 text-sm leading-6 whitespace-pre-line text-muted">
      {children}
    </Clamp>
  );
}
/** Explain 안의 강조 — t.rich(key, { em, warn }). em: 숫자 · 조건(진한 글씨), warn: 되돌릴 수 없는 것 · 저절로 되지 않는 것(주황) */
export const em = (chunks: ReactNode) => <strong className="font-semibold text-text">{chunks}</strong>;
export const warn = (chunks: ReactNode) => <strong className="font-semibold text-warn">{chunks}</strong>;

/** 빈 화면 — 글자 한 줄 대신 아이콘 + 제목 + 한 줄 설명 (2026-10-22 디자인: 「요청이 없습니다」 한 줄만 덩그러니 있었다) */
export function Empty({ title, desc, icon: Icon = Inbox, children }: { title: string; desc?: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    // 폰은 낮고 작게 (2026-10-27 의뢰인: 모바일 — 빈 상자가 세로를 너무 많이 차지한다). 아이콘은 파스텔 네모
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-bg px-5 py-6 text-center lg:px-6 lg:py-12">
      <span className="flex size-10 items-center justify-center rounded-button bg-tile-2 text-ok lg:size-12">
        <Icon aria-hidden size={22} strokeWidth={1.75} />
      </span>
      <p className="text-base font-bold text-text">{title}</p>
      {desc && <p className="max-w-md text-sm text-muted">{desc}</p>}
      {children}
    </div>
  );
}
