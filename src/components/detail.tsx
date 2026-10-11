// 상세 화면의 공통 모양 (2026-10-11 의뢰인: 시프티의 상세 화면처럼) — 맨 위 「← 제목 … 수정」 줄 + 「항목 — 값」 줄 묶음.
// 폰에서는 로고 줄 대신 이 줄이 맨 위에 붙는다(FrameHeader가 로고 줄을 숨긴다). PC에서는 본문 안의 한 줄이다.
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function DetailBar({ back, backLabel, title, action, extra, plain = false }: { back: string; backLabel: string; title: string; action?: { href: string; label: string }; extra?: ReactNode; plain?: boolean }) {
  // plain: 화면의 머리글(h1)이 아래에 따로 있을 때 — 이 줄의 제목은 그냥 글자로 둔다 (머리글이 둘이 되지 않게)
  const Title = plain ? 'p' : 'h1';
  return (
    // PC (2026-10-11, 시프티 PC 화면): 상자 없이 큰 제목(24px) + 오른쪽에 파란 주 버튼 하나. 폰은 그대로(맨 위에 붙는 흰 줄)
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex min-h-14 items-center gap-2 border-b border-border bg-bg px-4 pt-[env(safe-area-inset-top)] lg:static lg:mx-0 lg:mt-0 lg:min-h-10 lg:border-0 lg:bg-transparent lg:px-0">
      <Link href={back} aria-label={backLabel} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text lg:ml-0 lg:size-8 lg:border lg:border-border lg:bg-bg lg:text-muted">
        <ArrowLeft aria-hidden size={24} strokeWidth={1.75} className="lg:size-4.5" />
      </Link>
      <Title className="min-w-0 flex-1 truncate text-lg font-bold lg:text-2xl">{title}</Title>
      {extra}
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
