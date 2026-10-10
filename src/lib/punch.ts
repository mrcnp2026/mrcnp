// 출퇴근 기록 (7-4). 서버 전용.
// ★★ 시각·근무일·IP·검증 여부·연습 여부는 **서버가 정한다.** 요청 본문에 그런 값이 있어도 읽지 않는다 (요점 4, B-23).
// ★ 기록은 덧붙이기만 한다 (4-1). 고칠 일이 생기면 정정 레코드로 (7-10).
import 'server-only';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PunchKind } from '@/lib/types';

export type RecordedPunch = {
  id: string;
  kind: PunchKind;
  punchedAt: string;
  workDate: string;
  ipVerified: boolean;
  isTest: boolean;
  note: string | null;
};

export async function recordPunch(input: {
  employeeId: string;
  kind: PunchKind;
  now: Date;
  clientIp: string | null;
  ipVerified: boolean;
  source: 'web' | 'qr' | 'admin';
  isTest: boolean;
  passkeyId: string | null;
  verifiedBy: 'ip' | 'gps' | null; // 무엇으로 사무실을 확인했는가 (ipVerified가 true면 반드시 있다)
  geo: { lat: number; lng: number } | null; // GPS로 확인됐을 때만 (사무실 밖 좌표는 저장하지 않는다)
  locationId?: string | null; // 확인된 출퇴근 장소 (GPS로 확인됐을 때만)
}): Promise<{ event: RecordedPunch; deduped: boolean }> {
  const db = createAdminClient();
  // 직원 단위 잠금 + 60초 중복 방지 + 근무일 결정은 DB 함수가 한 트랜잭션으로 한다 (부록 R-4)
  const { data, error } = await db.rpc('record_punch', {
    p_employee_id: input.employeeId,
    p_kind: input.kind,
    p_now: input.now.toISOString(),
    p_timezone: OFFICE.timezone,
    p_client_ip: input.clientIp,
    p_ip_verified: input.ipVerified,
    p_source: input.source,
    p_is_test: input.isTest,
    p_passkey_id: input.passkeyId,
    p_dedupe_seconds: OFFICE.punchDedupeSeconds,
    p_open_shift_max_hours: OFFICE.openShiftMaxHours,
    p_geo_lat: input.geo?.lat ?? null,
    p_geo_lng: input.geo?.lng ?? null,
    p_verified_by: input.verifiedBy,
    p_location_id: input.locationId ?? null,
  });
  if (error) throw new Error(`recordPunch: ${error.message}`);
  const row = (data as { event_id: string; deduped: boolean }[])[0];

  // 요점 3: 덧붙이기만 하는 표라 잘못 들어가면 되돌릴 수 없다 — 저장된 값을 한 번 더 읽어 확인한다
  const { data: e, error: e2 } = await db
    .from('punch_events')
    .select('id, employee_id, kind, punched_at, work_date, ip_verified, is_test, note')
    .eq('id', row.event_id)
    .single();
  if (e2 || !e) throw new Error(`recordPunch.readback: ${e2?.message}`);
  if (e.employee_id !== input.employeeId || e.kind !== input.kind || e.is_test !== input.isTest) {
    throw new Error('recordPunch.readback: stored values differ from request'); // 로그로만 — 원인 조사 대상
  }
  return {
    deduped: row.deduped,
    event: {
      id: e.id,
      kind: e.kind,
      punchedAt: e.punched_at,
      workDate: e.work_date,
      ipVerified: e.ip_verified,
      isTest: e.is_test,
      note: e.note,
    },
  };
}

/**
 * 월 잠금 확인 자리 (7-14). ①단계에는 잠금이 없으므로 항상 "안 잠김".
 * ②-3에서 period_locks를 읽도록 **이 함수만** 채운다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ②-3에서 쓰는 인자. 자리만 먼저 만든다
export async function isPeriodLocked(_employeeId: string, _workDate: string): Promise<boolean> {
  return false;
}
