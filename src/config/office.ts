// 흔들리는 값 한곳 모으기 (①-1 7-1).
// 사무실 이전·인터넷 교체·규칙 변경 때 이 파일 하나만 고치면 되게 유지한다.
// ② 설정 화면이 생기면 이 값들은 DB 설정으로 옮겨 가지만, 코드는 계속 OFFICE를 통해서만 읽는다.

function parseCidrs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 앱이 열리는 주소. 내 PC는 http://localhost:4123, 배포 후에는 열쇠 파일의 APP_ORIGIN (https://…)
function appOrigin(): string {
  return (process.env.APP_ORIGIN || 'http://localhost:4123').replace(/\/$/, '');
}

export const OFFICE = {
  // 4-5. 시간대는 여기에만 쓴다. 다른 파일에 'Asia/Seoul'을 직접 쓰지 마라.
  timezone: 'Asia/Seoul',

  // 사무실 인터넷 주소. 배열인 이유: 유동 IP·회선 이중화·IPv6 병행 (5장).
  // ⚠️ 새 주소를 확인하면 기존 값을 지우지 말고 앞에 추가하라 (9-5). IPv6는 /64 대역으로 (부록 R-6의 3).
  allowedCidrs: parseCidrs(process.env.OFFICE_CIDRS),

  absentCheckTime: '10:00', // 이 시각 이후 미출근을 '결근 후보'로 표시

  // ★ 의뢰인 확정(2026-09-28): 상시 5인 이상. ② 설정 화면이 생기면 그 값이 대체한다 (7-14)
  workplaceSize: '5_or_more' as '5_or_more' | 'under_5',
  overtimeReviewThresholdMin: 30, // 7-7 요점 2. 이 분 이상이어야 승인 대기에 올린다
  missingOutGraceHours: 2, // 7-8. 기준 퇴근 + 이 시간이 지나야 '퇴근 미기록'
  missingInGraceMin: 30, // 7-8. 기준 출근 + 이 분이 지나야 '출근 미기록'
  weeklyCautionHours: 48, // 7-13
  weeklyLimitHours: 52, // 7-13

  // ── 폰 등록(패스키, 4-11·7-12) ──
  // ⚠️⚠️ 패스키는 이 주소의 도메인(rpID)에 묶인다. localhost에서 등록한 폰은 배포 주소에서 안 되고,
  //      배포 도메인을 나중에 바꾸면 전 직원의 폰 등록이 한꺼번에 무효가 된다 (6장 경고, B-13).
  //      그래서 실제 도메인을 게이트 9에서 확정한 뒤 직원을 등록한다. rpID는 여기서만 정한다.
  appOrigin: appOrigin(),
  rpID: new URL(appOrigin()).hostname,
  rpName: 'Attendance',
  challengeTtlMin: 5, // 7-12 요점 2: 챌린지는 1회용·5분 만료
  inviteValidHours: 72, // 초대 QR 유효 시간. 지나면 관리자가 새로 발급한다

  // 부록 R-12-2: 계산 모듈(worktime·overtime·lateness·labor-rules)을 바꿀 때마다 올린다.
  // 집계 결과를 저장하는 곳에 함께 남겨 "어느 숫자가 어느 코드로 나왔는지" 알게 한다.
  calcVersion: '2026.10-1',

  // 부록 R-5의 7: 진단용 IP 로그 보존 기간(일). 본문이 값을 비워 둬서 부록이 30일로 정함
  diagIpLogRetentionDays: 30,
} as const;
