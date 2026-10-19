// 휴가 증빙 파일 — 파일 종류 판단(서명) · 이름 정리 · 15분 휴가 단위 (묶음 9)
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/scope', () => ({ requireApprover: async () => ({}), viewerScope: async () => null }));
vi.mock('@/lib/leave-ledger-data', () => ({ loadTypeRules: async () => new Map() }));
const { sniffEvidence, cleanFileName } = await import('@/lib/leave-evidence');
const { roundDays, validateLeaveType, unitOfHours } = await import('@/lib/leave');

const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16).fill(0)]);

describe('sniffEvidence', () => {
  it('PDF · JPG · PNG · HEIC를 알아보고 나머지는 받지 않는다', () => {
    expect(sniffEvidence(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf');
    expect(sniffEvidence(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffEvidence(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    const heic = new Uint8Array([0, 0, 0, 0x18, ...'ftypheic'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect(sniffEvidence(heic)).toBe('image/heic');
    expect(sniffEvidence(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip
    expect(sniffEvidence(bytes(0x4d, 0x5a))).toBeNull(); // exe
  });
  it('파일 이름에서 경로 · 위험한 글자를 뺀다', () => {
    expect(cleanFileName(String.raw`C:\사진\진단서.pdf`)).toBe('진단서.pdf');
    expect(cleanFileName('../../a"b<c>.png')).toBe('abc.png');
    expect(cleanFileName('')).toBe('file');
  });
});

describe('15분 휴가', () => {
  it('0.25시간 = 0.03125일이 잘리지 않는다', () => {
    expect(unitOfHours(0.25)).toBe(0.03125);
    expect(roundDays(0.03125 * 3)).toBe(0.09375);
    expect(roundDays(0.1 + 0.2)).toBe(0.3);
  });
  it('종류의 시간은 15분 단위만', () => {
    const base = { name: '외출 15분', isPaid: true, deductsBalance: true };
    expect(validateLeaveType({ ...base, hours: 0.25 }).ok).toBe(true);
    expect(validateLeaveType({ ...base, hours: 0.75 }).ok).toBe(true);
    expect(validateLeaveType({ ...base, hours: 0.1 }).ok).toBe(false);
    expect(validateLeaveType({ ...base, hours: 0.2 }).ok).toBe(false);
  });
});
