// 목록 내려받기 (PC 목록 머리의 [다운로드], 2026-10-11 의뢰인 스샷 22 · 86) — kind=members(직원) · leave(휴가 내역) · hrlog(인사 기록 = 인사 기록 글 · 퇴사 · 복직 · 권한 · 입사일 · 엑셀 내려받기, 2026-10-25).
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
import { loadHrLog } from '@/lib/hr-log';
import { mailOverview } from '@/lib/payroll/slip-mail-overview';
import { loadAllStaffDetails } from '@/lib/staff-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin'; // 시스템관리자는 목록에 보이지 않는다 (2026-10-18)

const STATUS = { pending: '대기', approved: '승인', rejected: '거절', cancelled: '취소' } as const;
const HR_KIND = { resign: '퇴사', reinstate: '복직', note: '기록', role: '권한 변경', joined: '입사일 수정', download: '엑셀 내려받기' } as const;
const YEAR = /^\d{4}$/;

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind');
  if (kind !== 'members' && kind !== 'leave' && kind !== 'hrlog' && kind !== 'slipmail') return deny(400, 'invalid_input');
  const db = createAdminClient();
  const now = new Date();
  const stamp = toKstDate(now).replace(/-/g, '');
  // 검사 전용 계정(e2e-…)은 화면 목록과 같이 뺀다
  const { data: people } = await db.from('profiles').select('id, name, employee_no, role, active, group_id, job_title, joined_on, password_set_at').or(NOT_SYSTEM_ADMIN).order('name');
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
  } else if (kind === 'hrlog') {
    const [groups, log] = await Promise.all([loadOrgGroups(), loadHrLog()]);
    scope = 'all';
    fileName = `인사변동이력_${stamp}.xlsx`;
    sheet = {
      title: '인사 변동',
      cols: [{ h: '구분', w: 8 }, { h: '이름', w: 14 }, { h: '사번', w: 12 }, { h: '부서', w: 24 }, { h: '입사일', w: 12 }, { h: '날짜', w: 12 }, { h: '내용(사유)', w: 60 }, { h: '작성 · 처리한 사람', w: 16 }, { h: '지금', w: 8 }],
      rows: log.map((r) => [HR_KIND[r.kind], r.name, r.employeeNo, groupPath(groups, r.groupId), r.joinedOn, r.on, r.reason, r.actor, r.active ? '재직' : '퇴사']),
    };
  } else if (kind === 'slipmail') {
    // 급여명세서 발송 내역 (2026-10-25 의뢰인) — 그 달에 공개 중인 명세서마다 마지막 발송 결과. 급여를 볼 수 있는 관리자만
    if (!me.canViewPayroll) return deny(403, 'forbidden');
    const ym = sp.get('m');
    if (!ym || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return deny(400, 'invalid_input');
    const [groups, { rows, tableMissing }] = await Promise.all([loadOrgGroups(), mailOverview(ym, OFFICE.practiceMode)]);
    if (tableMissing) return deny(409, 'db_pending');
    const info = new Map(staff.map((p) => [p.id as string, p]));
    const RESULT = { SENT: '발송 완료', FAILED: '실패', NONE: '아직 안 보냄', NO_EMAIL: '이메일 없음', NO_BIRTH: '생년월일 없음' } as const;
    scope = ym;
    fileName = `급여명세서발송_${ym}_${stamp}.xlsx`;
    sheet = {
      title: '급여명세서 발송',
      cols: [{ h: '이름', w: 14 }, { h: '사번', w: 12 }, { h: '부서', w: 24 }, { h: '상태', w: 14 }, { h: '받는 이메일', w: 34 }, { h: '마지막 시도', w: 18 }, { h: '오류 코드', w: 16 }],
      rows: rows
        .map((r) => [info.get(r.employeeId), r] as const)
        .filter(([p]) => !!p)
        .sort(([a, ra], [b, rb]) => (ra.result === 'SENT' ? 1 : 0) - (rb.result === 'SENT' ? 1 : 0) || String(a!.name).localeCompare(String(b!.name), 'ko'))
        .map(([p, r]) => [p!.name, p!.employee_no, groupPath(groups, p!.group_id), RESULT[r.result], r.toEmail ?? null, r.at ? new Date(r.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : null, r.errorCode]),
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
      cols: [{ h: '이름', w: 14 }, { h: '사번', w: 12 }, { h: '휴가 유형', w: 16 }, { h: '시작일', w: 12 }, { h: '종료일', w: 12 }, { h: '시작 시각', w: 10 }, { h: '종료 시각', w: 10 }, { h: '일수', w: 8 }, { h: '상태', w: 8 }, { h: '신청일', w: 12 }, { h: '날짜', w: 12 }, { h: '처리한 사람', w: 14 }],
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
