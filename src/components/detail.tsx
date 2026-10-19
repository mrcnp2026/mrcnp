// 상세 화면의 공통 모양 (2026-10-11 의뢰인: 시프티의 상세 화면처럼) — 맨 위 「← 제목 … 수정」 줄 + 「항목 — 값」 줄 묶음.
// 폰에서는 로고 줄 대신 이 줄이 맨 위에 붙는다(FrameHeader가 로고 줄을 숨긴다). PC에서는 본문 안의 한 줄이다.
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MenuButton } from './MenuButton';
import { SheetOpener } from './SheetOpener';

export function DetailBar({ back, backLabel, title, action, extra, plain = false, sheet, desc, menuLabel }: { back: string; backLabel: string; title: string; action?: { href: string; label: string }; extra?: ReactNode; plain?: boolean; sheet?: { id: string; label: string; mobile?: string }; desc?: string; menuLabel?: string }) {
  // menuLabel: 하단 탭으로 바로 오는 맨 위 화면 — 폰에서 ← 대신 ☰ 메뉴 버튼 (2026-10-19 의뢰인: 관리자 모드 「직원」에서 메뉴가 안 나왔다)
  // desc: PC에서 제목 아래에 보이는 회색 설명 한 줄
  // sheet: 제목 오른쪽의 [추가] 버튼 — 누르면 그 창(AddSheet modal)이 뜬다. 폰은 같은 자리에 「+ 짧은 이름」 글자 버튼(sheet.mobile이 있을 때)
  //   (2026-10-17 의뢰인: PC와 폰의 작동 방식이 달랐다 — 폰만 오른쪽 아래 + 버튼이었다)
  // 맨 위 목록 화면(뒤로 = 홈)은 PC에서 뒤로 화살표를 숨긴다 — 왼쪽 메뉴가 있다
  // plain: 화면의 머리글(h1)이 아래에 따로 있을 때 — 이 줄의 제목은 그냥 글자로 둔다 (머리글이 둘이 되지 않게)
  const Title = plain ? 'p' : 'h1';
  return (
    // PC (2026-10-11, 시프티 PC 화면): 상자 없이 큰 제목(24px) + 오른쪽에 파란 주 버튼 하나. 폰은 그대로(맨 위에 붙는 흰 줄)
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex min-h-14 items-center gap-2 border-b border-border bg-bg px-4 pt-[env(safe-area-inset-top)] lg:static lg:mx-0 lg:mt-0 lg:min-h-10 lg:border-0 lg:bg-transparent lg:px-0">
      {menuLabel && <MenuButton label={menuLabel} />}
      {/* menuLabel이 있으면 폰에서는 ☰만, PC에서는 지금처럼 ← (맨 위 화면 /punch는 PC에서도 숨김) */}
      <Link href={back} aria-label={backLabel} className={`-ml-2 ${menuLabel ? 'hidden lg:flex' : 'flex'} size-11 shrink-0 items-center justify-center rounded-button text-text lg:ml-0 lg:size-8 lg:border lg:border-border lg:bg-bg lg:text-muted ${back === '/punch' ? 'lg:hidden' : ''}`}>
        <ArrowLeft aria-hidden size={24} strokeWidth={1.75} className="lg:size-4.5" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Title className="truncate text-lg font-bold lg:text-2xl">{title}</Title>
        {desc && <p className="hidden truncate text-sm text-faint lg:block">{desc}</p>}
      </div>
      {extra}
      {sheet && <SheetOpener id={sheet.id} label={sheet.label} className="hidden lg:inline-flex" />}
      {sheet?.mobile && <SheetOpener id={sheet.id} label={sheet.mobile} text className="inline-flex lg:hidden" />}
      {action && (
        <Link href={action.href} className="inline-flex min-h-11 shrink-0 items-center px-2 text-base font-bold text-primary lg:min-h-8 lg:rounded-button lg:bg-primary lg:px-4 lg:text-sm lg:text-on-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** 「항목 — 값」 줄 묶음. 묶음 사이는 바탕색 띠로 나뉜다 */
export function FieldList({ children }: { children: ReactNode }) {
  return <dl className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">{children}</dl>;
}

export function Field({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="shrink-0 font-bold">{label}</dt>
      <dd className="num flex min-w-0 flex-1 items-center justify-end gap-1 text-right text-muted">
        <span className="min-w-0 truncate">{value}</span>
        {href && <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />}
      </dd>
    </>
  );
  const cls = 'flex min-h-14 items-center gap-4 px-5 py-2';
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
