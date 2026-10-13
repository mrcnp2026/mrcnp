// 업무 메시지 한 건 (직원) — 내용 · 회신. 내가 받았거나 보낸 것만 열린다. 열면 읽음으로 표시된다.
import { notFound, redirect } from 'next/navigation';
import { MessageThread } from '@/components/MessageViews';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadThread } from '@/lib/work-messages';

export default async function MyMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // 직원 화면에서는 관리자라도 「받았거나 보낸 것」만 연다(전체 관리는 관리자 화면에서)
  const thread = await loadThread(id, { ...me, role: me.role === 'admin' ? 'employee' : me.role });
  if (!thread) notFound();
  const { data: staff } = await createAdminClient().from('profiles').select('id, name');
  return (
    <PageShell>
      <MessageThread thread={thread} meId={me.id} names={new Map((staff ?? []).map((p) => [p.id as string, p.name as string]))} back="/punch/messages" />
    </PageShell>
  );
}
