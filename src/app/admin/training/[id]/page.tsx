// 교육 한 번 — 내용 · 대상과 서명 · 현장 사진 · 다시 알림 · 고치기 · 취소 (묶음 33, 2026-10-20). 관리자만.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { toKstDate } from '@/lib/time';
import { loadAttendees, loadCourses, loadPhotos, loadSession, MAX_PHOTOS, trainingPeople } from '@/lib/training-data';
import { sessionHours } from '@/lib/training-rules';
import { AddAttendee, AttendeeActions, Photos, SessionActions, SessionForm } from '../TrainingForms';

export default async function TrainingSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.role !== 'admin') redirect('/punch');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t, f, s] = await Promise.all([getTranslations('admin.training'), getFormatter(), loadSession(id)]);
  if (!s) notFound();
  const [courses, people, attendees, photos] = await Promise.all([loadCourses(), trainingPeople(), loadAttendees([id]), loadPhotos([id])]);
  const course = courses.find((c) => c.id === s.courseId);
  const who = new Map(people.map((p) => [p.id, p]));
  const rows = attendees.sort((a, b) => Number(!!a.removed) - Number(!!b.removed) || Number(!!a.signedAt) - Number(!!b.signedAt) || (who.get(a.employeeId)?.name ?? '').localeCompare(who.get(b.employeeId)?.name ?? '', 'ko'));
  const live = rows.filter((a) => !a.removed);
  const signed = live.filter((a) => a.signedAt).length;
  const hours = sessionHours(s);

  return (
    <PageShell wide>
      <Link href="/admin/training" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('title')}</Link>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{course?.name}</h1>
        {s.cancelled ? <Chip tone="neutral">{t('cancelled')}</Chip> : <Chip tone={signed === live.length && live.length ? 'ok' : 'warn'}>{t('signedValue', { signed, all: live.length })}</Chip>}
        {course?.signatureRequired && <Chip tone="info">{t('signatureOn')}</Chip>}
      </header>
      <p className="num text-sm text-muted">
        {s.heldOn}
        {s.startTime && ` · ${s.startTime}~${s.endTime}`}
        {hours !== null && ` (${t('hoursValue', { n: hours })})`}
        {s.instructor && ` · ${t('instructorValue', { v: s.instructor })}`}
        {s.place && ` · ${s.place}`}
      </p>
      {s.content && <Card><p className="text-sm whitespace-pre-wrap">{s.content}</p></Card>}

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('attendeesTitle', { n: live.length })}</CardTitle>
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm ${a.removed ? 'opacity-60' : ''}`}>
              <span className="w-24 shrink-0 font-semibold">{who.get(a.employeeId)?.name ?? ''}</span>
              <span className="min-w-0 flex-1">
                {a.removed ? (
                  <span className="text-faint">{t('removed')}</span>
                ) : a.signedAt ? (
                  <span className="num text-ok">{t('signedAt', { at: f.dateTime(new Date(a.signedAt), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })} · {t(a.signMethod === 'ADMIN' ? 'byPaper' : 'byApp')}{a.signedNote ? ` · ${a.signedNote}` : ''}</span>
                ) : (
                  <span className="text-warn">{t('notSigned')}</span>
                )}
              </span>
              {a.hasSignature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/training?session=${id}&employee=${a.employeeId}`} alt={t('signatureAlt')} className="h-8 rounded border border-border bg-bg" />
              )}
              {!s.cancelled && <AttendeeActions sessionId={id} employeeId={a.employeeId} signed={!!a.signedAt} removed={a.removed} />}
            </li>
          ))}
        </ul>
        {!s.cancelled && (
          <>
            <AddAttendee sessionId={id} options={people.filter((p) => p.active && !attendees.some((a) => a.employeeId === p.id)).map((p) => ({ id: p.id, label: p.name }))} />
            <SessionActions sessionId={id} unsigned={live.length - signed} />
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('photosTitle', { n: photos.length, max: MAX_PHOTOS })}</CardTitle>
        <Photos sessionId={id} photos={photos.map((p) => ({ id: p.id, fileName: p.fileName }))} max={s.cancelled ? photos.length : MAX_PHOTOS} />
      </Card>

      {!s.cancelled && (
        <details className="rounded-card border border-border bg-bg px-4 py-3">
          <summary className="cursor-pointer font-bold">{t('editSession')}</summary>
          <div className="pt-3">
            <SessionForm courses={courses} people={[]} today={toKstDate(new Date())} initial={s} />
          </div>
        </details>
      )}
    </PageShell>
  );
}
