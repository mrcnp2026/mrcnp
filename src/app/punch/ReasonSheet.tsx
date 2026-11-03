'use client';
// 출근 · 퇴근을 찍은 뒤 사유를 묻는 창 (2026-10-18 의뢰인: 지각 · 사무실 밖 · 휴일 · 연장 · 야간일 때 자연스럽게 안내해 한 번에).
// - 기록은 이미 남은 뒤에 뜬다(찍기를 늦추지 않는다). 사유를 적어야 닫힌다 — 「나중에」는 뺐다(2026-11-04 의뢰인: 「나중에가 있으니 제시간에 제대로 안 한다」).
// - 직원은 연장 · 야간 · 휴일 중 무엇을 요청할지 고르지 않는다 — 앱이 시각으로 계산하고, 관리자가 하루 카드에서 한 번에 승인한다.
// - 쓴 내용은 그날 근무노트에 덧붙여 저장되고 관리자의 요청 카드에 「직원이 남긴 사유」로 보인다.
// - 사무실 밖에서 출근했고 승인된 외근이 없으면 일하는 곳을 적어 외근 신청까지 바로 보낸다(고르는 칸 없음, 2026-11-04 의뢰인).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { currentPosition } from '@/components/current-position';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

import type { ReasonAsk } from '@/lib/reason-ask';
export { reasonAsk, type ReasonAsk } from '@/lib/reason-ask';

const NOTE_MAX = 200;

export function ReasonSheet({ ask, today, note, canAskWork, onClose }: { ask: ReasonAsk; today: string; note: string | null; canAskWork: boolean; onClose: () => void }) {
  const t = useTranslations('home.reason');
  const router = useRouter();
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const offerWork = canAskWork && ask.kind === 'in' && ask.reasons.includes('outside');

  async function save() {
    setBusy(true);
    setErr(null);
    const line = text.trim();
    if (line) {
      const body = (note ? `${note}\n${line}` : line).slice(-NOTE_MAX); // 그날 노트에 덧붙인다 — 넘치면 앞쪽을 줄인다
      const r = await callApi('/api/notes', { body });
      if (!r.ok) {
        setBusy(false);
        return setErr(r);
      }
    }
    if (offerWork) {
      const r = await callApi('/api/work', { kind: 'outside', startDate: today, endDate: today, startTime: null, endTime: null, place: place.trim() || line.slice(0, 100), reason: line || null, geo: await currentPosition() });
      if (!r.ok && r.code !== 'duplicate_request') {
        setBusy(false);
        return setErr(r);
      }
    }
    setBusy(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-text/40 md:items-center" role="dialog" aria-modal="true" aria-labelledby="reason-title">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-t-card bg-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-card">
        <h2 id="reason-title" className="text-lg font-bold">{t(ask.kind === 'in' ? 'titleIn' : 'titleOut')}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {ask.reasons.map((r) => (
            <li key={r} className="rounded-button bg-warn-tint px-3 py-2 text-warn">
              {t(`why.${r}`, { late: ask.lateMin, over: ask.overMin })}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t(ask.kind === 'in' ? 'askIn' : 'askOut')}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 150))}
          rows={3}
          placeholder={t(ask.kind === 'in' ? 'phIn' : 'phOut')}
          aria-label={t('label')}
          className="w-full rounded-button border border-border bg-bg p-3 text-base text-text"
        />
        {offerWork && (
          <div className="flex flex-col gap-2 rounded-button bg-surface p-3">
            <p className="text-sm font-semibold">{t('askWork')}</p>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value.slice(0, 100))}
              placeholder={t('placePh')}
              aria-label={t('placePh')}
              className="min-h-11 rounded-button border border-border bg-bg px-3 text-base"
            />
          </div>
        )}
        <p className="text-xs text-faint">{t('note')}</p>
        {err && <ErrorNote code={err.code} requestId={err.requestId} />}
        <Button className="w-full" disabled={busy || !text.trim() || (offerWork && !place.trim())} onClick={save}>
          {t(offerWork ? 'saveWork' : 'save')}
        </Button>
      </div>
    </div>
  );
}
