// 브라우저용 DB 연결 (로그인 세션). 권한 잠금 때문에 읽기만 된다 — 쓰기는 서버 API로 보낸다.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
