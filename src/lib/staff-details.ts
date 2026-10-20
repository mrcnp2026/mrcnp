// 직원 개인 정보 읽기 · 쓰기 (묶음 17, staff_details 표). 서버 전용 — 표는 앱 서버만 읽는다.
// 고친 사람은 updated_by → 변경 기록(audit_row)에 전 값 · 새 값이 남는다.
import 'server-only';
import { EMPTY_FOREIGN, type ForeignInfo } from '@/lib/foreign-rules';
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

// ── 외국인 정보 (묶음 31, 2026-10-20) — 관리자만 넣고 고친다. 같은 줄(staff_details)에 둔다 ──

export async function loadForeignInfo(employeeId: string): Promise<ForeignInfo> {
  const { data } = await createAdminClient().from('staff_details').select('nationality, visa_type, stay_until, first_work_in_korea, english_name, activity_permit_until, immigration_visit_on, dormitory').eq('id', employeeId).maybeSingle();
  if (!data) return EMPTY_FOREIGN;
  return { nationality: data.nationality ?? null, visaType: data.visa_type ?? null, stayUntil: data.stay_until ?? null, firstWorkInKorea: data.first_work_in_korea ?? null, englishName: data.english_name ?? null, activityPermitUntil: data.activity_permit_until ?? null, immigrationVisitOn: data.immigration_visit_on ?? null, dormitory: data.dormitory ?? null };
}

/** 외국인 직원 전체 (체류 기간 알림 · 목록) — 국적이 있는 사람만 */
export async function loadForeignStaff(): Promise<(ForeignInfo & { id: string })[]> {
  const { data } = await createAdminClient().from('staff_details').select('id, nationality, visa_type, stay_until, first_work_in_korea, english_name, activity_permit_until, immigration_visit_on, dormitory').not('nationality', 'is', null).limit(5000);
  return (data ?? []).map((d) => ({ id: d.id as string, nationality: d.nationality, visaType: d.visa_type ?? null, stayUntil: d.stay_until ?? null, firstWorkInKorea: d.first_work_in_korea ?? null, englishName: d.english_name ?? null, activityPermitUntil: d.activity_permit_until ?? null, immigrationVisitOn: d.immigration_visit_on ?? null, dormitory: d.dormitory ?? null }));
}

export async function saveForeignInfo(employeeId: string, v: ForeignInfo, actorId: string): Promise<void> {
  // 줄이 없으면 만든다(다른 개인 정보 칸은 기본값). 있으면 외국인 칸만 바꾼다
  const c = createAdminClient();
  const row = { nationality: v.nationality, visa_type: v.visaType, stay_until: v.stayUntil, first_work_in_korea: v.firstWorkInKorea, english_name: v.englishName ?? null, activity_permit_until: v.activityPermitUntil ?? null, immigration_visit_on: v.immigrationVisitOn ?? null, dormitory: v.dormitory ?? null, updated_at: new Date().toISOString(), updated_by: actorId };
  const { data, error } = await c.from('staff_details').update(row).eq('id', employeeId).select('id');
  if (error) throw new Error(`saveForeignInfo: ${error.code}`);
  if (!data?.length) {
    const { error: e2 } = await c.from('staff_details').insert({ id: employeeId, ...row });
    if (e2) throw new Error(`saveForeignInfo.insert: ${e2.code}`);
  }
}
