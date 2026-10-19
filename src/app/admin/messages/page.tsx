// 사내게시판 (관리자) — 글 올리기, 올린 글과 읽음 수 (PRD v1.3 37.4, L19). 직원 문의 · 답글은 없다(2026-10-16 의뢰인 알림-8).
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import { NoticeCompose } from '@/components/MessageForms';
import { MessageList } from '@/components/MessageViews';
import { Card, CardTitle, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadSent } from '@/lib/work-messages';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

export default async function AdminMessagesPage() {
  const me = (await getMe())!;
  const t = await getTranslations('messages');
  const [items, groups, { data: staff }] = await Promise.all([loadSent(me), loadOrgGroups(), createAdminClient().from('profiles').select('id, name, employee_no, active').or(NOT_SYSTEM_ADMIN).order('name')]);
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  return (
    <PageShell wide>
      <div>
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('adminTitle')}<HelpTip>{t('adminIntro')}</HelpTip></h1>
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
      <h2 className="text-lg font-bold">{t('tabSentAdmin')}</h2>
      <MessageList items={items} base="/admin/messages" names={names} sent />
    </PageShell>
  );
}
