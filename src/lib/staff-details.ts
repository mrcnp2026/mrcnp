// 직원 개인 정보 읽기 · 쓰기 (묶음 17, staff_details 표). 서버 전용 — 표는 앱 서버만 읽는다.
// 고친 사람은 updated_by → 변경 기록(audit_row)에 전 값 · 새 값이 남는다.
import 'server-only';
import { EMPTY_DETAILS, type StaffDetails } from '@/lib/staff-details-rules';
import { createAdminClient } from '@/lib/supabase/admin';

export async function loadStaffDetails(employeeId: string): Promise<StaffDetails & { updatedAt: string | null }> {
  const { data, error } = await createAdminClient().from('staff_details').select('birth_date, emergency_contacts, certificates, car_model, car_number, updated_at').eq('id', employeeId).maybeSingle();
  if (error || !data) return { ...EMPTY_DETAILS, updatedAt: null };
  return {
    birthDate: (data.birth_date as string | null) ?? null,
    emergencyContacts: Array.isArray(data.emergency_contacts) ? data.emergency_contacts : [],
    certificates: Array.isArray(data.certificates) ? data.certificates : [],
    carModel: (data.car_model as string | null) ?? null,
    carNumber: (data.car_number as string | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

/** 여러 직원 것을 한 번에 (직원 목록 엑셀) */
export async function loadAllStaffDetails(): Promise<Map<string, StaffDetails>> {
  const { data } = await createAdminClient().from('staff_details').select('id, birth_date, emergency_contacts, certificates, car_model, car_number').limit(5000);
  return new Map((data ?? []).map((d) => [d.id as string, { birthDate: d.birth_date ?? null, emergencyContacts: d.emergency_contacts ?? [], certificates: d.certificates ?? [], carModel: d.car_model ?? null, carNumber: d.car_number ?? null }]));
}

export async function saveStaffDetails(employeeId: string, v: StaffDetails, actorId: string): Promise<void> {
  const { error } = await createAdminClient().from('staff_details').upsert({
    id: employeeId, birth_date: v.birthDate, emergency_contacts: v.emergencyContacts, certificates: v.certificates, car_model: v.carModel, car_number: v.carNumber,
    updated_at: new Date().toISOString(), updated_by: actorId,
  });
  if (error) throw new Error(`saveStaffDetails: ${error.code}`);
}
