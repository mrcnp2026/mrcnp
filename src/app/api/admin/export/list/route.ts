// 목록 내려받기 (PC 목록 머리의 [다운로드], 2026-10-11 의뢰인 스샷 22 · 86) — kind=members(직원) · leave(휴가 내역).
// ★ 내려주기 전에 download_logs에 먼저 쓴다 — 쓰기가 실패하면 내려주지 않는다 (7-18 요점 1: 개인정보 반출의 증거).
// 모든 관리자가 받을 수 있다 (금액 없음, R-10-6).
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { buildListWorkbook, type ListSheet } from '@/lib/export-list';
import { loadAllLeaveTypes, loadLeaveRequests } from '@/lib/leave-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadAllStaffDetails } from '@/lib/staff-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const STATUS = { pending: '대기', approved: '승인', rejected: '거절', cancelled: '취소' } as const;
const YEAR = /^\d{4}$/;

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind');
  if (kind !== 'members' && kind !== 'leave') return deny(400, 'invalid_input');
  const db = createAdminClient();
  const now = new Date();
  const stamp = toKstDate(now).replace(/-/g, '');
  // 검사 전용 계정(e2e-…)은 화면 목록과 같이 뺀다
  const { data: people } = await db.from('profiles').select('id, name, employee_no, role, active, group_id, job_title, joined_on, password_set_at').order('name');
  const staff = (people ?? []).filter((p) => !p.employee_no?.startsWith('e2e-'));

  let sheet: ListSheet;
  let scope: string;
  let fileName: string;
  if (kind === 'members') {
    const [groups, det] = await Promise.all([loadOrgGroups(), loadAllStaffDetails()]);
    scope = 'all';
    fileName = `직원목록_${stamp}.xlsx`;
    sheet = {
      title: '직원',
      cols: [{ h: '이름', w: 14 }, { h: '사번', w: 12 }, { h: '권한', w: 10 }, { h: '부서', w: 24 }, { h: '직책', w: 14 }, { h: '입사일', w: 12 }, { h: '상태', w: 10 }, { h: '가입', w: 10 },
        // 개인 정보 (묶음 17) — 직원이 직접 넣은 값
        { h: '생년월일', w: 12 }, { h: '비상연락처', w: 36 }, { h: '보유 자격증', w: 40 }, { h: '차종', w: 14 }, { h: '차량번호', w: 14 }],
      rows: staff.map((p) => {
        const d = det.get(p.id);
        return [
          p.name, p.employee_no, p.role === 'admin' ? '관리자' : p.role === 'manager' ? '지점관리자' : '직원', groupPath(groups, p.group_id), p.job_title, p.joined_on, p.active ? '활성' : '비활성', p.password_set_at ? '가입' : '미가입',
          d?.birthDate ?? null,
          d?.emergencyContacts.map((c) => `${c.name}${c.relation ? `(${c.relation})` : ''} ${c.phone}`).join(', ') || null,
          d?.certificates.map((c) => [c.name, c.acquiredOn, c.number].filter(Boolean).join(' ')).join(', ') || null,
          d?.carModel ?? null, d?.carNumber ?? null,
        ];
      }),
    };
  } else {
    const practice = OFFICE.practiceMode && sp.get('live') !== '1';
    const y = sp.get('y');
    const year = y && YEAR.test(y) ? y : toKstDate(now).slice(0, 4);
    const [reqs, types] = await Promise.all([loadLeaveRequests({ from: `${year}-01-01`, to: `${year}-12-31`, practice }), loadAllLeaveTypes()]);
    const who = new Map(staff.map((p) => [p.id, p]));
    const typeName = new Map(types.map((x) => [x.code, x.name]));
    scope = practice ? `${year}:practice` : year;
    fileName = `휴가내역_${year}_${stamp}${practice ? '_연습' : ''}.xlsx`;
    sheet = {
      title: '휴가 내역',
      cols: [{ h: '이름', w: 14 }, { h: '사번', w: 12 }, { h: '휴가 유형', w: 16 }, { h: '시작일', w: 12 }, { h: '종료일', w: 12 }, { h: '시작 시각', w: 10 }, { h: '종료 시각', w: 10 }, { h: '일수', w: 8 }, { h: '상태', w: 8 }, { h: '신청일', w: 12 }, { h: '처리일', w: 12 }, { h: '처리한 사람', w: 14 }],
      rows: reqs
        .filter((r) => who.has(r.employeeId))
        .map((r) => {
          const p = who.get(r.employeeId)!;
          return [p.name, p.employee_no, typeName.get(r.typeCode) ?? r.typeCode, r.startDate, r.endDate, r.startTime?.slice(0, 5) ?? null, r.endTime?.slice(0, 5) ?? null, r.days, STATUS[r.status], r.createdAt ? toKstDate(new Date(r.createdAt)) : null, r.decidedAt ? toKstDate(new Date(r.decidedAt)) : null, r.approvedBy ? (who.get(r.approvedBy)?.name ?? null) : null];
        }),
    };
  }

  const { error } = await db.from('download_logs').insert({ actor_id: me.id, kind: `list_${kind}`, scope, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');

  const buf = await buildListWorkbook(sheet, me.name).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="list-${kind}_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
