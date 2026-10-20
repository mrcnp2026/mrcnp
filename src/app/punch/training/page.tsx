// 내 교육 (직원, 묶음 33) — 서명할 교육이 위, 끝난 교육이 아래. 누르면 내용을 보고 서명한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCourses } from '@/lib/training-data';

export default async function MyTrainingPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f] = await Promise.all([getTranslations('training'), getFormatter()]);
  const db = createAdminClient();
  const { data: rows } = await db.from('training_attendees').select('session_id, signed_at').eq('employee_id', me.id).is('removed_at', null);
  const ids = (rows ?? []).map((r) => r.session_id as string);
  const { data: sessions } = ids.length ? await db.from('training_sessions').select('id, course_id, held_on, cancelled_at').in('id', ids).eq('is_test', OFFICE.practiceMode).is('cancelled_at', null).order('held_on', { ascending: false }) : { data: [] };
  const courses = new Map((await loadCourses()).map((c) => [c.id, c.name]));
  const list = (sessions ?? []).map((s) => ({ id: s.id as string, name: courses.get(s.course_id as string) ?? '', heldOn: s.held_on as string, signedAt: ((rows ?? []).find((r) => r.session_id === s.id)?.signed_at as string | null) ?? null }));
  const todo = list.filter((x) => !x.signedAt), done = list.filter((x) => x.signedAt);
  const line = (x: (typeof list)[number]) => (
    <li key={x.id}>
      <Link href={`/punch/training/${x.id}`} className="flex items-center gap-3 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{x.name}</span>
          <span className="num text-xs text-muted">{f.dateTime(new Date(`${x.heldOn}T00:00:00+09:00`), { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </span>
        {x.signedAt ? <Chip tone="ok">{t('signed')}</Chip> : <Chip tone="warn">{t('toSign')}</Chip>}
      </Link>
    </li>
  );
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {list.length === 0 && <Card><p className="py-6 text-center text-sm text-faint">{t('empty')}</p></Card>}
      {todo.length > 0 && (
        <Card>
          <p className="pb-1 text-sm font-bold text-warn">{t('todoTitle', { n: todo.length })}</p>
          <ul className="flex flex-col divide-y divide-border">{todo.map(line)}</ul>
        </Card>
      )}
      {done.length > 0 && (
        <Card>
          <p className="pb-1 text-sm font-bold">{t('doneTitle')}</p>
          <ul className="flex flex-col divide-y divide-border">{done.map(line)}</ul>
        </Card>
      )}
    </PageShell>
  );
}
