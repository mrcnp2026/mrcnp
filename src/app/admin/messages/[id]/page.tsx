// 업무 메시지 한 건 (관리자) — 내용 · 누가 읽었는지 · 회신. 여러 명에게 보낸 통지에는 직원 한 명을 골라 답한다.
import { notFound } from 'next/navigation';
import { MessageThread } from '@/components/MessageViews';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadThread } from '@/lib/work-messages';

export default async function AdminMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = (await getMe())!;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const thread = await loadThread(id, me);
  if (!thread) notFound();
  const { data: staff } = await createAdminClient().from('profiles').select('id, name');
  return (
    <PageShell>
      <MessageThread thread={thread} meId={me.id} names={new Map((staff ?? []).map((p) => [p.id as string, p.name as string]))} back="/admin/messages" admin />
    </PageShell>
  );
}
