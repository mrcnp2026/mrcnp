// 상세 화면의 공통 모양 (2026-10-11 의뢰인: 시프티의 상세 화면처럼) — 맨 위 「← 제목 … 수정」 줄 + 「항목 — 값」 줄 묶음.
// 폰에서는 로고 줄 대신 이 줄이 맨 위에 붙는다(FrameHeader가 로고 줄을 숨긴다). PC에서는 본문 안의 한 줄이다.
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function DetailBar({ back, backLabel, title, action, extra }: { back: string; backLabel: string; title: string; action?: { href: string; label: string }; extra?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 -mt-4 flex min-h-14 items-center gap-2 border-b border-border bg-bg px-4 pt-[env(safe-area-inset-top)] lg:static lg:mx-0 lg:mt-0 lg:rounded-card lg:border">
      <Link href={back} aria-label={backLabel} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-button text-text">
        <ArrowLeft aria-hidden size={24} strokeWidth={1.75} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      {extra}
      {action && (
        <Link href={action.href} className="inline-flex min-h-11 shrink-0 items-center px-2 text-base font-bold text-primary">
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
