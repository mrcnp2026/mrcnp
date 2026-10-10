// 출퇴근기록 한 건의 상세 (2026-10-11 의뢰인: 시프티의 출퇴근기록 상세처럼) — 큰 시각 · 날짜 · 근무/휴게 → 「항목 — 값」 줄.
// 보여 주기만 한다. [수정]은 그 직원의 그 달 기록 화면(정정·대리 입력이 있는 곳)으로 간다 — 고치는 길은 정정뿐이다 (4-8).
// 「출근 장소 · 퇴근 장소」: 위치로 확인된 기록은 그 출퇴근 장소의 이름, 그 밖에는 확인한 방법(사무실 인터넷 · 확인 안 됨 · 관리자 등록 · 정정)을 적는다.
// 기록 확정([확정하기])은 아직 없다 (할일 「나. 출퇴근기록」).
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailBar, Field, FieldList } from '@/components/detail';
import { Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { loadJobs } from '@/lib/job-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { daysFor, loadPeriod, type EventRow } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { kstDateTime, toKstDate } from '@/lib/time';

export default async function RecordDetailPage({ params, searchParams }: { params: Promise<{ id: string; date: string }>; searchParams: Promise<{ i?: string; live?: string }> }) {
  const [t, tr, f, { id, date }, sp] = await Promise.all([getTranslations('admin.recordDetail'), getTranslations('records'), getFormatter(), params, searchParams]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) notFound();
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const liveQ = sp.live === '1' ? '&live=1' : '';
  const [data, groups, jobs, { data: places }] = await Promise.all([loadPeriod(date, date, practice), loadOrgGroups(), loadJobs(), createAdminClient().from('office_locations').select('id, label')]);
  const placeName = new Map((places ?? []).map((x) => [x.id as string, x.label as string | null]));
  const person = data.people.find((p) => p.id === id);
  const day = person && data.rule ? daysFor(data, id, date, date)[0] : undefined;
  const idx = Math.max(0, Number.parseInt(sp.i ?? '0', 10) || 0);
  const pair = day?.pairs[idx];
  if (!person || !day || !pair || (!pair.in && !pair.out)) notFound();

  const clock = (d: Date) => f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dur = (min: number) => tr('hm', { h: Math.floor(min / 60), m: min % 60 });
  const events = data.events.filter((e) => e.employeeId === id);
  const eventAt = (d: Date | null): EventRow | undefined => (d ? events.find((e) => e.punchedAt.getTime() === d.getTime()) : undefined);
  // 찍은 기록이 없는 시각 = 정정으로 들어온 시각이거나 간주 근무로 채운 시각
  const real = events.some((e) => e.workDate === date) || data.corrections.some((c) => c.employeeId === id && c.workDate === date && c.status === 'approved');
  const plan = data.planFor(id, date);
  const deemed = !real && !!plan.deemed;
  const via = (d: Date | null) => {
    if (!d) return t('none');
    if (deemed) return t('viaDeemed');
    const e = eventAt(d);
    if (!e) return t('viaFix');
    if (e.source === 'admin') return t('viaAdmin');
    if (e.verifiedBy === 'gps' && e.locationId && placeName.get(e.locationId)) return placeName.get(e.locationId) as string;
    return t(e.verifiedBy === 'ip' ? 'viaIp' : e.verifiedBy === 'gps' ? 'viaGps' : 'viaNone');
  };
  const job = person.jobId ? jobs.find((j) => j.id === person.jobId) : undefined;
  const branch = groupPath(groups, person.groupId);
  const open = !!pair.in && !pair.out;
  const made = eventAt(pair.in) ?? eventAt(pair.out);
  const others = day.pairs.map((p, i) => ({ p, i })).filter((x) => x.i !== idx && (x.p.in || x.p.out));

  return (
    <PageShell>
      <DetailBar back={`/admin/records/list?from=${date}&to=${date}${liveQ}`} backLabel={t('back')} title={t('title')} action={{ href: `/admin/records/${id}?m=${date.slice(0, 7)}${liveQ}`, label: t('edit') }} />
      <section className="-mx-4 -mt-3 flex flex-col gap-1 border-b border-border bg-bg px-5 py-5 lg:mx-0 lg:mt-0 lg:rounded-card lg:border">
        <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-extrabold tracking-tight">
          <span>
            {pair.in ? clock(pair.in) : '–'} - {pair.out ? clock(pair.out) : ''}
          </span>
          {deemed && <Chip>{t('deemed')}</Chip>}
          {open && date === toKstDate(new Date()) && <Chip tone="info">{t('working')}</Chip>}
          {open && date !== toKstDate(new Date()) && <Chip tone="warn">{t('noOut')}</Chip>}
        </p>
        <p className="num text-muted">{f.dateTime(kstDateTime(date, '12:00'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</p>
        <p className="num font-medium">
          {t('work', { t: dur(day.netMinutes) })} / {t('break', { t: dur(day.breakMinutes) })}
        </p>
      </section>
      <FieldList>
        <Field label={t('employee')} value={person.name} href={`/admin/members/${id}`} />
        <Field label={t('branch')} value={branch ?? t('none')} href={branch ? '/admin/branches' : undefined} />
        <Field label={t('job')} value={job?.name ?? t('none')} href={job ? `/admin/jobs/${job.id}` : undefined} />
        <Field label={t('breakTime')} value={dur(day.breakMinutes)} />
        <Field label={t('schedule')} value={plan.items.length > 0 ? plan.items.map((it) => `${it.startTime} - ${it.endTime}`).join(', ') : t('noSchedule')} href={plan.items.length > 0 ? `/admin/schedule?d=${date}` : undefined} />
      </FieldList>
      <FieldList>
        <Field label={t('inPlace')} value={via(pair.in)} />
        <Field label={t('outPlace')} value={via(pair.out)} />
      </FieldList>
      <FieldList>
        <Field label={t('created')} value={made ? f.dateTime(made.punchedAt, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }) : t('none')} />
      </FieldList>
      {others.length > 0 && (
        <FieldList>
          {others.map(({ p, i }) => (
            <Field key={i} label={t('other')} value={`${p.in ? clock(p.in) : '–'} - ${p.out ? clock(p.out) : ''}`} href={`/admin/records/${id}/${date}?i=${i}${liveQ}`} />
          ))}
        </FieldList>
      )}
      <p className="px-1 text-sm text-faint">
        {t('hint')}{' '}
        <Link href={`/admin/records/${id}?m=${date.slice(0, 7)}${liveQ}`} className="font-medium text-primary">
          {t('toMonth')} ›
        </Link>
      </p>
    </PageShell>
  );
}
