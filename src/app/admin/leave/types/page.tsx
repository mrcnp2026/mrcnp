// 휴가 종류 관리 (의뢰인 2026-10-10: 시프티의 휴가 유형처럼 시간 단위로. "10시 반차 · 11시 반차 · 4시간 반차 등 상세히 구분").
// 한 줄 = 이름 · 시간 · 정해진 시각 · 유급/차감. 묶음 이름이 같은 것끼리 모아 보인다. 지우지 않고 꺼 둔다.
import { ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { OffToggle } from '@/components/OffToggle';
import { PcTable } from '@/components/PcTable';
import { DetailBar } from '@/components/detail';
import { Card, Chip, em, Explain, PageShell } from '@/components/ui';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { LeaveTypeForm } from './TypeForms';

export default async function LeaveTypesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [t, tl, f, sp] = await Promise.all([getTranslations('admin.leaveTypes'), getTranslations('leave'), getFormatter(), searchParams]);
  const tc = await getTranslations('common');
  const ts = await getTranslations('side');
  const off = sp.tab === 'off';
  const all = await loadAllLeaveTypes();
  const shown = all.filter((x) => x.active !== off && (x.active || !x.name.startsWith('e2e-')));
  const groupNames = [...new Set(all.map((x) => x.groupName).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
  // 폰 묶음 순서 = 종류의 정렬 순서(sort)에서 먼저 나오는 묶음부터 — 가나다순이면 가장 많이 쓰는 「연차휴가」가 맨 아래였다 (2026-10-18 의뢰인)
  const firstAt = (g: string) => all.findIndex((x) => x.groupName === g);
  const sections = [...[...groupNames].sort((a, b) => firstAt(a) - firstAt(b)).map((g) => ({ g, rows: shown.filter((x) => x.groupName === g) })), { g: null, rows: shown.filter((x) => !x.groupName) }].filter((s) => s.rows.length);
  const num = (v: number) => f.number(v, { maximumFractionDigits: 2 }); // 일수는 화면에 소수 둘째 자리까지 (2026-10-19 의뢰인: 15분 = 0.03125일까지 저장하지만 폰에서 칸을 넘지 않게. 저장 · 계산은 다섯째 자리 그대로)

  return (
    <PageShell wide>
      <DetailBar sheet={{ id: 'leave-type', label: t('add'), mobile: tc('addShort') }} back="/admin/console" backLabel={tc('back')} menuLabel={ts('menu')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} />
      {/* 법정 휴가 설명 (2026-10-22 디자인) — 회사가 정하는 유형과 법이 정한 유형을 나눠 보이게 */}
      <Explain>{t.rich('explain', { em })}</Explain>
      <div className="grid grid-cols-1 items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <OffToggle href={off ? '/admin/leave/types' : '/admin/leave/types?tab=off'} on={off} label={t('showOff')} />
          <PcTable
            labels={{ search: tc('colSearch'), empty: t(off ? 'emptyOff' : 'empty') }}
            cols={[{ key: 'group', label: t('colGroup') }, { key: 'name', label: t('colName') }, { key: 'time', label: t('colTime') }, { key: 'hours', label: t('colHours'), align: 'right' }, { key: 'deduct', label: t('colDeduct'), align: 'right' }, { key: 'paid', label: t('colPaid') }]}
            rows={shown.map((x) => ({
              id: x.code,
              cells: {
                group: { text: x.groupName ?? '' },
                name: { text: leaveTypeName(all, x.code, tl), node: <Link href={`/admin/leave/types/${x.code}`} className="font-bold hover:text-primary">{leaveTypeName(all, x.code, tl)}</Link> },
                time: { text: x.startTime ? `${x.startTime} - ${x.endTime}` : t('allDay') },
                hours: { text: t('hoursValue', { h: num(x.hours ?? 0) }) },
                deduct: { text: x.deductsBalance ? t('daysValue', { d: num(x.dayUnit) }) : t('noDeduct') },
                paid: { text: t(x.isPaid ? 'paidChip' : 'unpaidChip') },
              },
            }))}
          />
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {/* 폰도 PC와 같은 「꺼 둔 것 보기」 토글 (2026-10-17 의뢰인: PC · 폰 작동 방식을 같게) */}
          <OffToggle href={off ? '/admin/leave/types' : '/admin/leave/types?tab=off'} on={off} label={t('showOff')} />
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t(off ? 'emptyOff' : 'empty')}</p>}
          {sections.map((s) => (
            <section key={s.g ?? ''} className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-medium text-muted">{s.g ?? t('noGroup')}</h2>
              <RowList>
                {s.rows.map((x) => (
                  <li key={x.code}>
                    <Link href={`/admin/leave/types/${x.code}`} className="flex min-h-16 items-center gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-bold">{leaveTypeName(all, x.code, tl)}</span>
                        <span className="num text-sm text-muted">
                          {t('hoursShort', { h: num(x.hours ?? 0) })}
                          {x.startTime && ` · ${x.startTime} - ${x.endTime}`}
                          {' · '}
                          {x.deductsBalance ? t('deductShort', { d: num(x.dayUnit) }) : t('noDeduct')}
                        </span>
                      </span>
                      <Chip tone={x.isPaid ? 'ok' : 'neutral'}>{t(x.isPaid ? 'paidChip' : 'unpaidChip')}</Chip>
                      <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </RowList>
            </section>
          ))}
        </div>
        <AddSheet id="leave-type" title={t('add')} modal>
          <Card className="flex flex-col gap-3">
            <LeaveTypeForm sheet="leave-type" groups={groupNames} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
