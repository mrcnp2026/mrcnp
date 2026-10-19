// 백업 파일 내려받기 (통합설정 › 데이터베이스 백업, 2026-10-18 의뢰인) — 시스템관리자(사번 admin)가 숫자 4자리로 열었을 때만. 다른 최고관리자도 불가.
// GitHub가 몇 분만 열어 두는 서명 주소로 보낸다(파일을 이 서버로 거쳐 받지 않는다 · 토큰은 밖으로 나가지 않는다).
// 받은 파일은 암호화돼 있어 백업 비밀번호 없이는 열 수 없다. 누가 언제 받았는지는 서버 기록에 남긴다.
import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api';
import { backupConfigured, backupDownloadUrl, canDownloadBackup } from '@/lib/backup/github';
import { requireConsole } from '@/lib/console-pin';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const me = await requireConsole();
    if (!canDownloadBackup(me)) return new NextResponse('forbidden', { status: 403 });
    const { id } = await ctx.params;
    if (!/^\d{1,15}$/.test(id) || !backupConfigured()) return new NextResponse('not_found', { status: 404 });
    const file = await backupDownloadUrl(Number(id));
    if (!file) return new NextResponse('not_found', { status: 404 });
    console.log(JSON.stringify({ route: 'admin.backups.download', by: me.id, release: id, file: file.name, at: new Date().toISOString() }));
    return NextResponse.redirect(file.url, 302);
  } catch (e) {
    if (e instanceof ApiError) return new NextResponse(e.code, { status: e.status });
    console.error('admin.backups.download', e instanceof Error ? e.message.slice(0, 200) : e);
    return new NextResponse('error', { status: 500 });
  }
}
