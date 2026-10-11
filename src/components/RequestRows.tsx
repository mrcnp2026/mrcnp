// 요청 한 줄 (의뢰인 2026-10-10: 시프티의 요청 목록처럼) — 종류 아이콘 · 「종류 · 구분」 · 내용 · 상태 배지 · 처리한 사람·시각 · 「2일 전」.
// 직원의 「내 요청」과 관리자의 「완료」가 같이 쓴다 (관리자 쪽은 누구의 요청인지 이름이 붙는다).
import { CalendarDays, CalendarRange, CalendarX, Clock, MapPin, MapPinOff, PencilLine, type LucideIcon } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RowList } from '@/components/list';
import { Chip } from '@/components/ui';
import { leaveTypeName } from '@/lib/leave';
import { ago, type ReqItem, type ReqKind } from '@/lib/requests';

const ICON: Record<ReqKind, LucideIcon> = { correction: PencilLine, overtime: Clock, leave: CalendarDays, work: MapPin, punch: MapPinOff, shift: CalendarRange, leaveDelete: CalendarX };

export async function RequestRows({ items, leaveTypes, names, showName = false, hrefOf, table = false }: {
  items: ReqItem[];
  leaveTypes: { code: string; name: string }[];
  names: Map<string, string>;
  showName?: boolean;
  hrefOf: (r: ReqItem) => string;
  table?: boolean; // PC 표 모양 (시프티의 「요청 내역」 표) — 줄 끝의 [처리]를 누르면 그 요청의 상세가 열린다
}) {
  const [t, tco, tl, tw, f] = await Promise.all([getTranslations('requests'), getTranslations('corrections'), getTranslations('leave'), getTranslations('work'), getFormatter()]);
  const SHIFT_KIND = new Set(['normal', 'deemed', 'outside', 'remote', 'holiday', 'extra']);
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: d.slice(0, 4) === thisYear ? undefined : 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const clock = (iso: string) => f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const stamp = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const range = (r: ReqItem) => `${r.date === r.endDate ? day(r.date) : `${day(r.date)} ~ ${day(r.endDate)}`}${r.startTime ? ` ${r.startTime} - ${r.endTime}` : ''}`;
  const sub = (r: ReqItem) =>
    r.kind === 'punch' ? null : r.kind === 'shift' ? (r.sub && SHIFT_KIND.has(r.sub) ? t(`shiftKind.${r.sub}`) : null) : r.kind === 'correction' ? (r.sub ? tco(`type.${r.sub}`) : null) : r.kind === 'leave' || r.kind === 'leaveDelete' ? (r.sub ? leaveTypeName(leaveTypes, r.sub, tl) : null) : r.kind === 'work' ? (r.sub ? tw(`kind.${r.sub}`) : null) : null;
  const detail = (r: ReqItem) =>
    r.kind === 'punch'
      ? `${day(r.date)}${r.newAt ? ` ${clock(r.newAt)}` : ''} · ${r.meters !== null && r.sub === 'outside' ? t('punchFar', { m: r.meters }) : t(`punchWhy.${r.sub ?? 'no_fix'}`)}`
      : r.kind === 'correction'
      ? `${day(r.date)}${r.punchKind ? ` · ${t(`punch.${r.punchKind}`)}` : ''}${r.newAt ? ` ${clock(r.newAt)}` : ''}`
      : r.kind === 'overtime'
        ? `${day(r.date)} · ${t('minutes', { h: Math.floor((r.minutes ?? 0) / 60), m: (r.minutes ?? 0) % 60 })}`
        : r.kind === 'leave' || r.kind === 'leaveDelete'
          ? `${range(r)} · ${t('days', { n: f.number(r.days ?? 0, { maximumFractionDigits: 4 }) })}`
          : `${range(r)}${r.place ? ` · ${r.place}` : ''}`;

  if (table) {
    const th = 'px-3 py-2 text-left whitespace-nowrap';
    const td = 'px-4 py-2.5 align-middle';
    return (
      <div className="overflow-x-auto border-t border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[t('colKind'), t('colWho'), t('colWhat'), t('colReason'), t('colStatus'), t('colAsked'), t('colManage')].map((x) => (
                <th key={x} scope="col" className={th}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const who = r.decidedBy ? names.get(r.decidedBy) : null;
              const label = sub(r);
              return (
                <tr key={r.key}>
                  <td className={`${td} font-bold whitespace-nowrap`}>
                    <Link href={hrefOf(r)} className="hover:text-primary">
                      {r.kind === 'punch' ? t(`punchKind.${r.punchKind ?? 'in'}`) : t(`kinds.${r.kind}`)}
                    </Link>
                    {label && <span className="block text-xs font-normal text-muted">{label}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{names.get(r.employeeId) ?? ''}</td>
                  <td className={`${td} num`}>
                    {r.kind === 'correction' && r.oldAt ? (
                      <>
                        {day(r.date)}
                        {r.punchKind ? ` · ${t(`punch.${r.punchKind}`)} ` : ' '}
                        <s className="text-muted">{clock(r.oldAt)}</s>
                        {' → '}
                        <span className="font-bold text-primary">{r.newAt ? clock(r.newAt) : 'X'}</span>
                      </>
                    ) : (
                      detail(r)
                    )}
                  </td>
                  <td className={`${td} max-w-64 truncate text-muted`}>{r.reason ?? ''}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${r.status}`)}</Chip>
                    {r.status !== 'pending' && who && <span className="num ml-2 text-xs text-muted">{t('by', { name: who })}</span>}
                  </td>
                  <td className={`${td} num whitespace-nowrap text-muted`}>{r.createdAt ? stamp(r.createdAt) : ''}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={hrefOf(r)} className="inline-flex h-8 items-center rounded-button border border-primary bg-bg px-4 text-sm font-bold text-primary hover:bg-primary-tint">
                      {t('open')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <RowList>
      {items.map((r) => {
        const Icon = ICON[r.kind];
        const a = ago(now, r.status === 'pending' ? r.createdAt : (r.decidedAt ?? r.createdAt));
        const who = r.decidedBy ? names.get(r.decidedBy) : null;
        const label = sub(r);
        return (
          <li key={r.key}>
            <Link href={hrefOf(r)} className="flex items-start gap-3 px-5 py-3">
              <span aria-hidden className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-chip bg-surface text-muted">
                <Icon size={22} strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold">
                    {r.kind === 'punch' ? t(`punchKind.${r.punchKind ?? 'in'}`) : t(`kinds.${r.kind}`)}
                    {label && ` · ${label}`}
                    {showName && ` · ${names.get(r.employeeId) ?? ''}`}
                  </span>
                  {a && <span className="num shrink-0 text-sm text-muted">{a.unit === 'now' ? t('ago.now') : t(`ago.${a.unit}`, { n: a.n })}</span>}
                </span>
                {r.kind === 'correction' && r.oldAt ? (
                  <span className="num text-sm">
                    {day(r.date)}
                    {r.punchKind ? ` · ${t(`punch.${r.punchKind}`)} ` : ' '}
                    <s className="text-muted">{clock(r.oldAt)}</s>
                    {' → '}
                    <span className="font-bold text-primary">{r.newAt ? clock(r.newAt) : 'X'}</span>
                  </span>
                ) : (
                  <span className="num text-sm">{detail(r)}</span>
                )}
                {r.reason && <span className="truncate text-sm text-muted">{r.reason}</span>}
                <span className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Chip tone={r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${r.status}`)}</Chip>
                  {r.status !== 'pending' && who && <span>{t('by', { name: who })}</span>}
                  {r.status !== 'pending' && r.decidedAt && <span className="text-muted">| {stamp(r.decidedAt)}</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </RowList>
  );
}
