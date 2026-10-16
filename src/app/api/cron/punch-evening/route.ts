// 출퇴근 폰 알림 — 밤 한 번 더 (Vercel 무료 요금제는 정기 작업 하나가 하루 한 번이라, 퇴근 미기록 알림을 위해 밤 21시대에 같은 일을 한 번 더 부른다, 2026-10-16).
// 하는 일은 /api/cron/absent-watch와 같다. Pro로 바꾸면 absent-watch를 10분마다로 바꾸고 이것은 vercel.json에서 뺀다.
import { GET as watch } from '../absent-watch/route';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export function GET(req: Request): Promise<Response> {
  return watch(req);
}
