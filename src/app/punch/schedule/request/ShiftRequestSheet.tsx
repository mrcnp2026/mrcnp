// 근무일정 생성 요청 팝업 (2026-10-22 의뢰인: 「직원모드 홈 근무일정 생성 요청도 다른 생성 요청들처럼 팝업 형태로」).
// 정정 · 휴가 · 외근 요청처럼 지금 화면 위에 창으로 뜬다(AddSheet modal). 여는 곳: + 단추(Fab) · 홈 PC 단추 · 출퇴근 기록 · 요청 화면.
// 대기 중인 내 요청 목록 · 취소는 예전 화면(/punch/schedule/request)에 그대로 있다.
import { getTranslations } from 'next-intl/server';
import { AddSheet } from '@/components/AddSheet';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { ShiftRequestForm } from './ShiftRequestForm';

export const SHIFT_SHEET = 'shift';

export async function ShiftRequestSheet({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const t = await getTranslations('scheduleRequest');
  const { data: tpl } = await createAdminClient().from('shift_templates').select('id, name, start_time, end_time, kind').eq('active', true).order('name');
  const templates = (tpl ?? []).filter((x) => x.kind !== 'deemed' && !(x.name as string).startsWith('e2e-')).map((x) => ({ id: x.id as string, name: x.name as string, startTime: (x.start_time as string).slice(0, 5), endTime: (x.end_time as string).slice(0, 5), kind: x.kind as string }));
  return (
    <AddSheet id={SHIFT_SHEET} title={t('title')} defaultOpen={defaultOpen} modal>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('intro')}</p>
        <ShiftRequestForm today={toKstDate(new Date())} templates={templates} sheet={SHIFT_SHEET} />
      </div>
    </AddSheet>
  );
}
