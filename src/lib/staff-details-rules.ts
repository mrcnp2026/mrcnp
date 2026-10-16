// 직원 개인 정보(묶음 17, 2026-10-16 의뢰인 권한-3) — 생년월일 · 비상연락처 · 보유 자격증 · 차종/차량번호. 순수함수(검사 · 정리).
// 직원이 「내 계정」에서 직접 넣고, 관리자도 고친다. 같은 검사를 두 API가 쓴다.
import { cleanPhone } from '@/lib/org';

export type EmergencyContact = { name: string; relation: string; phone: string };
export type Certificate = { name: string; acquiredOn: string | null; number: string | null };
export type StaffDetails = { birthDate: string | null; emergencyContacts: EmergencyContact[]; certificates: Certificate[]; carModel: string | null; carNumber: string | null };

export const MAX_CONTACTS = 2;
export const MAX_CERTS = 20;
export const EMPTY_DETAILS: StaffDetails = { birthDate: null, emergencyContacts: [], certificates: [], carModel: null, carNumber: null };

const str = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s.length > max ? undefined : s;
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** 들어온 값을 검사 · 정리한다. 틀리면 { error: 오류 코드 } */
export function cleanDetails(b: Record<string, unknown>, today: string): StaffDetails | { error: string } {
  // 생년월일
  let birthDate: string | null = null;
  if (b.birthDate !== null && b.birthDate !== undefined && b.birthDate !== '') {
    if (typeof b.birthDate !== 'string' || !isDate(b.birthDate) || b.birthDate < '1900-01-01' || b.birthDate > today) return { error: 'invalid_birth' };
    birthDate = b.birthDate;
  }
  // 비상연락처 — 다 빈 줄은 버린다. 이름과 전화는 같이 있어야 한다
  const rawC = Array.isArray(b.emergencyContacts) ? b.emergencyContacts : [];
  const emergencyContacts: EmergencyContact[] = [];
  for (const x of rawC) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = str(o.name, 30), relation = str(o.relation, 20);
    const phone = typeof o.phone === 'string' && o.phone.trim() ? cleanPhone(o.phone) : null;
    if (name === undefined || relation === undefined || phone === undefined) return { error: 'invalid_contact' };
    if (!name && !relation && !phone) continue;
    if (!name || !phone) return { error: 'invalid_contact' };
    emergencyContacts.push({ name, relation: relation ?? '', phone });
  }
  if (emergencyContacts.length > MAX_CONTACTS) return { error: 'too_many' };
  // 자격증 — 이름만 필수
  const rawK = Array.isArray(b.certificates) ? b.certificates : [];
  const certificates: Certificate[] = [];
  for (const x of rawK) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = str(o.name, 60), number = str(o.number, 40);
    const acquiredOn = typeof o.acquiredOn === 'string' && o.acquiredOn ? o.acquiredOn : null;
    if (name === undefined || number === undefined) return { error: 'invalid_cert' };
    if (!name && !number && !acquiredOn) continue;
    if (!name) return { error: 'invalid_cert' };
    if (acquiredOn && (!isDate(acquiredOn) || acquiredOn < '1950-01-01' || acquiredOn > today)) return { error: 'invalid_cert' };
    certificates.push({ name, acquiredOn, number });
  }
  if (certificates.length > MAX_CERTS) return { error: 'too_many' };
  const carModel = str(b.carModel, 50), carNumber = str(b.carNumber, 20);
  if (carModel === undefined || carNumber === undefined) return { error: 'invalid_car' };
  return { birthDate, emergencyContacts, certificates, carModel, carNumber };
}

/** 만 나이 */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
