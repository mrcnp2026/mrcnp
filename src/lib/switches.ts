// 통합설정 스위치 (2026-10-19 의뢰인: 알림 · 요청 · 고급옵션 등을 PC에서 켜고 끌 수 있게). 서버 전용.
// 값은 회사 정보 이력(company_profile_versions)의 switches 칸에 함께 남는다 — 바꿀 때마다 한 줄, 누가 언제 바꿨는지 남는다.
// 저장된 값이 없으면 켜짐(지금까지의 동작). 여기 없는 항목은 법 · 계산에 걸려 있어 화면에서 「고정」으로만 보인다.
import 'server-only';
import { ApiError } from '@/lib/api';
import { companyProfile, putCompanyProfile } from '@/lib/company';

export const SWITCHES = [
  'notify.notice', // 새 공지를 앱을 열 때 팝업으로
  'notify.request', // 관리자 메뉴의 대기 요청 숫자
  'notify.push', // 폰 알림 보내기 (출퇴근 · 휴가 · 정정)
  'request.punch', // 출퇴근 장소 밖 출근/퇴근 요청 (끄면 장소 밖에서는 찍히지 않는다)
  'request.correction', // 출퇴근기록 정정 요청
  'request.shift', // 근무일정 생성 요청
  'request.leave', // 휴가 신청
  'request.leaveDelete', // 휴가 삭제 요청
  'request.work', // 외근 · 출장 · 재택 신청
  'leave.hourly', // 시간 단위 휴가 신청
  'message.translate', // 공지 번역 초안
  'report.week52', // 직원 · 관리자 홈의 주 52시간 표시
  'advanced.homeCards', // 직원이 홈 카드를 켜고 끄기
  'advanced.brand', // 상단 줄 · 로그인 화면의 회사 로고
] as const;
export type SwitchKey = (typeof SWITCHES)[number];
export const isSwitchKey = (k: unknown): k is SwitchKey => typeof k === 'string' && (SWITCHES as readonly string[]).includes(k);

/** 지금 스위치 값 — 저장한 적 없으면 켜짐 */
export async function switches(): Promise<Record<SwitchKey, boolean>> {
  const saved = (await companyProfile()).switches ?? {};
  return Object.fromEntries(SWITCHES.map((k) => [k, saved[k] !== false])) as Record<SwitchKey, boolean>;
}
export async function switchOn(k: SwitchKey): Promise<boolean> {
  return (await switches())[k];
}

export async function putSwitch(k: SwitchKey, on: boolean, actorId: string): Promise<void> {
  const saved = (await companyProfile()).switches ?? {};
  await putCompanyProfile({ switches: { ...saved, [k]: on } }, actorId);
}

/** 직원 요청 API 입구 — 스위치가 꺼져 있으면 403 (화면은 단추를 숨기지만 주소로 바로 보내는 것도 막는다) */
export async function requireSwitch(k: SwitchKey, code = 'feature_off'): Promise<void> {
  if (!(await switchOn(k))) throw new ApiError(403, code);
}
