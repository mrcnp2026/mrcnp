// flags 문구 한곳. 집계 결과·CSV·화면이 같은 문자열을 쓰게 한다.
// 접두어 규칙 (①-4): 'block:'으로 시작하면 급여 계산을 막는다. 나머지는 경고·확인용이다.
// 화면에 보일 때는 번역 파일에서 이 값을 키로 찾아 직원 언어로 바꾼다 (4-10).

export const FLAG = {
  MISSING_OUT: '퇴근 미기록', // 4-8: 0으로 채우지 않고 드러낸다
  ORPHAN_OUT: '짝 없는 퇴근', // 출근 없이 퇴근만 있음 (7-2 요점 1)
  DUPLICATE_IN: '중복 출근', // 7-4 요점 2: 막지 않고 관리자가 판단
  DUPLICATE_OUT: '중복 퇴근',
  LEGAL_BREAK_UNCONFIRMED: '법정 휴게 미확인', // 7-6 요점 1: 모자란 휴게를 더 빼지 않는다
  WEEKLY_LIMIT_EXCEEDED: '주 52시간 초과', // 7-6 요점 5: 막지 않고 보이게만
  PENDING_OVERTIME: '미승인 연장', // 7-7 요점 3
  LEAVE_MODULE_MISSING: 'block:연차 모듈 미연결', // 7-14: 결근인지 연차인지 모른다 (연차 자료를 못 넘겨받았을 때만)
  LEAVE_DAY_PUNCH: '휴가일 출근 기록', // ②-2 7-3 요점 4: 자동으로 한쪽을 지우지 않고 관리자가 판단
} as const;
