// 교육 한 번 (직원, 묶음 33) — 내용 · 현장 사진을 보고 확인 · 서명. 본인이 대상일 때만 열린다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCourses, loadPhotos, loadSession } from '@/lib/training-data';
import { sessionHours } from '@/lib/training-rules';
import { SignBox } from '../SignBox';

export default async function MyTrainingSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t, f, s] = await Promise.all([getTranslations('training'), getFormatter(), loadSession(id)]);
  if (!s || s.cancelled) notFound();
  const { data: mine } = await createAdminClient().from('training_attendees').select('signed_at, removed_at, signature_svg').eq('session_id', id).eq('employee_id', me.id).maybeSingle();
  if (!mine || mine.removed_at) notFound();
  const [courses, photos] = await Promise.all([loadCourses(), loadPhotos([id])]);
  const course = courses.find((c) => c.id === s.courseId);
  const hours = sessionHours(s);
  return (
    <PageShell>
      <Link href="/punch/training" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('title')}</Link>
      <h1 className="text-2xl font-bold">{course?.name}</h1>
      <p className="num text-sm text-muted">
        {f.dateTime(new Date(`${s.heldOn}T00:00:00+09:00`), { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
        {s.startTime && ` · ${s.startTime}~${s.endTime}`}
        {hours !== null && ` (${t('hoursValue', { n: hours })})`}
      </p>
      {(s.instructor || s.place) && <p className="text-sm text-muted">{[s.instructor && t('instructorValue', { v: s.instructor }), s.place].filter(Boolean).join(' · ')}</p>}
      {s.content && <Card><p className="text-sm whitespace-pre-wrap">{s.content}</p></Card>}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/api/admin/training/photo?id=${p.id}`} alt={p.fileName} className="aspect-square w-full rounded-button border border-border object-cover" />
          ))}
        </div>
      )}
      <Card className="flex flex-col gap-3">
        {mine.signed_at ? (
          <div className="flex flex-col gap-2">
            <Chip tone="ok">{t('signedAt', { at: f.dateTime(new Date(mine.signed_at as string), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</Chip>
            {mine.signature_svg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/training?session=${id}&employee=${me.id}`} alt={t('mySignature')} className="h-16 self-start rounded border border-border bg-bg" />
            )}
          </div>
        ) : (
          <SignBox sessionId={id} needDrawing={!!course?.signatureRequired} />
        )}
      </Card>
    </PageShell>
  );
}
