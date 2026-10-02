import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/ui';
import { noticeState } from '@/lib/notice-logic';
import { getNotice, listNoticesForAdmin, translationLocales } from '@/lib/notices';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate, toKstTime } from '@/lib/time';
import { NoticeEditor } from '../NoticeEditor';

const kstInput = (d: Date) => `${toKstDate(d)}T${toKstTime(d).slice(0, 5)}`;

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await getNotice(id);
  if (!got) notFound();
  const t = await getTranslations('admin.notices');
  const [{ data }, list] = await Promise.all([
    createAdminClient().from('profiles').select('id, name').eq('active', true).order('name'),
    listNoticesForAdmin(new Date()),
  ]);
  const stat = list.find((r) => r.notice.id === id);
  const n = got.notice;
  return (
    <PageShell>
      <NoticeEditor
        people={(data ?? []).map((p) => ({ id: p.id, name: p.name }))}
        initial={{
          id: n.id,
          title: n.title,
          body: n.body,
          important: n.important,
          legal: n.legal,
          audience: n.audience,
          targets: got.targets,
          startsAt: kstInput(n.startsAt),
          endsAt: n.endsAt ? kstInput(n.endsAt) : '',
          status: n.status,
          state: noticeState(n, new Date()),
          version: n.version,
          translations: translationLocales().map((loc) => {
            const tr = got.translations.find((x) => x.locale === loc);
            return { locale: loc, title: tr?.title ?? '', body: tr?.body ?? '', source: tr?.source ?? null, reviewed: tr?.reviewed ?? false, numbersOk: tr?.numbersOk ?? true, stale: !!tr && tr.basedOnVersion < n.version };
          }),
          confirmed: stat ? t('confirmed', { n: stat.confirmed, total: stat.total }) : '',
          notConfirmed: stat?.notConfirmed ?? [],
        }}
      />
    </PageShell>
  );
}
