// 출퇴근 폰 알림 — 아침 10시대에 한 번 더 (2026-10-21 의뢰인, 알림-13: 관리자 미출근 묶음은 근무 시작 + 1시간).
// Vercel 무료 요금제는 정기 작업이 하루 한 번 · 그 시간 안 아무 때나라, 9시 출근자의 10시 묶음을 위해 둔다. 하는 일은 /api/cron/absent-watch와 같다.
// Pro로 바꾸면 absent-watch를 10분마다로 바꾸고 이것과 punch-evening은 vercel.json에서 뺀다.
import { GET as watch } from '../absent-watch/route';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export function GET(req: Request): Promise<Response> {
  return watch(req);
}
