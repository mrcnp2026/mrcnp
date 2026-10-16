// 직원 개인 정보 검사 (lib/staff-details-rules.ts, 묶음 17)
import { describe, expect, it } from 'vitest';
import { ageOn, cleanDetails } from '@/lib/staff-details-rules';

const T = '2026-10-16';

describe('cleanDetails', () => {
  it('빈 값은 빈 정보로', () => {
    expect(cleanDetails({}, T)).toEqual({ birthDate: null, emergencyContacts: [], certificates: [], carModel: null, carNumber: null });
  });
  it('다 빈 줄은 버리고, 공백은 정리한다', () => {
    const r = cleanDetails({ birthDate: '1990-03-05', emergencyContacts: [{ name: ' 김 영희 ', relation: '배우자', phone: '010-1234-5678' }, { name: '', relation: '', phone: '' }], certificates: [{ name: '지게차운전기능사', acquiredOn: '2015-06-01', number: '' }, {}], carModel: ' 아반떼 ', carNumber: '12가 3456' }, T);
    expect(r).toEqual({ birthDate: '1990-03-05', emergencyContacts: [{ name: '김 영희', relation: '배우자', phone: '010-1234-5678' }], certificates: [{ name: '지게차운전기능사', acquiredOn: '2015-06-01', number: null }], carModel: '아반떼', carNumber: '12가 3456' });
  });
  it('틀린 값은 오류 코드', () => {
    expect(cleanDetails({ birthDate: '2030-01-01' }, T)).toEqual({ error: 'invalid_birth' });
    expect(cleanDetails({ birthDate: '1990-02-30' }, T)).toEqual({ error: 'invalid_birth' });
    expect(cleanDetails({ emergencyContacts: [{ name: '김', phone: '' }] }, T)).toEqual({ error: 'invalid_contact' });
    expect(cleanDetails({ emergencyContacts: [{ name: '김', phone: '전화' }] }, T)).toEqual({ error: 'invalid_contact' });
    expect(cleanDetails({ emergencyContacts: [1, 2, 3].map(() => ({ name: '김', phone: '010-1111-2222' })) }, T)).toEqual({ error: 'too_many' });
    expect(cleanDetails({ certificates: [{ name: '', number: '123' }] }, T)).toEqual({ error: 'invalid_cert' });
    expect(cleanDetails({ certificates: [{ name: '기사', acquiredOn: '2027-01-01' }] }, T)).toEqual({ error: 'invalid_cert' });
    expect(cleanDetails({ carNumber: 'x'.repeat(21) }, T)).toEqual({ error: 'invalid_car' });
  });
  it('만 나이', () => {
    expect(ageOn('1990-10-16', T)).toBe(36);
    expect(ageOn('1990-10-17', T)).toBe(35);
  });
});
