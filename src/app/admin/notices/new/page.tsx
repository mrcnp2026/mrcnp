import { PageShell } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { NoticeEditor } from '../NoticeEditor';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

export default async function NewNoticePage() {
  const { data } = await createAdminClient().from('profiles').select('id, name').or(NOT_SYSTEM_ADMIN).eq('active', true).order('name');
  return (
    <PageShell wide>
      <NoticeEditor people={(data ?? []).map((p) => ({ id: p.id, name: p.name }))} initial={null} />
    </PageShell>
  );
}
