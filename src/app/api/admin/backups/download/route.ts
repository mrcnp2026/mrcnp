// 백업 파일 내려받기 (2026-10-25: 보관소가 GitHub에서 다른 프로젝트의 저장공간으로 바뀜). 시스템관리자 + 숫자 4자리. 파일은 암호화돼 있다.
import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/api';
import { canDownloadBackup } from '@/lib/backup/github';
import { backupPrefix } from '@/lib/backup/run';
import { downloadStored } from '@/lib/backup/store';
import { requireConsole } from '@/lib/console-pin';

const OK = /^(prod|dev)\/db-\d{8}-\d{4,6}\.jsonl\.gz\.enc$/;

export async function GET(req: Request): Promise<Response> {
  try {
    const me = await requireConsole();
    if (!canDownloadBackup(me)) return new NextResponse('forbidden', { status: 403 });
    const name = new URL(req.url).searchParams.get('name') ?? '';
    if (!OK.test(name) || !name.startsWith(backupPrefix() + '/')) return new NextResponse('not_found', { status: 404 });
    const body = await downloadStored(name);
    console.log(JSON.stringify({ route: 'admin.backups.download', by: me.id, name, at: new Date().toISOString() }));
    return new NextResponse(new Uint8Array(body), { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name.split('/')[1]}"`, 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return new NextResponse(e.code, { status: e.status });
    console.error('admin.backups.download', e instanceof Error ? e.message.slice(0, 200) : e);
    return new NextResponse('error', { status: 500 });
  }
}
