// 동의 기록 읽기·쓰기. 서버 전용. 동의는 덧붙이기만 한다 (DB 0018).
import 'server-only';
import { cache } from 'react';
import { CONSENT } from '@/config/consent';
import { createAdminClient } from '@/lib/supabase/admin';

/** 지금 판의 안내문에 동의했는가. 한 요청 안에서는 한 번만 읽는다 */
export const hasConsent = cache(async (employeeId: string): Promise<boolean> => {
  const { count, error } = await createAdminClient()
    .from('consents')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('kind', CONSENT.kind)
    .eq('version', CONSENT.version);
  if (error) throw new Error(`hasConsent: ${error.code}`);
  return (count ?? 0) > 0;
});

/** 동의 기록. 이미 있으면 그대로 둔다 (두 번 눌러도 한 줄) */
export async function recordConsent(args: { employeeId: string; locale: string; clientIp: string | null }): Promise<void> {
  const { error } = await createAdminClient()
    .from('consents')
    .upsert(
      { employee_id: args.employeeId, kind: CONSENT.kind, version: CONSENT.version, locale: args.locale, client_ip: args.clientIp },
      { onConflict: 'employee_id,kind,version', ignoreDuplicates: true },
    );
  if (error) throw new Error(`recordConsent: ${error.code}`);
}

/** 직원 상세에 보여 줄 동의 시각 (지금 판). 없으면 null */
export async function consentAt(employeeId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('consents').select('agreed_at').eq('employee_id', employeeId).eq('kind', CONSENT.kind).eq('version', CONSENT.version).maybeSingle();
  return data?.agreed_at ?? null;
}
