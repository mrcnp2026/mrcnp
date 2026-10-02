// 서버 전용 DB 연결 (service_role).
// 기록(punch_events·punch_corrections·overtime_requests)을 쓰는 것은 이 연결뿐이다 (6장 1.3판 권한 잠금).
// 'server-only' 때문에 브라우저 코드에서 import하면 빌드가 실패한다 — service_role 키가 브라우저로 나가지 않게 (9-4).
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase server keys are missing in code/.env.local (see .env.sample)');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
