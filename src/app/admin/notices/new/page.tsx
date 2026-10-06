import { PageShell } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { NoticeEditor } from '../NoticeEditor';

export default async function NewNoticePage() {
  const { data } = await createAdminClient().from('profiles').select('id, name').eq('active', true).order('name');
  return (
    <PageShell wide>
      <NoticeEditor people={(data ?? []).map((p) => ({ id: p.id, name: p.name }))} initial={null} />
    </PageShell>
  );
}
