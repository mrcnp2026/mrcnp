// 사내게시판 (관리자) — 글 올리기, 올린 글과 읽음 수 (PRD v1.3 37.4, L19). 직원 문의 · 답글은 없다(2026-10-16 의뢰인 알림-8).
import { getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import { NoticeCompose } from '@/components/MessageForms';
import { MessageList } from '@/components/MessageViews';
import { Megaphone } from 'lucide-react';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { SheetOpener } from '@/components/SheetOpener';
import { Card, Empty, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { orgOptions } from '@/lib/org';
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
      {/* 2026-10-22: 올린 글 목록이 먼저, 글쓰기는 「+ 새 글」 팝업 — 쓰지 않을 때도 편집기가 화면 위를 차지하고 있었다 */}
      <div className="flex items-start gap-3">
        <h1 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-2xl font-bold">{t('adminTitle')}<HelpTip>{t('adminIntro')}</HelpTip></h1>
        <SheetOpener id="board-new" label={t('composeTitle')} />
      </div>
      {items.length === 0 ? (
        <Empty icon={Megaphone} title={t('boardEmpty')} desc={t('boardEmptyDesc')} />
      ) : (
        <MessageList items={items} base="/admin/messages" names={names} sent />
      )}
      <AddSheet id="board-new" title={t('composeTitle')} modal wide>
        <Card>
          <NoticeCompose
            sheet="board-new"
            groups={orgOptions(groups)}
            people={(staff ?? []).filter((p) => p.active && p.id !== me.id && (me.employeeNo?.startsWith('e2e-') || !(p.employee_no as string | null)?.startsWith('e2e-'))).map((p) => ({ id: p.id as string, label: p.name as string }))}
          />
        </Card>
      </AddSheet>
      <Fab label={t('composeTitle')} items={[{ id: 'board-new', label: t('composeTitle') }]} />
    </PageShell>
  );
}
