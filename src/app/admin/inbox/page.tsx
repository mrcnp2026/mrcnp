// ② 처리함 — 사람이 판단해야 하는 것을 한 받은함에 (마스터 5장): 연장근로 승인(7-7) · 정정 요청(7-10).
// 그날 근무노트를 연장 요청 옆에 보여 준다 (R-10-2의 8) — 사유로 자동 복사하지 않는다.
// 누가·언제 처리했는지 항상 보인다 (R-2의 5).
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pager, pageOf } from '@/components/Pager';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { loadPeriod, syncOvertimeRequests } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { CorrectionDecision, OvertimeDecision } from './Decisions';

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ practice?: string; op?: string; cp?: string }> }) {
  const t = await getTranslations('admin.inbox');
  const f = await getFormatter();
  const me = (await getMe())!;
  const sp = await searchParams;
  const practice = OFFICE.practiceMode && sp.practice === '1';
  const today = toKstDate(new Date());
  const data = await loadPeriod(addDays(today, -31), today, practice);
  await syncOvertimeRequests(data, today);

  const db = createAdminClient();
  const [{ data: ot }, { data: co }, { data: recent }] = await Promise.all([
    db.from('overtime_requests').select('*').eq('is_test', practice).or('status.eq.pending,needs_review.eq.true').order('work_date'),
    db.from('punch_corrections').select('*').eq('is_test', practice).eq('status', 'pending').order('created_at'),
    db.from('decision_log').select('subject_table, decision, decided_by, created_at, subject_id').order('created_at', { ascending: false }).limit(10),
  ]);
  const name = new Map(data.people.map((p) => [p.id, p.name]));
  const keys = [...(ot ?? []).map((o) => [o.employee_id, o.work_date]), ...(co ?? []).map((c) => [c.employee_id, c.work_date])];
  const empIds = [...new Set(keys.map((k) => k[0]))];
  const dates = [...new Set(keys.map((k) => k[1]))];
  const [{ data: notes }, { data: evs }] = await Promise.all([
    empIds.length
      ? db.from('work_notes').select('employee_id, work_date, body, created_at').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { employee_id: string; work_date: string; body: string }[] }),
    empIds.length
      ? db.from('punch_events').select('id, employee_id, work_date, kind, punched_at').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('punched_at')
      : Promise.resolve({ data: [] as { id: string; employee_id: string; work_date: string; kind: string; punched_at: string }[] }),
  ]);
  const noteOf = (e: string, d: string) => notes?.find((n) => n.employee_id === e && n.work_date === d)?.body ?? null;
  const hm = (iso: string | null) => (iso ? f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const dayLabel = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });
  const punchesOf = (e: string, d: string) =>
    (evs ?? []).filter((x) => x.employee_id === e && x.work_date === d).map((x) => `${x.kind === 'in' ? '↘' : '↗'} ${hm(x.punched_at)}`).join('  ');

  const tc = await getTranslations('common');
  const otPage = pageOf(ot ?? [], sp.op);
  const coPage = pageOf(co ?? [], sp.cp);

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}

      <section id="overtime" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          {t('overtimeTitle')} <span className="num text-base text-faint">{ot?.length ?? 0}</span>
        </h2>
        <p className="text-sm text-muted">{t('overtimeHint')}</p>
        {(ot ?? []).length === 0 && <p className="text-sm text-faint">{t('empty')}</p>}
        {otPage.items.map((o) => (
          <Card key={o.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name.get(o.employee_id)}</p>
                <p className="num text-sm text-muted">{[dayLabel(o.work_date), punchesOf(o.employee_id, o.work_date)].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {o.needs_review && <Chip tone="warn">{t('needsReview')}</Chip>}
                {o.employee_id === me.id && <Chip>{t('self')}</Chip>}
              </div>
            </div>
            <dl className="num grid grid-cols-3 gap-2 text-center">
              {(['overtime', 'night', 'holiday'] as const).map((k) => (
                <div key={k} className="rounded-button bg-surface p-2">
                  <dt className="text-xs text-muted">{t(k)}</dt>
                  <dd className="text-xl font-semibold">{t('min', { n: o[`${k}_minutes`] })}</dd>
                  {o.needs_review && o[`recomputed_${k}_minutes`] !== null && (
                    <dd className="text-xs text-warn">{t('nowCounted', { n: o[`recomputed_${k}_minutes`] })}</dd>
                  )}
                </div>
              ))}
            </dl>
            {o.reason && <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{o.reason}</p>}
            {noteOf(o.employee_id, o.work_date) && (
              <p className="rounded-button bg-surface p-2 text-sm">
                <span className="block text-xs text-muted">{t('note')}</span>
                <span className="whitespace-pre-wrap break-words">{noteOf(o.employee_id, o.work_date)}</span>
              </p>
            )}
            {o.status !== 'pending' && (
              <p className="text-xs text-muted">{t('decidedBy', { status: t(`status.${o.status}`), who: name.get(o.approved_by) ?? '—' })}</p>
            )}
            <OvertimeDecision id={o.id} name={name.get(o.employee_id) ?? ''} facts={{ overtime: o.overtime_minutes, night: o.night_minutes, holiday: o.holiday_minutes }} />
          </Card>
        ))}
        <Pager page={otPage.page} pages={otPage.pages} param="op" params={sp} anchor="overtime" label={tc('pages')} />
      </section>

      <section id="corrections" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          {t('correctionsTitle')} <span className="num text-base text-faint">{co?.length ?? 0}</span>
        </h2>
        {(co ?? []).length === 0 && <p className="text-sm text-faint">{t('empty')}</p>}
        {coPage.items.map((c) => {
          const target = c.target_id ? evs?.find((e) => e.id === c.target_id) : null;
          return (
            <Card key={c.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{name.get(c.employee_id)}</p>
                  <p className="num text-sm text-muted">{dayLabel(c.work_date)} · {t(`type.${c.correction_type}`)}</p>
                </div>
                {c.employee_id === me.id && <Chip>{t('self')}</Chip>}
              </div>
              <p className="num">
                {c.correction_type === 'add_missing' && t('addMissingLine', { kind: t(`kind.${c.kind}`), time: hm(c.new_punched_at) })}
                {c.correction_type === 'modify' && t('modifyLine', { from: hm(target?.punched_at ?? null), to: hm(c.new_punched_at) })}
                {c.correction_type === 'void' && t('voidLine', { time: hm(target?.punched_at ?? null) })}
              </p>
              <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{c.reason}</p>
              <CorrectionDecision id={c.id} name={name.get(c.employee_id) ?? ''} />
            </Card>
          );
        })}
        <Pager page={coPage.page} pages={coPage.pages} param="cp" params={sp} anchor="corrections" label={tc('pages')} />
      </section>

      {(recent ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t('recent')}</h2>
          <ul className="divide-y divide-border rounded-card border border-border px-4 text-sm">
            {(recent ?? []).map((r, i) => (
              <li key={i} className="flex min-h-11 items-center justify-between gap-2 py-2">
                <span>{t(r.subject_table === 'overtime_requests' ? 'overtimeTitle' : 'correctionsTitle')} · {t(`status.${r.decision}`)}</span>
                <span className="num text-muted">{name.get(r.decided_by)} · {f.dateTime(new Date(r.created_at), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
