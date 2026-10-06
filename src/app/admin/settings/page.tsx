// 설정 (더보기 › 설정) — 근무시간 · 휴일 · 사무실 인터넷 주소를 화면에서 바꾼다 (2026-10-05: 지금까지는 개발자가 DB·열쇠 파일을 고쳐야 했다).
// 근무시간은 이력이다: 고치지 않고 "언제부터 적용"되는 새 규칙을 넣는다 (② 4-1). 휴일·주소는 지우지 않고 빼거나 끈다 (변경 기록에 남는다).
import { getFormatter, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { addDays } from '@/lib/calendar';
import { createAdminClient } from '@/lib/supabase/admin';
import { hhmm, toKstDate } from '@/lib/time';
import { isOfficeIp, parseCidr, traceClientIp } from '@/lib/verify-location';
import { loadOfficeLocations } from '@/lib/geo-data';
import { ConfirmButton, HolidayForm, LocationForm, NetworkForm, RuleForm } from './SettingsForms';

export default async function SettingsPage() {
  const t = await getTranslations('admin.settings');
  const tm = await getTranslations('admin.more');
  const f = await getFormatter();
  const today = toKstDate(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const db = createAdminClient();
  const [{ data: rules }, { data: holidays }, { data: networks }] = await Promise.all([
    db.from('work_rules').select('id, start_time, end_time, late_grace_min, break_start, break_end, workdays, weekly_rest_day, effective_from').eq('active', true).order('effective_from', { ascending: false }),
    db.from('holidays').select('the_date, label, kind').gte('the_date', monthStart).order('the_date').limit(60),
    db.from('office_networks').select('id, cidr, label, active').order('created_at'),
  ]);
  // 검사 스크립트가 넣었다 끈 위치(메모가 e2e-…)는 목록에 보이지 않게
  const locations = (await loadOfficeLocations(true)).filter((l) => l.active || !l.label?.startsWith('e2e-'));
  const current = (rules ?? []).find((r) => r.effective_from <= today) ?? null;
  const upcoming = (rules ?? []).filter((r) => r.effective_from > today).reverse();
  // 2024-01-01은 월요일 — 요일 이름(월…일)을 화면 언어로
  const weekdays = [...Array(7)].map((_, i) => f.dateTime(new Date(`2024-01-0${i + 1}T12:00:00+09:00`), { weekday: 'short' }));
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const ruleLine = (r: NonNullable<typeof current>) => (
    <dl className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted">{t('hours')}</dt>
      <dd>{hhmm(r.start_time)} ~ {hhmm(r.end_time)}</dd>
      <dt className="text-muted">{t('break')}</dt>
      <dd>{r.break_start && r.break_end ? `${hhmm(r.break_start)} ~ ${hhmm(r.break_end)}` : t('none')}</dd>
      <dt className="text-muted">{t('graceShort')}</dt>
      <dd>{t('minutes', { n: r.late_grace_min })}</dd>
      <dt className="text-muted">{t('workdays')}</dt>
      <dd>{(r.workdays as number[]).map((d) => weekdays[d - 1]).join(' · ')}</dd>
      <dt className="text-muted">{t('restDay')}</dt>
      <dd>{weekdays[r.weekly_rest_day - 1]}</dd>
    </dl>
  );
  const trace = traceClientIp(await headers(), OFFICE.ipHeaderOrder);
  const activeCidrs = [...(networks ?? []).filter((n) => n.active).map((n) => String(n.cidr)), ...OFFICE.allowedCidrs].filter((c) => parseCidr(c));
  const here = isOfficeIp(trace.ip, activeCidrs);
  const base = current ?? upcoming[0] ?? null;

  return (
    <PageShell>
      <Link href="/admin/more" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('back')}
      </Link>
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('title')}</h1>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('ruleTitle')}</CardTitle>
        {current ? (
          <>
            <p className="text-xs text-faint">{t('since', { date: day(current.effective_from) })}</p>
            {ruleLine(current)}
          </>
        ) : (
          <p className="rounded-button bg-warn-tint p-3 text-sm text-warn">{t('ruleNone')}</p>
        )}
        {upcoming.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-button bg-primary-tint p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-primary">{t('upcoming', { date: day(r.effective_from) })}</p>
              <ConfirmButton body={{ action: 'rule.hide', id: r.id }} label={t('ruleHide')} confirmLabel={t('ruleHideConfirm')} ariaLabel={t('ruleHideOf', { date: r.effective_from })} />
            </div>
            {ruleLine(r)}
          </div>
        ))}
        <RuleForm
          tomorrow={addDays(today, 1)}
          weekdays={weekdays}
          initial={{
            startTime: base ? hhmm(base.start_time) : '09:00', endTime: base ? hhmm(base.end_time) : '18:00', lateGraceMin: base?.late_grace_min ?? 0,
            breakStart: base?.break_start ? hhmm(base.break_start) : '', breakEnd: base?.break_end ? hhmm(base.break_end) : '',
            workdays: (base?.workdays as number[] | undefined) ?? [1, 2, 3, 4, 5], weeklyRestDay: base?.weekly_rest_day ?? 7,
          }}
        />
        <p className="text-xs text-faint">{t('ruleNote')}</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle aside={<span className="num text-sm text-faint">{holidays?.length ?? 0}</span>}>{t('holidayTitle')}</CardTitle>
        {(holidays ?? []).length === 0 && <p className="text-sm text-faint">{t('holidayNone')}</p>}
        <ul className="divide-y divide-border">
          {(holidays ?? []).map((h) => (
            <li key={h.the_date} className="flex min-h-12 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="num block text-sm">{day(h.the_date)}</span>
                <span className="block truncate text-xs text-muted">{h.label}</span>
              </span>
              {h.kind === 'company' && <Chip tone="info">{t('kind.company')}</Chip>}
              <ConfirmButton body={{ action: 'holiday.remove', date: h.the_date }} label={t('remove')} confirmLabel={t('removeConfirm')} ariaLabel={t('removeOf', { what: `${h.the_date} ${h.label}` })} />
            </li>
          ))}
        </ul>
        <HolidayForm monthStart={monthStart} />
        <p className="text-xs text-faint">{t('holidayNote')}</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle>{t('networkTitle')}</CardTitle>
        <p className={`rounded-button p-3 text-sm ${here ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'}`}>
          {trace.ip ? t(here ? 'hereYes' : 'hereNo', { ip: trace.ip }) : t('hereUnknown')}
        </p>
        {(networks ?? []).length === 0 && OFFICE.allowedCidrs.length === 0 && <p className="text-sm text-faint">{t('networkNone')}</p>}
        <ul className="divide-y divide-border">
          {/* 검사 스크립트가 넣었다 끈 주소(메모가 e2e-…)는 목록에 보이지 않게 — 검사 계정·검사 그룹과 같은 규칙 */}
          {(networks ?? []).filter((n) => n.active || !n.label?.startsWith('e2e-')).map((n) => (
            <li key={n.id} className={`flex min-h-12 items-center gap-2 ${n.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1">
                <span className="num block truncate text-sm">{String(n.cidr)}</span>
                {n.label && <span className="block truncate text-xs text-muted">{n.label}</span>}
              </span>
              {!n.active && <Chip>{t('off')}</Chip>}
              {n.active ? (
                <ConfirmButton body={{ action: 'network.toggle', id: n.id, active: false }} label={t('turnOff')} confirmLabel={t('turnOffConfirm')} ariaLabel={t('turnOffOf', { what: String(n.cidr) })} />
              ) : (
                <ConfirmButton body={{ action: 'network.toggle', id: n.id, active: true }} label={t('turnOn')} confirmLabel={t('turnOn')} ariaLabel={t('turnOnOf', { what: String(n.cidr) })} />
              )}
            </li>
          ))}
          {OFFICE.allowedCidrs.map((c) => (
            <li key={c} className="flex min-h-12 items-center gap-2">
              <span className="num min-w-0 flex-1 truncate text-sm">{c}</span>
              <Chip>{t('fromEnv')}</Chip>
            </li>
          ))}
        </ul>
        <NetworkForm currentIp={trace.ip} currentKnown={here} />
        <p className="text-xs text-faint">{t('networkNote')}</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle>{t('locationTitle')}</CardTitle>
        <p className={`rounded-button p-3 text-sm ${locations.some((l) => l.active) ? 'bg-ok-tint text-ok' : 'bg-surface text-muted'}`}>{t(locations.some((l) => l.active) ? 'gpsOn' : 'gpsOff')}</p>
        <ul className="divide-y divide-border">
          {locations.map((l) => (
            <li key={l.id} className={`flex min-h-12 items-center gap-2 ${l.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1">
                <span className="num block truncate text-sm">{l.lat.toFixed(5)}, {l.lng.toFixed(5)} · {t('radiusM', { n: l.radiusM })}</span>
                {l.label && <span className="block truncate text-xs text-muted">{l.label}</span>}
              </span>
              {!l.active && <Chip>{t('off')}</Chip>}
              {l.active ? (
                <ConfirmButton body={{ action: 'location.toggle', id: l.id, active: false }} label={t('turnOff')} confirmLabel={t('turnOffConfirm')} ariaLabel={t('turnOffOf', { what: l.label ?? t('locationTitle') })} />
              ) : (
                <ConfirmButton body={{ action: 'location.toggle', id: l.id, active: true }} label={t('turnOn')} confirmLabel={t('turnOn')} ariaLabel={t('turnOnOf', { what: l.label ?? t('locationTitle') })} />
              )}
            </li>
          ))}
        </ul>
        <LocationForm />
        <p className="text-xs text-faint">{t('locationNote')}</p>
      </Card>
      {/* 진단 — 사무실 확인이 이상할 때만 보는 화면이라 메뉴에서 빼고 여기에 둔다 (2026-10-06) */}
      <Link href="/admin/diag" className="inline-flex min-h-11 items-center self-start px-1 text-sm text-muted">
        {tm('diag')} · {tm('diagHint')} ›
      </Link>
    </PageShell>
  );
}
