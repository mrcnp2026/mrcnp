// 인사기록카드 PDF (2026-10-29 남은 일 9-4) — 최고관리자만. 내려받으면 내려받기 기록이 남는다(개인정보가 든 파일).
import { randomUUID } from 'node:crypto';
import { getLocale } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { buildHrCard } from '@/lib/hr-card';
import { hrCardPdfBytes } from '@/lib/hr-card-pdf';
import { pdfResponse } from '@/lib/payroll/paper-pdf';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(404, 'not_found');
  const locale = await getLocale();
  const card = await buildHrCard(id, me, locale);
  if (!card) return deny(404, 'not_found');
  const { bytes, file } = await hrCardPdfBytes(card, locale);
  await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'hr_card', scope: id, file_name: file });
  return pdfResponse(bytes, file, `hr_card_${card.printedOn}.pdf`, randomUUID());
}
