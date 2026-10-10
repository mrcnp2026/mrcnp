'use client';
// 목록 위 줄 (2026-10-10 의뢰인: 시프티처럼) — 첫 줄: 검색 칸 + 거르기 단추 · 둘째 줄: 기간 「09.01 - 09.30 ▾」 + 오른쪽 [내 기록] 같은 단추.
// 값은 전부 주소(?q · ?g · ?from · ?to)에 둔다 — 뒤로 가기·새로 고침에도 그대로다. 기간·거르기 칸은 눌렀을 때만 펼친다.
import { CalendarDays, ChevronDown, Funnel, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { MenuButton } from '@/components/MenuButton';

const field = 'num min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

export function ListBar({
  q,
  from,
  to,
  max,
  group,
  groups,
  keep = {},
  side,
  single = false,
  tabs,
  gear,
  labels,
}: {
  q: string;
  from: string;
  to: string;
  max?: string; // 고를 수 있는 마지막 날 (없으면 제한 없음)
  group: string;
  groups: { id: string; label: string }[];
  keep?: Record<string, string | undefined>; // 그대로 둘 다른 주소 값 (연습 보기 등)
  side?: { href: string; label: string }; // 오른쪽 단추 ([내 기록])
  single?: boolean; // 기간 대신 기준일 하나 (휴가 잔여) — 값은 to에 둔다
  tabs?: { href: string; label: string; on: boolean }[]; // 검색 줄 아래 탭 한 줄 (휴가: 내 휴가 / 전체)
  gear?: { href: string; label: string }; // 검색 줄 오른쪽 톱니 (설정 화면으로)
  labels: { menu: string; search: string; filter: string; period: string; from: string; to: string; apply: string; groupAll: string };
}) {
  const router = useRouter();
  const path = usePathname();
  const [text, setText] = useState(q);
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const [open, setOpen] = useState<'period' | 'filter' | null>(null);
  const go = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, q: text.trim(), g: group, from, to, ...over })) if (v) p.set(k, v);
    router.push(`${path}?${p}`);
    setOpen(null);
  };
  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-b border-border bg-bg px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 lg:static lg:mx-0 lg:rounded-card lg:border lg:pt-2">
      <div className="flex items-center gap-2">
        <MenuButton label={labels.menu} />
        <form
          role="search"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-button bg-surface px-3"
          onSubmit={(e) => {
            e.preventDefault();
            go({});
          }}
        >
          <Search aria-hidden size={20} className="shrink-0 text-muted" />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={labels.search} aria-label={labels.search} maxLength={40} className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none" />
        </form>
        {groups.length > 0 && (
          <button type="button" aria-label={labels.filter} title={labels.filter} aria-expanded={open === 'filter'} onClick={() => setOpen(open === 'filter' ? null : 'filter')} className={`relative flex size-11 shrink-0 items-center justify-center rounded-button ${group ? 'bg-primary-tint text-primary' : 'text-text'}`}>
            <Funnel aria-hidden size={22} strokeWidth={1.75} />
          </button>
        )}
        {gear && (
          <Link href={gear.href} aria-label={gear.label} title={gear.label} className="flex size-11 shrink-0 items-center justify-center rounded-button text-text">
            <Settings aria-hidden size={22} strokeWidth={1.75} />
          </Link>
        )}
      </div>
      {tabs && (
        <nav className="-mx-4 -mt-1 flex border-b border-border">
          {tabs.map((x) => (
            <Link key={x.href} href={x.href} aria-current={x.on ? 'page' : undefined} className={`flex min-h-12 flex-1 items-center justify-center border-b-2 text-base font-bold ${x.on ? 'border-text text-text' : 'border-transparent text-muted'}`}>
              {x.label}
            </Link>
          ))}
        </nav>
      )}
      {open === 'filter' && (
        <select aria-label={labels.filter} value={group} onChange={(e) => go({ g: e.target.value })} className={field}>
          <option value="">{labels.groupAll}</option>
          {groups.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label={labels.period} aria-expanded={open === 'period'} onClick={() => setOpen(open === 'period' ? null : 'period')} className="num flex min-h-11 items-center gap-2 text-base font-medium text-muted">
          <CalendarDays aria-hidden size={20} strokeWidth={1.75} />
          {single ? `${labels.period} ${to.replaceAll('-', '.')}` : `${md(from)} - ${md(to)}`}
          <ChevronDown aria-hidden size={18} />
        </button>
        {side && (
          <Link href={side.href} className="inline-flex min-h-11 items-center rounded-button border border-primary bg-primary-tint px-4 text-sm font-bold text-primary">
            {side.label}
          </Link>
        )}
      </div>
      {open === 'period' && (
        <form
          className="flex flex-col gap-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            go(single ? { from: '', to: b } : { from: a, to: b });
          }}
        >
          <div className={single ? 'grid gap-2' : 'grid grid-cols-2 gap-2'}>
            {!single && (
              <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                {labels.from}
                <DateTimeInput type="date" value={a} onChange={setA} max={max} required className={field} />
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
              {labels.to}
              <DateTimeInput type="date" value={b} onChange={setB} max={max} required className={field} />
            </label>
          </div>
          <button type="submit" className="min-h-11 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
            {labels.apply}
          </button>
        </form>
      )}
    </div>
  );
}
