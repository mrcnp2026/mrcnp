// 로그인 뒤 첫 화면 = 모두 출퇴근 화면 (PWA 진입점, 6장 파일 트리).
// 2026-10-02 의뢰인: 관리자도 출퇴근 홈에서 시작하고, 「직원관리」로 관리자 화면에 들어갔다가 「홈」을 누르면 여기로 돌아온다.
import 'server-only';

export const LANDING_PATH = '/punch';

export function homePathForRole(): string {
  return LANDING_PATH;
}

export async function homePathFor(): Promise<string> {
  return LANDING_PATH;
}
