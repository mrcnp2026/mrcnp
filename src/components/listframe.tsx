// 목록 화면 틀 (2026-10-14 문서 08 6장 3 · 결정 사항 개발-24, 견본 `09 디자인 기준 견본` 「관리자 화면(이상자 관리)」):
//   ListHead    — 제목 + ⚙(이 화면의 기준이 있는 통합설정으로 바로가기) + 한 줄 설명 + 오른쪽 단추
//   FilterBar   — 날짜 이동 · 거르기 · 바로가기 한 줄
//   StatusCards — 상태 카드 묶음. 카드를 누르면 그 상태로 걸러지고, 다시 누르면 풀린다(주소로 — 뒤로 가기 · 새로 고침에도 그대로)
//   ListTable   — 표: 머리는 작은 회색 글자 + 위 진한 선, 줄은 가로선만 · 높이 48px
//                 폰(< 1024px)에서는 줄마다 카드 — 첫 칸이 제목, 나머지는 「머리 이름 … 값」 한 줄씩 (2026-10-15 의뢰인: PC 표를 그대로 줄여 쓰지 않는다 · PRD 4.3)
// 이상자 관리 · 요청함 · 연차 촉진 · 급여대장 목록 · 사회보험 · 퇴직급여 · 일용직이 같은 틀을 쓴다. 문장은 부르는 쪽이 번역 파일에서 넘긴다.
import { ChevronDown, Settings, TriangleAlert } from 'lucide-react';
import { HelpTip } from './Help';
import Link from 'next/link';
import { CountUp } from './CountUp';
import { Children, cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

export function ListHead({ title, desc, settingsHref, settingsLabel, actions }: { title: string; desc?: ReactNode; settingsHref?: string; settingsLabel?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          <span data-dup-title>{title}</span>
          {desc && <HelpTip phone>{desc}</HelpTip>}
          {settingsHref && (
            <Link href={settingsHref} aria-label={settingsLabel} title={settingsLabel} className="flex size-8 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-primary">
              <Settings aria-hidden size={18} strokeWidth={1.75} />
            </Link>
          )}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export type StatusCard = { key: string; label: string; n: number; unit?: string; href: string; on: boolean; tone?: 'warn' | 'ok' | 'muted' | 'info' };
const TONE = { warn: 'text-warn', ok: 'text-ok', muted: 'text-muted', info: 'text-primary-ink' } as const;

/** 상태 카드 묶음들 — 묶음마다 옅은 회색 상자 안에 흰 카드 */
export function StatusCards({ groups }: { groups: { title: string; cards: StatusCard[] }[] }) {
  return (
    // 묶음 폭은 카드 수에 비례(최대 5칸) — 카드가 적은 묶음이 눌려 이름이 잘리지 않게
    <div className="grid gap-3 lg:grid-cols-(--cols)" style={{ '--cols': groups.map((g) => `minmax(0,${Math.min(Math.max(g.cards.length, 1), 5)}fr)`).join(' ') } as CSSProperties}>
      {groups.map((g) => (
        <section key={g.title} className="rounded-card bg-surface p-2 lg:p-3">
          <h2 className="px-1 pb-1.5 text-xs font-bold text-muted lg:pb-2 lg:text-sm">{g.title}</h2>
          {/* 폰: 한 줄에 셋, 작게 (2026-10-16 디자인: 카드만으로 첫 화면이 찼다) — 넷이면 한 줄에 넷, 둘이면 둘(한 칸만 다음 줄로 떨어지지 않게, 2026-10-19) · PC: 칸 폭에 맞춰 */}
          <div className={`grid ${g.cards.length === 4 ? 'grid-cols-4' : g.cards.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 lg:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] lg:gap-2`}>
            {g.cards.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                scroll={false}
                aria-pressed={c.on}
                className={`flex min-w-0 flex-col gap-1 rounded-button border bg-bg px-2.5 py-2 lg:gap-1.5 lg:px-3.5 lg:py-3 ${c.on ? 'border-primary ring-2 ring-primary-tint' : 'border-transparent hover:border-border'}`}
              >
                <span className="truncate text-xs text-muted lg:text-sm">{c.label}</span>
                <span className={`num text-xl leading-none font-bold lg:text-2xl ${c.n > 0 && c.tone ? TONE[c.tone] : c.n === 0 ? 'text-faint' : 'text-text'}`}>
                  <CountUp value={c.n} />
                  {c.unit && <small className="pl-0.5 text-sm font-medium text-muted">{c.unit}</small>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 표 — 비었으면 empty 한 줄 */
export function ListTable({ head, children, empty, count }: { head: { label: string; right?: boolean }[]; children: ReactNode; empty?: string; count?: ReactNode }) {
  // 폰 카드에서 칸마다 머리 이름을 앞에 붙이려고, 줄(tr) 안의 칸(td)에 data-label을 단다 — 부르는 쪽은 그대로 tr · td만 넘긴다
  const rows = Children.map(children, (row) => {
    if (!isValidElement<{ children?: ReactNode }>(row)) return row;
    let i = 0;
    return cloneElement(row, {}, Children.map(row.props.children, (cell) => (isValidElement(cell) ? cloneElement(cell as ReactElement<Record<string, unknown>>, { 'data-label': head[i++]?.label ?? '' }) : cell)));
  });
  return (
    <div className="flex flex-col gap-1.5">
      {count && <p className="text-sm text-muted">{count}</p>}
      <div className="overflow-x-auto lg:rounded-card lg:border lg:border-border lg:bg-bg lg:shadow-card">
        <table className="w-full text-sm max-lg:[&_thead]:hidden">
          <thead>
            <tr className="border-b border-border lg:bg-surface/60">
              {head.map((h, i) => (
                <th key={i} scope="col" className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted ${h.right ? 'text-right' : 'text-left'}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:h-12 [&_td]:px-3 max-lg:border-t max-lg:border-text max-lg:[&_td]:flex max-lg:[&_td]:h-auto max-lg:[&_td]:min-h-7 max-lg:[&_td]:items-center max-lg:[&_td]:justify-between max-lg:[&_td]:gap-3 max-lg:[&_td]:px-1 max-lg:[&_td]:text-right max-lg:[&_td]:before:shrink-0 max-lg:[&_td]:before:text-xs max-lg:[&_td]:before:font-normal max-lg:[&_td]:before:text-faint max-lg:[&_td]:before:content-[attr(data-label)] max-lg:[&_td:first-child]:text-left max-lg:[&_td:first-child]:text-base max-lg:[&_td:first-child]:before:content-none max-lg:[&_td:empty]:hidden max-lg:[&_tr]:flex max-lg:[&_tr]:flex-col max-lg:[&_tr]:border-b max-lg:[&_tr]:border-border max-lg:[&_tr]:py-3">
            {rows}
            {empty && (
              <tr>
                <td colSpan={head.length} className="py-10 text-center text-faint">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 제목 옆 ⚙ — 이 화면의 기준이 있는 통합설정으로 (관리자에게만 보이게 부르는 쪽이 정한다) */
export function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-primary">
      <Settings aria-hidden size={18} strokeWidth={1.75} />
    </Link>
  );
}

/**
 * 꼭 알아야 할 경고 — ⚠ 짧은 한 줄만 보이고, 자세한 내용은 옆 ?를 눌러 본다 (2026-10-14 의뢰인: 긴 글을 바로 늘어놓지 말 것)
 */
export function WarnLine({ short, children }: { short: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 self-start rounded-button bg-warn-tint py-0.5 pr-1 pl-3 text-sm font-semibold text-warn">
      <TriangleAlert aria-hidden size={16} strokeWidth={2} className="shrink-0" />
      {short}
      <HelpTip>{children}</HelpTip>
    </p>
  );
}

export type Step = { key: string; label: string; href?: string; state: 'done' | 'now' | 'todo'; note?: string };
/**
 * 순서 안내 — ① → ② → ③ (2026-10-14 의뢰인: 「무엇을 어디에 넣고, 무엇과 어떻게 이어지는지」가 화면에 보여야 한다)
 * 끝낸 단계는 ✓, 지금 단계는 진하게, 남은 단계는 옅게. 누르면 그 단계 화면으로
 */
export function Steps({ steps, label }: { steps: Step[]; label: string }) {
  const nowAt = Math.max(0, steps.findIndex((s) => s.state === 'now'));
  return (
    <>
    {/* 폰(< 1024px): 지금 단계 한 줄만 — 단계 줄이 폰 폭을 넘어 잘리던 것 (2026-10-15 모바일 분석 10) */}
    <details className="group rounded-button bg-primary-tint lg:hidden" data-steps-phone>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="num font-bold text-primary">
          {nowAt + 1}/{steps.length}
        </span>
        <span className="truncate font-bold">{steps[nowAt]?.label ?? label}</span>
        <ChevronDown aria-hidden size={16} className="ml-auto shrink-0 text-faint transition-transform duration-[350ms] group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-0.5 px-2 pb-2">
        {steps.map((s, i) => {
          const mark = <span className={`num flex size-6 shrink-0 items-center justify-center rounded-chip text-xs font-bold ${s.state === 'done' ? 'bg-ok text-on-primary' : s.state === 'now' ? 'bg-primary text-on-primary' : 'bg-surface text-faint'}`}>{s.state === 'done' ? '✓' : i + 1}</span>;
          const text = (
            <span className="flex flex-col leading-tight">
              <span className={s.state === 'now' ? 'font-bold' : s.state === 'done' ? 'text-muted' : 'text-faint'}>{s.label}</span>
              {s.note && <span className="text-xs text-faint">{s.note}</span>}
            </span>
          );
          return (
            <li key={s.key}>
              {s.href && s.state !== 'now' ? (
                <Link href={s.href} className="flex min-h-11 items-center gap-2 rounded-button px-2 text-sm active:bg-bg">
                  {mark}
                  {text}
                </Link>
              ) : (
                <span aria-current={s.state === 'now' ? 'step' : undefined} className="flex min-h-11 items-center gap-2 px-2 text-sm">
                  {mark}
                  {text}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </details>
    <nav aria-label={label} className="hidden overflow-x-auto lg:block">
      <ol className="flex min-w-max items-stretch gap-1">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={`num flex size-6 shrink-0 items-center justify-center rounded-chip text-xs font-bold ${s.state === 'done' ? 'bg-ok text-on-primary' : s.state === 'now' ? 'bg-primary text-on-primary' : 'bg-surface text-faint'}`}>{s.state === 'done' ? '✓' : i + 1}</span>
              <span className="flex flex-col leading-tight">
                <span className={`text-sm whitespace-nowrap ${s.state === 'now' ? 'font-bold text-text' : s.state === 'done' ? 'text-muted' : 'text-faint'}`}>{s.label}</span>
                {s.note && <span className="text-xs whitespace-nowrap text-faint">{s.note}</span>}
              </span>
            </>
          );
          const cls = `flex items-center gap-2 rounded-button px-2.5 py-1.5 ${s.state === 'now' ? 'bg-primary-tint' : ''}`;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="text-faint">›</span>}
              {s.href && s.state !== 'now' ? (
                <Link href={s.href} className={`${cls} hover:bg-surface`}>
                  {body}
                </Link>
              ) : (
                <span aria-current={s.state === 'now' ? 'step' : undefined} className={cls}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
    </>
  );
}
