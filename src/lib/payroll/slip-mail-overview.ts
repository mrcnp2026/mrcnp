// 운영 현황의 명세서 메일 발송 현황 (2026-10-24 의뢰인) — 그 달에 공개 중인 명세서와 마지막 발송 결과. 서버 전용.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPublication } from './publish-data';
import { lastMailBySlip, loadSlipMails, type MailResult } from './slip-mail';
import { loadUploads } from './slip-upload-data';

/** 그 달에 지금 공개 중인 명세서 전부(계산한 대장 + 올린 명세서) */
export async function publishedSlips(month: string, practice: boolean): Promise<{ employeeId: string; slipId: string }[]> {
  // 올린 명세서와 확정 대장 조회를 동시에, 대장마다 공개 조회도 동시에 (2026-10-25: 앞 조회가 끝나길 기다리느라 느렸다)
  const [uploads, runsRes] = await Promise.all([
    loadUploads(month, practice),
    createAdminClient().from('payroll_runs').select('id, current_generation_id').eq('period_from', `${month}-01`).eq('status', 'FINALIZED').eq('is_test', practice),
  ]);
  if (runsRes.error) throw new Error(`publishedSlips: ${runsRes.error.code}`);
  const out: { employeeId: string; slipId: string }[] = [];
  for (const u of uploads ?? []) if (u.state === 'PUBLISHED') out.push({ employeeId: u.employeeId, slipId: u.id });
  const pubs = await Promise.all((runsRes.data ?? []).map((r) => loadPublication(r.id as string, (r.current_generation_id as string | null) ?? null)));
  for (const pub of pubs) for (const [employeeId, v] of pub) if (v.published) out.push({ employeeId, slipId: v.statementId });
  return out;
}

/** 명세서마다 마지막 결과 (기록 없음 = 아직 안 보냄). 표가 없으면 tableMissing */
export type MailStatusRow = { employeeId: string; slipId: string; result: MailResult | 'NONE'; toEmail: string | null; errorCode: string | null; at: string | null };
export async function mailOverview(month: string, practice: boolean): Promise<{ rows: MailStatusRow[]; tableMissing: boolean }> {
  const slips = await publishedSlips(month, practice);
  const mails = await loadSlipMails(slips.map((x) => x.slipId));
  if (mails === null) return { rows: [], tableMissing: true };
  const last = lastMailBySlip(mails);
  return { tableMissing: false, rows: slips.map((x) => { const m = last.get(x.slipId); return { ...x, result: m?.result ?? 'NONE', toEmail: m?.toEmail ?? null, errorCode: m?.errorCode ?? null, at: m?.at ?? null }; }) };
}
