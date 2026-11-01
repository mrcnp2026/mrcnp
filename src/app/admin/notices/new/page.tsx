import { PageShell } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { NoticeEditor } from '../NoticeEditor';
import { adminPage } from '@/lib/admin-gate';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

export default async function NewNoticePage() {
  await adminPage(); // 관리 화면 이중 확인 (lib/admin-gate)
  const { data } = await createAdminClient().from('profiles').select('id, name').or(NOT_SYSTEM_ADMIN).eq('active', true).order('name');
  return (
    <PageShell wide>
      <NoticeEditor people={(data ?? []).map((p) => ({ id: p.id, name: p.name }))} initial={null} />
    </PageShell>
  );
}
