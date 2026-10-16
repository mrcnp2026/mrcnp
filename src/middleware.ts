// 로그인 세션 갱신 (Supabase 표준 방식). 권한 판단은 각 화면·API가 서버에서 다시 한다 — 여기서는 지점관리자가 허용 목록 밖의 관리 화면을 여는 것만 돌려보낸다.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_COOKIE, isConsolePath } from '@/config/console-paths';
import { unlockValidEdge } from '@/lib/console-unlock-edge';
import { MANAGER_HOME, managerCanOpen } from '@/lib/manager-rules';

export async function middleware(request: NextRequest) {
  // 서버 화면이 지금 주소를 알 수 있게 싣는다 (밖에서 보낸 같은 이름의 값은 덮어쓴다)
  const pathname = request.nextUrl.pathname;
  const pass = () => {
    const headers = new Headers(request.headers);
    headers.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers } });
  };
  let response = pass();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = pass();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // 세션 갱신. getClaims는 만료 전이면 서명만 검사하고(인증 서버 왕복 없음), 만료됐으면 새로 받아 쿠키에 쓴다
  const { data } = await supabase.auth.getClaims();
  // 지점관리자는 허용한 관리 화면만 연다 (manager-rules.ts). 화면 틀(layout)은 화면 사이를 옮길 때 다시 검사하지 않으므로 여기서 막는다.
  // 허용 목록 밖의 관리 화면을 열 때만 등급을 한 번 읽는다 — 본인 줄은 본인이 읽을 수 있다(RLS).
  const uid = data?.claims?.sub;
  if (uid && (pathname === '/admin' || pathname.startsWith('/admin/')) && !managerCanOpen(pathname)) {
    const { data: p } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (p?.role === 'manager') {
      const to = request.nextUrl.clone();
      to.pathname = MANAGER_HOME;
      to.search = '';
      const redirect = NextResponse.redirect(to);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }
  // 통합설정(특별관리자 모드) — 숫자 4자리로 연 표가 없으면 잠금 화면을 보여 준다(주소는 그대로). 화면을 옮길 때마다 여기서 본다 (2026-10-14 결정 사항 개발-29)
  if (uid && isConsolePath(pathname)) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const pin = secret ? await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false, autoRefreshToken: false } })
      .from('console_pins').select('pin_hash').eq('employee_id', uid).maybeSingle() : null;
    if (pin?.error || !(await unlockValidEdge(request.cookies.get(CONSOLE_COOKIE)?.value, uid, pin?.data?.pin_hash))) {
      const to = request.nextUrl.clone();
      to.pathname = '/admin/console-lock';
      const headers = new Headers(request.headers);
      headers.set('x-pathname', pathname);
      const rewrite = NextResponse.rewrite(to, { request: { headers } });
      response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
      return rewrite;
    }
  }
  // 다시 잠그기는 [관리자 모드로 나가기] · 위 띠의 모드 단추가 한다(components/DeskTop) — 30분이 지나도 잠긴다
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|manifest.webmanifest|sw.js|api/passkey).*)'],
};
