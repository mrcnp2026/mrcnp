// 내 교육 (직원, 묶음 33) — 서명할 교육이 위, 끝난 교육이 아래. 누르면 내용을 보고 서명한다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SideFilter } from '@/components/SideFilter';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCourses } from '@/lib/training-data';

export default async function MyTrainingPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, f, sp] = await Promise.all([getTranslations('training'), getFormatter(), searchParams]);
  const db = createAdminClient();
  const { data: rows } = await db.from('training_attendees').select('session_id, signed_at').eq('employee_id', me.id).is('removed_at', null);
  const ids = (rows ?? []).map((r) => r.session_id as string);
  const { data: sessions } = ids.length ? await db.from('training_sessions').select('id, course_id, held_on, cancelled_at').in('id', ids).eq('is_test', OFFICE.practiceMode).is('cancelled_at', null).order('held_on', { ascending: false }) : { data: [] };
  const courses = new Map((await loadCourses()).map((c) => [c.id, c.name]));
  const list = (sessions ?? []).map((s) => ({ id: s.id as string, name: courses.get(s.course_id as string) ?? '', heldOn: s.held_on as string, signedAt: ((rows ?? []).find((r) => r.session_id === s.id)?.signed_at as string | null) ?? null }));
  const todo = list.filter((x) => !x.signedAt), done = list.filter((x) => x.signedAt);
  const line = (x: (typeof list)[number]) => (
    <li key={x.id}>
      <Link prefetch={false} href={`/punch/training/${x.id}`} className="flex items-center gap-3 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{x.name}</span>
          <span className="num text-xs text-muted">{f.dateTime(new Date(`${x.heldOn}T00:00:00+09:00`), { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </span>
        {x.signedAt ? <Chip tone="ok">{t('signed')}</Chip> : <Chip tone="warn">{t('toSign')}</Chip>}
      </Link>
    </li>
  );
  // PC 왼쪽 칸의 보기 (?f=todo | done). 폰은 고르지 않고 서명할 것 → 끝난 것 순서로 다 보인다
  const pick = sp.f === 'todo' || sp.f === 'done' ? sp.f : 'all';
  const lists = (pc: boolean) => (
    <>
      {(pc ? (pick === 'todo' ? todo : pick === 'done' ? done : list) : list).length === 0 && <Card><p className="py-6 text-center text-sm text-faint">{t('empty')}</p></Card>}
      {todo.length > 0 && (!pc || pick !== 'done') && (
        <Card>
          <p className="pb-1 text-sm font-bold text-warn">{t('todoTitle', { n: todo.length })}</p>
          <ul className="flex flex-col divide-y divide-border">{todo.map(line)}</ul>
        </Card>
      )}
      {done.length > 0 && (!pc || pick !== 'todo') && (
        <Card>
          <p className="pb-1 text-sm font-bold">{t('doneTitle')}</p>
          <ul className="flex flex-col divide-y divide-border">{done.map(line)}</ul>
        </Card>
      )}
    </>
  );
  return (
    <PageShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {/* 2026-11-01 의뢰인: 제증명 · 내 프로필처럼 PC는 두 칸 — 왼쪽: 전체 · 서명할 교육 · 끝난 교육, 오른쪽: 목록 */}
      <div className="hidden lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <SideFilter
          title={t('title')}
          items={[
            { key: 'all', label: t('filterAll'), n: list.length, href: '/punch/training', on: pick === 'all' },
            { key: 'todo', label: t('filterTodo'), n: todo.length, href: '/punch/training?f=todo', on: pick === 'todo', warn: true },
            { key: 'done', label: t('doneTitle'), n: done.length, href: '/punch/training?f=done', on: pick === 'done' },
          ]}
        />
        <div className="flex min-w-0 flex-col gap-3">{lists(true)}</div>
      </div>
      <div className="flex flex-col gap-3 lg:hidden">{lists(false)}</div>
    </PageShell>
  );
}
