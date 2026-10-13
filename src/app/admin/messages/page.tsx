// 업무 메시지 (관리자) — 통지 보내기, 보낸 통지와 읽음 수, 직원에게서 온 문의 (PRD v1.3 37.4, L19).
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { NoticeCompose } from '@/components/MessageForms';
import { MessageList } from '@/components/MessageViews';
import { Card, CardTitle, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadInbox, loadSent } from '@/lib/work-messages';

export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const me = (await getMe())!;
  const [t, sp] = await Promise.all([getTranslations('messages'), searchParams]);
  const inbox = sp.box === 'in';
  const [items, groups, { data: staff }] = await Promise.all([inbox ? loadInbox(me) : loadSent(me), loadOrgGroups(), createAdminClient().from('profiles').select('id, name, employee_no, active').order('name')]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const tab = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center border-b-2 text-sm font-bold ${on ? 'border-text text-text' : 'border-transparent text-muted'}`;
  return (
    <PageShell wide>
      <div>
        <h1 className="text-2xl font-bold">{t('adminTitle')}</h1>
        <p className="pt-1 text-sm text-faint">{t('adminIntro')}</p>
      </div>
      <Card>
        <CardTitle>{t('composeTitle')}</CardTitle>
        <div className="pt-3">
          <NoticeCompose
            groups={buildOrgTree(groups).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))])}
            people={(staff ?? []).filter((p) => p.active && p.id !== me.id && (me.employeeNo?.startsWith('e2e-') || !(p.employee_no as string | null)?.startsWith('e2e-'))).map((p) => ({ id: p.id as string, label: p.name as string }))}
          />
        </div>
      </Card>
      <nav className="flex border-b border-border">
        <Link href="/admin/messages" aria-current={!inbox ? 'page' : undefined} className={tab(!inbox)}>
          {t('tabSentAdmin')}
        </Link>
        <Link href="/admin/messages?box=in" aria-current={inbox ? 'page' : undefined} className={tab(inbox)}>
          {t('tabInquiries')}
        </Link>
      </nav>
      <MessageList items={items} base="/admin/messages" names={names} sent={!inbox} />
    </PageShell>
  );
}
