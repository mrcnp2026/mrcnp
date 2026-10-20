'use client';
// 교육 관리 화면의 조작부 (묶음 33, 2026-10-20) — 교육 만들기 · 고치기, 교육 종류 고치기, 대상 넣기 · 빼기 · 종이 서명 옮겨 적기, 다시 알림, 사진, 취소.
import { Camera, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { CYCLES, type Course, type Session } from '@/lib/training-rules';

const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
type Opt = { id: string; label: string };
type Err = { code: string; requestId?: string } | null;

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>('/api/admin/training', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}

/** 사람 고르기 — 체크 상자 묶음(모두 · 모두 풀기) */
function PickList({ options, picked, setPicked, label }: { options: Opt[]; picked: string[]; setPicked: (v: string[]) => void; label: string }) {
  const t = useTranslations('admin.training');
  return (
    <div className="flex flex-col gap-2 rounded-button border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{label} {t('pickedCount', { n: picked.length })}</span>
        <span className="flex gap-3 text-xs">
          <button type="button" className="font-semibold text-primary" onClick={() => setPicked(options.map((o) => o.id))}>{t('all')}</button>
          <button type="button" className="font-semibold text-muted" onClick={() => setPicked([])}>{t('none')}</button>
        </span>
      </div>
      <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.id} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(o.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** 교육 만들기 · 고치기. 만들 때 대상: 교육 종류의 대상(기본) 또는 직접 고르기 */
export function SessionForm({ courses, people, today, initial }: { courses: Course[]; people: Opt[]; today: string; initial?: Session }) {
  const t = useTranslations('admin.training');
  const { busy, err, send, router } = useCall();
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const r = await send<{ id: string }>({ action: initial ? 'session.update' : 'session.create', ...(initial ? { id: initial.id, courseId: initial.courseId } : {}), ...f, ...(!initial && pickMode ? { employeeIds: picked } : {}) });
        if (r && !initial) {
          window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: 'training-new' }));
          router.push(`/admin/training/${r.id}`);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!initial && (
          <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className="text-muted">{t('fCourse')}</span>
            <select name="courseId" required className={field} defaultValue="">
              <option value="">{t('pick')}</option>
              {courses.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('fDate')}</span>
          <input type="date" name="heldOn" required defaultValue={initial?.heldOn ?? today} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-muted">{t('fStart')}</span>
            <input type="time" name="startTime" defaultValue={initial?.startTime ?? ''} className={field} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-muted">{t('fEnd')}</span>
            <input type="time" name="endTime" defaultValue={initial?.endTime ?? ''} className={field} />
          </label>
        </div>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('fInstructor')}</span>
          <input name="instructor" maxLength={60} defaultValue={initial?.instructor ?? ''} className={field} autoComplete="off" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('fPlace')}</span>
          <input name="place" maxLength={100} defaultValue={initial?.place ?? ''} className={field} autoComplete="off" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <span className="text-muted">{t('fContent')}</span>
          <textarea name="content" maxLength={4000} rows={5} defaultValue={initial?.content ?? ''} className={`${field} py-2`} />
        </label>
      </div>
      {!initial && (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-9 items-center gap-2">
            <input type="checkbox" className="size-5 accent-primary" checked={pickMode} onChange={(e) => setPickMode(e.target.checked)} />
            {t('pickPeople')}
          </label>
          {pickMode ? <PickList options={people} picked={picked} setPicked={setPicked} label={t('targets')} /> : <p className="text-xs text-faint">{t('targetsByCourse')}</p>}
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.training.err" />}
      <div>
        <Button type="submit" disabled={busy || (pickMode && !picked.length)}>{t(initial ? 'saveSession' : 'createSession')}</Button>
      </div>
    </form>
  );
}

/** 교육 종류 고치기 · 새로 만들기 */
export function CourseForm({ initial, jobs, groups, people }: { initial?: Course; jobs: Opt[]; groups: Opt[]; people: Opt[] }) {
  const t = useTranslations('admin.training');
  const { busy, err, send } = useCall();
  const [jobIds, setJobIds] = useState<string[]>(initial?.targets.jobIds ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.targets.groupIds ?? []);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial?.targets.employeeIds ?? []);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setSaved(false);
        const r = await send({ action: 'course.save', id: initial?.id ?? null, name: f.get('name'), law: f.get('law'), cycle: f.get('cycle'), hours: f.get('hours'), signatureRequired: f.get('signatureRequired') === 'on', needsCheck: f.get('needsCheck') === 'on', active: f.get('active') === 'on', targets: { jobIds, groupIds, employeeIds } });
        if (r) setSaved(true);
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <span className="text-muted">{t('cName')}</span>
          <input name="name" required maxLength={60} defaultValue={initial?.name ?? ''} className={field} autoComplete="off" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('cCycle')}</span>
          <select name="cycle" defaultValue={initial?.cycle ?? 'YEAR'} className={field}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>{t(`cycle.${c}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('cHours')}</span>
          <input name="hours" inputMode="decimal" defaultValue={initial?.hours ?? ''} className={`num ${field}`} autoComplete="off" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <span className="text-muted">{t('cLaw')}</span>
          <input name="law" maxLength={100} defaultValue={initial?.law ?? ''} className={field} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <label className="flex min-h-9 items-center gap-2"><input type="checkbox" name="signatureRequired" defaultChecked={initial?.signatureRequired ?? false} className="size-5 accent-primary" />{t('cSignature')}</label>
        <label className="flex min-h-9 items-center gap-2"><input type="checkbox" name="needsCheck" defaultChecked={initial?.needsCheck ?? true} className="size-5 accent-primary" />{t('cNeedsCheck')}</label>
        <label className="flex min-h-9 items-center gap-2"><input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="size-5 accent-primary" />{t('cActive')}</label>
      </div>
      <p className="text-xs text-faint">{t('cTargetsHint')}</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <PickList options={jobs} picked={jobIds} setPicked={setJobIds} label={t('cJobs')} />
        <PickList options={groups} picked={groupIds} setPicked={setGroupIds} label={t('cGroups')} />
        <PickList options={people} picked={employeeIds} setPicked={setEmployeeIds} label={t('cPeople')} />
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.training.err" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>{t(initial ? 'saveCourse' : 'addCourse')}</Button>
        {saved && <span role="status" className="text-ok">{t('saved')}</span>}
      </div>
    </form>
  );
}

/** 한 사람 줄의 조작 — 빼기 · 다시 넣기 · 종이 서명 옮겨 적기 */
export function AttendeeActions({ sessionId, employeeId, signed, removed }: { sessionId: string; employeeId: string; signed: boolean; removed: boolean }) {
  const t = useTranslations('admin.training');
  const { busy, err, send } = useCall();
  const [paper, setPaper] = useState(false);
  if (signed) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {removed ? (
        <button type="button" disabled={busy} className="min-h-9 px-2 text-sm font-semibold text-primary" onClick={() => send({ action: 'attendee.set', sessionId, employeeId, on: true })}>{t('addBack')}</button>
      ) : paper ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: 'attendee.paper', sessionId, employeeId, note: new FormData(e.currentTarget).get('note') })) setPaper(false); }}>
          <input name="note" required minLength={2} maxLength={150} placeholder={t('paperNote')} className={`${field} w-48`} autoComplete="off" />
          <Button type="submit" size="sm" disabled={busy}>{t('paperSave')}</Button>
          <button type="button" className="min-h-9 px-2 text-sm text-muted" onClick={() => setPaper(false)}>{t('cancel')}</button>
        </form>
      ) : (
        <>
          <button type="button" disabled={busy} className="min-h-9 px-2 text-sm text-muted" onClick={() => setPaper(true)}>{t('paper')}</button>
          <button type="button" disabled={busy} className="min-h-9 px-2 text-sm text-muted" onClick={() => send({ action: 'attendee.set', sessionId, employeeId, on: false })}>{t('remove')}</button>
        </>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.training.err" />}
    </span>
  );
}

/** 사람 더하기 (교육 만든 뒤) */
export function AddAttendee({ sessionId, options }: { sessionId: string; options: Opt[] }) {
  const t = useTranslations('admin.training');
  const { busy, err, send } = useCall();
  if (!options.length) return null;
  return (
    <form className="flex flex-wrap items-center gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); const id = new FormData(e.currentTarget).get('employeeId'); if (id) await send({ action: 'attendee.set', sessionId, employeeId: id, on: true }); }}>
      <select name="employeeId" required defaultValue="" className={`${field} w-auto`} aria-label={t('addPerson')}>
        <option value="">{t('addPerson')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={busy}>{t('add')}</Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.training.err" />}
    </form>
  );
}

/** 다시 알림 · 교육 취소 */
export function SessionActions({ sessionId, unsigned }: { sessionId: string; unsigned: number }) {
  const t = useTranslations('admin.training');
  const { busy, err, send } = useCall();
  const [msg, setMsg] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {unsigned > 0 && (
          <Button type="button" size="sm" disabled={busy} onClick={async () => { const r = await send<{ sent: number }>({ action: 'remind', sessionId }); if (r) setMsg(t('reminded', { n: r.sent })); }}>
            {t('remind', { n: unsigned })}
          </Button>
        )}
        {sure ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => send({ action: 'session.cancel', id: sessionId })}>{t('cancelYes')}</Button>
            <button type="button" className="min-h-9 px-2 text-muted" onClick={() => setSure(false)}>{t('cancel')}</button>
          </>
        ) : (
          <button type="button" className="min-h-9 px-2 text-muted" onClick={() => setSure(true)}>{t('cancelSession')}</button>
        )}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.training.err" />}
    </div>
  );
}

/** 현장 사진 — 올리기(5장까지) · 떼기 */
export function Photos({ sessionId, photos, max }: { sessionId: string; photos: { id: string; fileName: string }[]; max: number }) {
  const t = useTranslations('admin.training');
  const { busy, err, send, router } = useCall();
  const input = useRef<HTMLInputElement>(null);
  const [upErr, setUpErr] = useState<Err>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {photos.map((p) => (
          <figure key={p.id} className="relative overflow-hidden rounded-button border border-border bg-surface">
            <a href={`/api/admin/training/photo?id=${p.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/training/photo?id=${p.id}`} alt={p.fileName} className="aspect-square w-full object-cover" />
            </a>
            <button type="button" disabled={busy} onClick={() => send({ action: 'photo.remove', id: p.id })} className="absolute top-1 right-1 rounded-full bg-bg/90 p-1.5 text-muted" aria-label={t('photoRemove')}>
              <Trash2 aria-hidden size={14} />
            </button>
          </figure>
        ))}
        {photos.length < max && (
          <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-button border-2 border-dashed border-border text-muted hover:border-primary">
            <Camera aria-hidden size={22} />
            <span className="text-xs">{uploading ? t('uploading') : t('photoAdd')}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setUploading(true);
          setUpErr(null);
          const fd = new FormData();
          fd.set('sessionId', sessionId);
          fd.set('file', f);
          const r = await fetch('/api/admin/training/photo', { method: 'POST', body: fd });
          const j = await r.json().catch(() => null);
          setUploading(false);
          if (!r.ok) return setUpErr({ code: j?.error ?? 'generic', requestId: r.headers.get('x-request-id') ?? undefined });
          router.refresh();
        }}
      />
      {(err || upErr) && <ErrorNote code={(err ?? upErr)!.code} requestId={(err ?? upErr)!.requestId} namespace="admin.training.err" />}
    </div>
  );
}
