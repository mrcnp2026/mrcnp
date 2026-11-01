// 로그인 세션 갱신 (Supabase 표준 방식) + 관리자 모드(/admin)의 문 — 로그인 · 등급을 화면을 옮길 때마다 여기서 본다(아래). 각 화면 · API도 서버에서 다시 판단한다.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_COOKIE, isConsolePath } from '@/config/console-paths';
import { unlockValidEdge } from '@/lib/console-unlock-edge';
import { authTimeOf, sessionRevoked } from '@/lib/login-rules';
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
  // 관리자 모드(/admin)의 문 — 화면 틀(layout)은 화면 사이를 옮길 때(RSC 요청) 다시 실행되지 않아, 틀의 확인만으로는
  // 「화면 이동 요청」으로 꾸민 요청에 관리 화면 본문(서버 권한으로 읽은 자료)이 그대로 나갔다 (2026-11-01 점검 · 개발 서버에서 재현).
  // 그래서 /admin 요청은 매번 여기서 본다: 로그인 없음 → /login, 퇴사 · 초기화 전 세션 → /login, 직원 → /punch,
  // 지점관리자는 허용한 화면만(manager-rules.ts). 최고관리자 · 시스템관리자(role admin)는 그대로 통과. 판단 기준은 lib/auth.ts getMe와 같다.
  // 본인 줄은 본인이 읽을 수 있다(RLS).
  const uid = data?.claims?.sub;
  const go = (path: string) => {
    const to = request.nextUrl.clone();
    to.pathname = path;
    to.search = '';
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!uid) return go('/login');
    const { data: p } = await supabase.from('profiles').select('role, active, sessions_revoked_at').eq('id', uid).maybeSingle();
    if (!p || !p.active || sessionRevoked(authTimeOf(data.claims), p.sessions_revoked_at)) return go('/login');
    if (p.role === 'manager') {
      if (!managerCanOpen(pathname)) return go(MANAGER_HOME);
    } else if (p.role !== 'admin') return go('/punch');
  }
  // 통합설정(최고관리자 모드) — 숫자 4자리로 연 표가 없으면 잠금 화면을 보여 준다(주소는 그대로). 화면을 옮길 때마다 여기서 본다 (2026-10-14 결정 사항 개발-29)
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
