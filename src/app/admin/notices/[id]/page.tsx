import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/ui';
import { noticeState } from '@/lib/notice-logic';
import { getNotice, listNoticesForAdmin } from '@/lib/notices';
import { loadOrgGroups } from '@/lib/org-data';
import { noticeGroups } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate, toKstTime } from '@/lib/time';
import { NoticeEditor } from '../NoticeEditor';
import { adminPage } from '@/lib/admin-gate';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

const kstInput = (d: Date) => `${toKstDate(d)}T${toKstTime(d).slice(0, 5)}`;

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  await adminPage(); // 관리 화면 이중 확인 (lib/admin-gate)
  const { id } = await params;
  const got = await getNotice(id);
  if (!got) notFound();
  const t = await getTranslations('admin.notices');
  const [{ data }, list, groups] = await Promise.all([
    createAdminClient().from('profiles').select('id, name, group_id').or(NOT_SYSTEM_ADMIN).eq('active', true).order('name'),
    listNoticesForAdmin(new Date()),
    loadOrgGroups(),
  ]);
  const stat = list.find((r) => r.notice.id === id);
  const n = got.notice;
  return (
    <PageShell>
      <NoticeEditor
        people={(data ?? []).map((p) => ({ id: p.id, name: p.name, groupId: (p.group_id as string | null) ?? null }))}
        groups={noticeGroups(groups)}
        initial={{
          id: n.id,
          title: n.title,
          body: n.body,
          bodyHtml: n.bodyHtml ?? null,
          important: n.important,
          legal: n.legal,
          audience: n.audience,
          targets: got.targets,
          startsAt: kstInput(n.startsAt),
          endsAt: n.endsAt ? kstInput(n.endsAt) : '',
          status: n.status,
          state: noticeState(n, new Date()),
          version: n.version,
          confirmed: stat ? t('confirmed', { n: stat.confirmed, total: stat.total }) : '',
          notConfirmed: stat?.notConfirmed ?? [],
        }}
      />
    </PageShell>
  );
}
