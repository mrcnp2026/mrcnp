// PC 왼쪽 칸의 「보기」 고르기 — 제증명 · 내 프로필처럼 두 칸으로 나눈 직원 화면(공지 · 사내게시판 · 교육)이 같이 쓴다 (2026-11-01 의뢰인).
// 칸마다 이름 + 건수, 누르면 오른쪽 목록이 그 보기로 바뀐다. 폰에서는 쓰지 않는다(폰은 숫자 칸 + 목록 그대로).
import Link from 'next/link';

export function SideFilter({ title, items }: { title: string; items: { key: string; label: string; n: number; href: string; on: boolean; warn?: boolean }[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-1 rounded-card border border-border bg-bg p-3 shadow-card lg:sticky lg:top-4">
      {items.map((x) => (
        <Link prefetch={false}
          key={x.key}
          href={x.href}
          aria-current={x.on ? 'page' : undefined}
          className={`flex min-h-11 items-center gap-2 rounded-button px-3 text-sm font-bold ${x.on ? 'bg-primary-tint text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}
        >
          <span className="flex-1">{x.label}</span>
          <span className={`num rounded-chip px-2 text-xs ${x.warn && x.n > 0 ? 'bg-warn-tint text-warn' : 'bg-surface text-muted'}`}>{x.n}</span>
        </Link>
      ))}
    </nav>
  );
}
