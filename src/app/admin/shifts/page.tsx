// 근무일정 틀 관리 (의뢰인 2026-10-10: 시프티의 「근무일정 템플릿 관리」처럼) — 색 · 이름 · [유형] 시각 · 적용 인원.
// 07:30·07:40·07:50 시작처럼 필요한 만큼 만들어 직원별로 적용한다. 틀이 없는 직원은 회사 근무규칙(회사 설정)의 시각을 쓴다.
import { getShiftKindNames } from '@/lib/settings';
import { withKindNames } from '@/lib/shift-kind-names';
import { toKstDate } from '@/lib/time';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddSheet } from '@/components/AddSheet';
import { PcTable } from '@/components/PcTable';
import { DetailBar } from '@/components/detail';
import { Help } from '@/components/Help';
import { RowList } from '@/components/list';
import { Card, PageShell } from '@/components/ui';
import { loadActiveRule } from '@/lib/attendance-data';
import { loadShiftTemplates } from '@/lib/shift-data';
import { hhmm, SHIFT_COLOR_CLASS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShiftForm, ShiftSwitch } from './ShiftForms';

export default async function ShiftsPage() {
  const t = await getTranslations('admin.shifts');
  const kindNames = await getShiftKindNames(toKstDate(new Date()));
  const kn = withKindNames((k: string) => t(`kinds.${k}`), kindNames);
  const tc = await getTranslations('common');
  const ts = await getTranslations('side');
  const [all, { data: people }, rule] = await Promise.all([
    loadShiftTemplates(true),
    createAdminClient().from('profiles').select('shift_template_id').eq('active', true),
    loadActiveRule(),
  ]);
  const countOf = new Map<string, number>();
  let none = 0;
  for (const p of people ?? []) {
    if (p.shift_template_id) countOf.set(p.shift_template_id, (countOf.get(p.shift_template_id) ?? 0) + 1);
    else none++;
  }
  // 켜진 템플릿이 먼저, 꺼 둔 것은 아래에 흐리게 — 「비활성화 보기」 탭 대신 템플릿마다 스위치로 켜고 끈다 (2026-10-25 의뢰인). 검사 스크립트가 만든 e2e-… 는 뺀다
  const shown = [...all].filter((x) => x.active || !x.name.startsWith('e2e-')).sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <PageShell wide>
      <DetailBar sheet={{ id: 'shift', label: t('add'), mobile: tc('addShort') }} back="/admin/console" backLabel={tc('back')} menuLabel={ts('menu')} title={t('title')} extra={<Help>{t('intro')}</Help>} desc={t('intro')} />
      <div className="grid grid-cols-1 items-start gap-3">
        {/* PC: 시프티의 목록 — 「비활성화된 … 보기」 토글 + 열마다 검색 · 정렬이 되는 표 (2026-10-11 의뢰인 스샷). 폰은 아래의 탭 + 줄 목록 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <PcTable
            labels={{ search: tc('colSearch'), empty: t('empty') }}
            cols={[{ key: 'name', label: t('colName') }, { key: 'time', label: t('colTime') }, { key: 'kind', label: t('colKind') }, { key: 'color', label: t('colColor'), search: false, sort: false }, { key: 'people', label: t('colPeople'), align: 'right' }, { key: 'memo', label: t('colMemo') }, { key: 'use', label: t('colUse'), search: false, sort: false, align: 'center' }]}
            rows={shown.map((x) => ({
              id: x.id,
              dim: !x.active,
              cells: {
                name: { text: x.name, node: <Link href={`/admin/shifts/${x.id}`} className="font-bold hover:text-primary">{x.name}</Link> },
                time: { text: `${x.startTime} - ${x.endTime}`, node: <span className="num">{x.startTime} - {x.endTime}</span> },
                kind: { text: x.kind !== 'none' ? kn(x.kind) : '' },
                color: { text: x.color, node: <span aria-hidden className={`inline-block size-5 rounded-sm align-middle ${SHIFT_COLOR_CLASS[x.color]}`} /> },
                people: { text: String(countOf.get(x.id) ?? 0) },
                memo: { text: x.memo ?? '' },
                use: { text: x.active ? '1' : '0', node: <ShiftSwitch id={x.id} name={x.name} active={x.active} /> },
              },
            }))}
          />
        </div>
        <div className="flex flex-col gap-3 lg:hidden">
          {(
            <p className="rounded-card bg-bg p-5 text-sm text-muted">
              {rule ? t('baseRule', { start: hhmm(rule.startTime), end: hhmm(rule.endTime), n: none }) : t('noRule')}{' '}
              <Link href="/admin/settings" className="font-bold text-primary">
                {t('toSettings')} ›
              </Link>
            </p>
          )}
          {shown.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>}
          <RowList>
            {shown.map((x) => (
              <li key={x.id} className={`flex items-center ${x.active ? '' : 'opacity-60'}`}>
                <Link href={`/admin/shifts/${x.id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-5">
                  <span aria-hidden className={`size-8 shrink-0 rounded-button ${SHIFT_COLOR_CLASS[x.color]}`} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{x.name}</span>
                    <span className="num text-sm text-muted">
                      {x.kind !== 'none' && `[${kn(x.kind)}] `}
                      {x.startTime} - {x.endTime}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm text-muted">{t('people', { n: countOf.get(x.id) ?? 0 })}</span>
                  <ChevronRight aria-hidden size={20} className="shrink-0 text-faint" />
                </Link>
                <span className="shrink-0 py-3 pr-4 pl-1"><ShiftSwitch id={x.id} name={x.name} active={x.active} /></span>
              </li>
            ))}
          </RowList>
        </div>
        <AddSheet id="shift" title={t('add')} modal>
          <Card className="flex flex-col gap-3">
            <ShiftForm sheet="shift" kindNames={kindNames} />
          </Card>
        </AddSheet>
      </div>
    </PageShell>
  );
}
