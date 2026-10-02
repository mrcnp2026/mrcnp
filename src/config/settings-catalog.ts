// 설정 항목 목록 (② 3-1) — 키·기본값·검사를 한 곳에. 화면·계산이 같은 목록을 쓴다.
// ★ 값은 app_settings 이력 표에 "언제부터"와 함께 쌓인다 (② 4-1). 읽기는 src/lib/settings.ts의 getSettingAt 한 곳.
// 기본값은 ① 단계에서 OFFICE에 두던 값이다 — DB에 아직 행이 없으면 이 값을 쓴다 (행을 지어내 넣지 않는다).
// ⚠️ 근무규칙(출퇴근 시각·휴게·요일)은 여기가 아니라 work_rules 표(effective_from 이력)가 맡는다.
// ⚠️ 사무실 IP는 여기 두지 않는다 — 즉시 적용이라 이력이 없다 (② 4-10, office_networks 표).
import { OFFICE } from '@/config/office';

type Num = { kind: 'int'; min: number; max: number; unit: 'min' | 'hour' | 'percent' | 'count' };
type Choice = { kind: 'choice'; options: readonly string[] };
type Time = { kind: 'time' };
type Bool = { kind: 'bool' };
export type SettingSpec = (Num | Choice | Time | Bool) & { group: number; default: number | string | boolean };

export const SETTINGS = {
  // 그룹 1 — 회사 기본. 5인 기준을 모르면 가산수당 적용이 통째로 틀린다
  'company.workplace_size': { group: 1, kind: 'choice', options: ['5_or_more', 'under_5'], default: OFFICE.workplaceSize },
  // 그룹 2 — 근무규칙 중 이력 표가 아닌 것
  'rule.absent_check_time': { group: 2, kind: 'time', default: OFFICE.absentCheckTime },
  'rule.monthly_scheduled_hours': { group: 2, kind: 'int', min: 1, max: 400, unit: 'hour', default: 209 }, // 급여 통상시급의 기준 (③ 7-1)
  // 그룹 3 — 연장근로
  'overtime.review_threshold_min': { group: 3, kind: 'int', min: 0, max: 240, unit: 'min', default: OFFICE.overtimeReviewThresholdMin },
  'missing.out_grace_hours': { group: 3, kind: 'int', min: 0, max: 12, unit: 'hour', default: OFFICE.missingOutGraceHours },
  'missing.in_grace_min': { group: 3, kind: 'int', min: 0, max: 240, unit: 'min', default: OFFICE.missingInGraceMin },
  'week.caution_hours': { group: 3, kind: 'int', min: 1, max: 80, unit: 'hour', default: OFFICE.weeklyCautionHours },
  'week.limit_hours': { group: 3, kind: 'int', min: 1, max: 80, unit: 'hour', default: OFFICE.weeklyLimitHours },
  // 그룹 4 — 위치 검증 (주소 목록은 office_networks. 여기는 경고 기준만)
  'location.failure_alert_percent': { group: 4, kind: 'int', min: 1, max: 100, unit: 'percent', default: 50 },
  // 그룹 7 — 연차 (② 4-7: 발생일수는 자동 계산하지 않는다. 기준·허용 단위만)
  'leave.basis': { group: 7, kind: 'choice', options: ['hire_date', 'fiscal_year'], default: 'hire_date' },
  'leave.allow_half': { group: 7, kind: 'bool', default: true },
  'leave.allow_quarter': { group: 7, kind: 'bool', default: false },
  // 그룹 8 — 정정·잠금
  'correction.window_days': { group: 8, kind: 'int', min: 1, max: 90, unit: 'count', default: 31 },
  // 그룹 11 — 공지
  'notice.popup_max': { group: 11, kind: 'int', min: 1, max: 10, unit: 'count', default: 3 },
  // 그룹 12 — 서비스 상태
  'status.error_alert_count': { group: 12, kind: 'int', min: 1, max: 100, unit: 'count', default: 5 },
  'status.storage_alert_percent': { group: 12, kind: 'int', min: 10, max: 100, unit: 'percent', default: 80 },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'] extends boolean
  ? boolean
  : (typeof SETTINGS)[K]['default'] extends number
    ? number
    : string;

export const GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12] as const;

/** 저장 전 검사 — 화면이 아니라 서버가 한다. 맞으면 정규화한 값, 틀리면 null */
export function checkSetting(key: string, raw: unknown): number | string | boolean | null {
  const spec = (SETTINGS as Record<string, SettingSpec>)[key];
  if (!spec) return null;
  if (spec.kind === 'int') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(n) && n >= spec.min && n <= spec.max ? n : null;
  }
  if (spec.kind === 'choice') return typeof raw === 'string' && spec.options.includes(raw) ? raw : null;
  if (spec.kind === 'time') return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
  return typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : null;
}
