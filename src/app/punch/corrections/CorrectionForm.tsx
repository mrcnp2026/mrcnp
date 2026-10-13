'use client';
// 정정 요청 양식 — 두 단계: ① 입력(종류 · 날짜 · 시각) → [다음: 요청사항 검토] → ② 검토(왼쪽 요청 사유 / 오른쪽 요청사항 다시 보기 + 안내) → [보내기]
// (2026-10-11 의뢰인 스샷 `스샷/직원모드 출퇴근기록 생성요청 승인권자.png`. 승인권자 고르기 · 파일 첨부 · 회사별 안내 문구는 결정 문서 요청-6 ~ 요청-8)
import { DateTimeInput } from '@/components/DateTimeInput';
import { CalendarDays, Clock, Megaphone, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

type Type = 'add_missing' | 'modify' | 'void';
type Review = { date: string | null; record: string; time: string | null; nextDay: boolean };
const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function CorrectionForm(props: {
  today: string;
  initialDate: string | null;
  initialKind: 'in' | 'out' | null;
  events: { id: string; label: string }[];
}) {
  const t = useTranslations('corrections');
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<Type>('add_missing');
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  // 입력이 다 찼을 때만 검토로 넘어간다 (빈 칸은 브라우저가 알려 준다)
  const toReview = () => {
    const el = form.current;
    if (!el || !el.reportValidity()) return;
    const fd = new FormData(el);
    setSent(false);
    setErr(null);
    setReview({
      date: type === 'add_missing' ? String(fd.get('workDate') ?? '') : null,
      record: type === 'add_missing' ? t(`kind.${fd.get('kind') === 'in' ? 'in' : 'out'}`) : (props.events.find((e) => e.id === fd.get('targetId'))?.label ?? ''),
      time: type === 'void' ? null : String(fd.get('time') ?? ''),
      nextDay: fd.get('nextDay') === 'on',
    });
  };
  const line = 'flex items-start gap-3 text-sm';
  const term = 'flex w-24 shrink-0 items-center gap-2 text-muted';

  return (
    <Card>
      <form
        ref={form}
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!review) return toReview(); // 입력 칸에서 Enter를 눌러도 검토를 거친다
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/corrections', {
            type,
            workDate: fd.get('workDate'),
            kind: fd.get('kind'),
            targetId: fd.get('targetId'),
            time: fd.get('time'),
            nextDay: fd.get('nextDay') === 'on',
            reason: fd.get('reason'),
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(true);
          setReview(null);
          form.current?.reset();
          router.refresh();
        }}
      >
        {/* 검토 중에도 입력 칸은 그대로 둔다(가려 두기만) — 보낼 때 값을 여기서 읽는다 */}
        <div className={review ? 'hidden' : 'flex flex-col gap-3'}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-muted">{t('typeLabel')}</legend>
            {(['add_missing', 'modify', 'void'] as const).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="type" checked={type === k} onChange={() => setType(k)} className="size-5" />
                <span>{t(`type.${k}`)}</span>
              </label>
            ))}
          </fieldset>

          {type === 'add_missing' ? (
            <>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('date')}
                <DateTimeInput name="workDate" type="date" required max={props.today} defaultValue={props.initialDate ?? ''} className={`num ${field}`} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('which')}
                <select name="kind" defaultValue={props.initialKind ?? 'out'} className={field}>
                  <option value="in">{t('kind.in')}</option>
                  <option value="out">{t('kind.out')}</option>
                </select>
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('record')}
              <select name="targetId" required className={field}>
                {props.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type !== 'void' && (
            <>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('time')}
                <DateTimeInput name="time" type="time" required className={`num ${field}`} />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input name="nextDay" type="checkbox" className="size-5" />
                {t('nextDay')}
              </label>
            </>
          )}

          {sent && <p className="text-sm font-semibold text-ok">{t('sent')}</p>}
          <Button type="button" onClick={toReview} className="w-full">
            {t('next')}
          </Button>
        </div>

        {review && (
          <>
            <h3 className="text-lg font-bold">{t('reviewTitle')}</h3>
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('reason')}
                <textarea name="reason" required maxLength={200} rows={4} autoFocus className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
                <span className="text-xs text-faint">{t('reasonHint')}</span>
              </label>
              <div className="flex flex-col gap-3 lg:border-l lg:border-border lg:pl-6">
                <p className="font-bold">{t('reviewWhat')}</p>
                <p className="self-start rounded-button border border-border px-2 text-sm font-bold"># {t(`type.${type}`)}</p>
                <dl className="flex flex-col gap-2">
                  {review.date && (
                    <div className={line}>
                      <dt className={term}>
                        <CalendarDays aria-hidden size={16} />
                        {t('date')}
                      </dt>
                      <dd className="num font-bold text-primary">{review.date}</dd>
                    </div>
                  )}
                  <div className={line}>
                    <dt className={term}>
                      <Pencil aria-hidden size={16} />
                      {t(type === 'add_missing' ? 'which' : 'record')}
                    </dt>
                    <dd className="font-bold break-words">{review.record}</dd>
                  </div>
                  {review.time && (
                    <div className={line}>
                      <dt className={term}>
                        <Clock aria-hidden size={16} />
                        {t('time')}
                      </dt>
                      <dd className="num font-bold text-primary">
                        {review.time}
                        {review.nextDay && <span className="ml-2 text-xs font-normal text-muted">{t('reviewNextDay')}</span>}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="flex items-start gap-2 rounded-button bg-primary-tint p-3 text-sm">
                  <Megaphone aria-hidden size={16} className="mt-0.5 shrink-0 text-primary" />
                  {t('reviewNotice')}
                </p>
              </div>
            </div>
            {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="corrections" />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                {t('reviewBack')}
              </Button>
              <Button type="submit" disabled={busy}>
                {t('submit')}
              </Button>
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
