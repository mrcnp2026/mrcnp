'use client';
// 정정 요청 양식 — 두 단계: ① 입력(종류 · 날짜 · 시각) → [다음: 요청사항 검토] → ② 검토(왼쪽 요청 사유 / 오른쪽 요청사항 다시 보기 + 안내) → [보내기]
// (2026-10-11 의뢰인 스샷 `스샷/직원모드 출퇴근기록 생성요청 승인권자.png`. 승인권자 고르기 · 파일 첨부 · 회사별 안내 문구는 결정 문서 요청-6 ~ 요청-8)
// 맨 위 「정정이 필요한 기록」 (2026-10-21 의뢰인): 빠진 출근 · 퇴근, 지각 · 조퇴를 늘어놓고 누르면 종류 · 날짜 · 고칠 기록 · 시각이 채워진다.
// 시각은 빠진 기록이면 그날 일정 시각, 지각 · 조퇴면 찍힌 시각으로 채운다 — 직원은 실제 시각으로 고치고 사유만 적으면 된다.
// 빠진 기록이 있으면 먼저 안내부터 (2026-10-21 의뢰인): 「10/20 퇴근 기록이 없습니다」(여러 건이면 「n건」) → [확인] → 날짜 · 종류가 채워진 줄에
// 시각만 고르고 바로 보낸다(검토 단계 없음, 여러 건이면 한 번에). 연차 · 휴일 · 이미 요청한 날은 처음부터 목록에 없다(lib/employee-data).
// 그 밖의 요청(시각 수정 · 잘못 찍은 기록 취소 · 목록에 없는 기록)은 「다른 정정 요청」으로 — 아래의 원래 양식.
import { DateTimeInput } from '@/components/DateTimeInput';
import { CalendarDays, CalendarX, Clock, Megaphone, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { currentPosition } from '@/components/current-position';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

type Type = 'add_missing' | 'modify' | 'void';
type Step = 'notice' | 'quick' | 'form';
export type TodoItem = { key: string; type: 'add_missing' | 'modify'; workDate: string; day: string; kind: 'in' | 'out'; eventId: string | null; time: string | null; title: string; sub: string; pending: boolean };
type Preset = { key: string | null; workDate: string | null; kind: 'in' | 'out' | null; eventId: string | null; time: string | null };
type Review = { date: string | null; record: string; time: string | null; nextDay: boolean };
const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function CorrectionForm(props: {
  today: string;
  initialDate: string | null;
  initialKind: 'in' | 'out' | null;
  events: { id: string; label: string }[];
  todo: TodoItem[];
  initialTodo: string | null; // 알림 · 배너에서 날짜와 종류를 들고 오면 그 줄을 미리 골라 둔다
}) {
  const t = useTranslations('corrections');
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const first = props.todo.find((x) => x.key === props.initialTodo) ?? null;
  const missing = props.todo.filter((x) => x.type === 'add_missing' && !x.pending);
  const others = props.todo.filter((x) => x.type !== 'add_missing');
  // 알림 · 배너에서 빠진 날을 들고 오면 안내는 건너뛰고 그날만 골라 둔다. 지각 · 조퇴를 들고 오면 원래 양식으로
  const [step, setStep] = useState<Step>(first ? (first.type === 'add_missing' ? 'quick' : 'form') : 'notice');
  const [off, setOff] = useState<Set<string>>(() => new Set(first?.type === 'add_missing' ? missing.filter((x) => x.workDate !== first.workDate).map((x) => x.key) : []));
  const shown: Step = step !== 'form' && missing.length === 0 ? 'form' : step; // 다 보내고 나면 원래 양식
  const [type, setType] = useState<Type>(first?.type ?? 'add_missing');
  const [preset, setPreset] = useState<Preset>(first ?? { key: null, workDate: props.initialDate, kind: props.initialKind, eventId: null, time: null });
  const [round, setRound] = useState(0); // 고를 때마다 입력 칸을 새로 그려 미리 채운 값이 들어가게
  const pick = (x: TodoItem) => {
    setType(x.type);
    setPreset(x);
    setRound((n) => n + 1);
    setSent(false);
  };
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [quickReason, setQuickReason] = useState(() => t('quick.reasons.forgot'));

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

  // 빠진 기록 — 날짜별로 묶어서 (그날 출근 · 퇴근이 둘 다 빠졌으면 한 칸에)
  const days = [...new Set(missing.map((x) => x.workDate))].map((d) => ({ d, day: missing.find((x) => x.workDate === d)!.day, items: missing.filter((x) => x.workDate === d) }));
  const kinds = (xs: TodoItem[]) => xs.map((x) => t(`kind.${x.kind}`)).join(' · ');
  const picked = missing.filter((x) => !off.has(x.key));
  const sendQuick = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (picked.length === 0) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    const geo = await currentPosition();
    const failed = new Set<string>();
    let lastErr: { code: string; requestId?: string } | null = null;
    for (const x of picked) {
      const r = await callApi('/api/corrections', { type: 'add_missing', workDate: x.workDate, kind: x.kind, time: fd.get(`time-${x.key}`), nextDay: fd.get(`next-${x.key}`) === 'on', reason: quickReason, geo });
      if (!r.ok) {
        failed.add(x.key);
        lastErr = r;
      }
    }
    setBusy(false);
    router.refresh();
    if (lastErr) {
      setOff(new Set(missing.filter((x) => !failed.has(x.key)).map((x) => x.key))); // 보낸 것은 빼고 실패한 것만 남긴다
      return setErr(lastErr);
    }
    setStep('notice');
    setOff(new Set());
    window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: 'correction' }));
  };
  const otherLink = (
    <button type="button" onClick={() => setStep('form')} className="min-h-11 text-sm font-semibold text-muted">
      {t('notice.other')}
    </button>
  );

  if (shown === 'notice')
    return (
      <Card>
        <div className="flex flex-col gap-4" data-correction-notice>
          <div className="flex items-start gap-3">
            <CalendarX aria-hidden size={24} className="mt-0.5 shrink-0 text-warn" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="num text-lg font-bold">{days.length === 1 ? t('notice.one', { day: days[0].day, what: kinds(days[0].items) }) : t('notice.many', { n: missing.length })}</p>
              {days.length > 1 && (
                <ul className="num flex flex-col gap-0.5 text-sm">
                  {days.map((g) => (
                    <li key={g.d}>{t('notice.line', { day: g.day, what: kinds(g.items) })}</li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-muted">{t('notice.hint')}</p>
            </div>
          </div>
          <Button type="button" onClick={() => setStep('quick')} className="w-full">
            {t('notice.ok')}
          </Button>
          {otherLink}
        </div>
      </Card>
    );

  if (shown === 'quick')
    return (
      <Card>
        <form className="flex flex-col gap-4" onSubmit={sendQuick} data-correction-quick>
          <p className="text-sm text-muted">{t('quick.hint')}</p>
          <ul className="flex flex-col gap-3">
            {days.map((g) => (
              <li key={g.d} className="flex flex-col gap-1 rounded-button border border-border p-3">
                <p className="num font-bold">{g.day}</p>
                {g.items.map((x) => {
                  const on = !off.has(x.key);
                  const flip = () =>
                    setOff((s) => {
                      const n = new Set(s);
                      if (on) n.add(x.key);
                      else n.delete(x.key);
                      return n;
                    });
                  return (
                    <div key={x.key} className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <label className="flex min-h-11 w-20 shrink-0 items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={on} onChange={flip} className="size-5" />
                          {t(`kind.${x.kind}`)}
                        </label>
                        <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-40'}`}>
                          <DateTimeInput name={`time-${x.key}`} type="time" required={on} defaultValue={x.time ?? ''} aria-label={`${g.day} ${t(`kind.${x.kind}`)}`} className={`num ${field}`} />
                        </div>
                      </div>
                      {x.kind === 'out' && on && (
                        <label className="flex min-h-9 items-center gap-2 pl-7 text-xs text-muted">
                          <input name={`next-${x.key}`} type="checkbox" className="size-4" />
                          {t('nextDay')}
                        </label>
                      )}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <label htmlFor="quick-reason" className="text-sm text-muted">
              {t('reason')}
            </label>
            <div className="flex flex-wrap gap-2">
              {(['forgot', 'phone', 'field'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={quickReason === t(`quick.reasons.${k}`)} onClick={() => setQuickReason(t(`quick.reasons.${k}`))} className={`min-h-9 rounded-chip border px-3 text-sm ${quickReason === t(`quick.reasons.${k}`) ? 'border-primary bg-primary-tint text-primary' : 'border-border'}`}>
                  {t(`quick.reasons.${k}`)}
                </button>
              ))}
            </div>
            <textarea id="quick-reason" required maxLength={200} rows={2} value={quickReason} onChange={(e) => setQuickReason(e.target.value)} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text" />
            <span className="text-xs text-faint">{t('reasonHint')}</span>
          </div>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="corrections" />}
          <Button type="submit" disabled={busy || picked.length === 0} className="w-full">
            {t('quick.send', { n: picked.length })}
          </Button>
          {otherLink}
        </form>
      </Card>
    );

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
            geo: await currentPosition(), // 보내는 순간의 위치 (결정 출퇴근-9) — 못 받으면 비워서 보낸다
          });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setSent(true);
          setReview(null);
          form.current?.reset();
          setPreset({ key: null, workDate: null, kind: null, eventId: null, time: null }); // 보낸 줄은 새로 읽으면 「검토 중」이 된다
          setRound((n) => n + 1);
          router.refresh();
        }}
      >
        {/* 검토 중에도 입력 칸은 그대로 둔다(가려 두기만) — 보낼 때 값을 여기서 읽는다 */}
        <div className={review ? 'hidden' : 'flex flex-col gap-3'}>
          {missing.length > 0 && (
            <button type="button" onClick={() => setStep('quick')} className="flex min-h-11 items-center justify-between gap-2 rounded-button border border-warn bg-warn-tint px-3 text-left text-sm font-semibold text-warn">
              {t('notice.back', { n: missing.length })}
              <span aria-hidden>›</span>
            </button>
          )}
          {others.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold">{t('todoTitle', { n: others.filter((x) => !x.pending).length })}</p>
              <p className="text-xs text-muted">{t('todoHint')}</p>
              <ul className="flex flex-col gap-2">
                {others.map((x) => {
                  const on = preset.key === x.key;
                  return (
                    <li key={x.key}>
                      <button
                        type="button"
                        disabled={x.pending}
                        aria-pressed={on}
                        onClick={() => pick(x)}
                        className={`flex min-h-12 w-full items-center gap-2 rounded-button border px-3 py-2 text-left disabled:opacity-60 ${on ? 'border-primary bg-primary-tint' : 'border-border bg-bg'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="num block text-sm font-semibold">{x.title}</span>
                          {x.sub && <span className="num block text-xs text-muted">{x.sub}</span>}
                        </span>
                        <span className={`shrink-0 text-xs font-bold ${x.pending ? 'text-muted' : 'text-primary'}`}>{x.pending ? t('todoPending') : on ? t('todoPicked') : t('todoPick')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-muted">{t('typeLabel')}</legend>
            {(['add_missing', 'modify', 'void'] as const).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="type" checked={type === k} onChange={() => setType(k)} className="size-5" />
                <span>{t(`type.${k}`)}</span>
              </label>
            ))}
          </fieldset>

          <div key={round} className="flex flex-col gap-3">
          {type === 'add_missing' ? (
            <>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('date')}
                <DateTimeInput name="workDate" type="date" required max={props.today} defaultValue={preset.workDate ?? ''} className={`num ${field}`} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('which')}
                <select name="kind" defaultValue={preset.kind ?? 'out'} className={field}>
                  <option value="in">{t('kind.in')}</option>
                  <option value="out">{t('kind.out')}</option>
                </select>
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('record')}
              <select name="targetId" required defaultValue={preset.eventId ?? undefined} className={field}>
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
                <DateTimeInput name="time" type="time" required defaultValue={preset.time ?? ''} className={`num ${field}`} />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input name="nextDay" type="checkbox" className="size-5" />
                {t('nextDay')}
              </label>
            </>
          )}
          </div>

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
