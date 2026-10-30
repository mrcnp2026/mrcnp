'use client';
// 증명서 신청 · 발급 · 반려 단추 (2026-10-29 남은 일 9-3). 직원 화면(신청)과 관리자 화면(발급 · 반려 · 바로 발급)이 같이 쓴다. 처리하면 화면을 새로 읽는다.
import { BriefcaseBusiness, FileText, LogOut, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from './client-api';
import { ErrorNote } from './ErrorNote';
import { Select } from './Select';
import { Button } from './ui';
import { CertEditor, type CertDraft } from './CertEditor';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
type Err = { code: string; requestId?: string } | null;
const ICON: Record<'EMPLOYMENT' | 'CAREER' | 'RETIREMENT', LucideIcon> = { EMPLOYMENT: FileText, CAREER: BriefcaseBusiness, RETIREMENT: LogOut };

function useSend(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi(url, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, err, send };
}

/** 신청 양식 — 직원(종류 2개) · 관리자 바로 발급(사람 · 종류 3개) */
export function CertRequestForm({ kinds, people }: { kinds: readonly ('EMPLOYMENT' | 'CAREER' | 'RETIREMENT')[]; people?: { id: string; name: string; off: boolean }[] }) {
  const t = useTranslations('certificates');
  const admin = !!people;
  const { busy, err, send } = useSend(admin ? '/api/admin/certificates' : '/api/certificates');
  const [kind, setKind] = useState(kinds[0]);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<{ d: CertDraft; copies: number; employeeId: string } | null>(null);
  const [dErr, setDErr] = useState<Err>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, f = new FormData(form);
        if (admin) {
          // 관리자는 바로 발급하지 않고 미리보기 · 고치기부터 (2026-10-30 의뢰인)
          setDErr(null);
          const r = await callApi<{ snapshot: CertDraft; copies: number }>('/api/admin/certificates', { action: 'draft', employeeId: f.get('employeeId'), kind, purpose: f.get('purpose'), copies: Number(f.get('copies') ?? 1) });
          if (!r.ok) return setDErr(r);
          return setDraft({ d: r.data.snapshot, copies: r.data.copies, employeeId: String(f.get('employeeId')) });
        }
        const ok = await send({ kind, purpose: f.get('purpose'), copies: Number(f.get('copies') ?? 1) });
        if (ok) {
          form.reset();
          setDone(true);
        }
      }}
    >
      {draft && <CertEditor draft={draft.d} copies={draft.copies} issue={{ employeeId: draft.employeeId }} onClose={() => setDraft(null)} />}
      {admin && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">{t('person')}</span>
          <Select name="employeeId" required defaultValue="" className={field}>
            <option value="" disabled>{t('pick')}</option>
            {people!.map((p) => <option key={p.id} value={p.id}>{p.name}{p.off ? ` (${t('left')})` : ''}</option>)}
          </Select>
        </label>
      )}
      {/* 종류는 위쪽 단추 줄이 아니라 고르는 카드로 (2026-10-30 의뢰인: 「상단에 재직 · 경력 버튼 말고 — 지금 UX/UI 너무 별로」) — 아이콘 · 이름 · 무엇을 증명하는지 한 줄 */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="pb-1 font-bold">{t('kindLabel')}</legend>
        {kinds.map((k) => {
          const Icon = ICON[k];
          const on = kind === k;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setKind(k)} className={`flex min-h-14 items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors ${on ? 'border-primary bg-primary-tint' : 'border-border bg-bg hover:bg-surface'}`}>
              <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-button ${on ? 'bg-primary text-on-primary' : 'bg-surface text-muted'}`}><Icon size={18} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className={on ? 'text-primary' : ''}>{t(`kind.${k}`)}</b>
                <span className="text-xs text-muted">{t(`kindDesc.${k}`)}</span>
              </span>
              <span aria-hidden className={`size-4 shrink-0 rounded-full border-2 ${on ? 'border-primary bg-primary' : 'border-border'}`} />
            </button>
          );
        })}
      </fieldset>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">{t('purpose')}<span className="text-danger"> *</span></span>
          <input name="purpose" required maxLength={100} placeholder={t('purposePh')} className={field} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">{t('copies')}</span>
          <input name="copies" type="number" min={1} max={5} defaultValue={1} className={`num ${field}`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} className="w-full">{t(admin ? 'previewEdit' : 'request')}</Button>
        {done && <span role="status" className="text-sm text-ok">{t(admin ? 'issuedDone' : 'requestedDone')}</span>}
      </div>
      {(err ?? dErr) && <ErrorNote code={(err ?? dErr)!.code} requestId={(err ?? dErr)!.requestId} namespace="certificates" />}
    </form>
  );
}

/** 관리자: 신청 한 건 발급 · 반려 */
export function CertDecide({ id, name, draft, copies }: { id: string; name: string; draft: CertDraft | null; copies: number }) {
  const t = useTranslations('certificates');
  const { busy, err, send } = useSend('/api/admin/certificates');
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {ask ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={t('rejectPh')} aria-label={t('rejectPh')} className="h-9 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 text-sm" />
          <Button type="button" size="sm" variant="outline" disabled={busy || reason.trim().length < 2} onClick={() => send({ action: 'reject', id, reason })}>{t('rejectYes')}</Button>
          <button type="button" className="min-h-9 text-sm text-muted" onClick={() => setAsk(false)}>{t('cancel')}</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy || !draft} onClick={() => setOpen(true)} aria-label={t('issueOf', { name })}>{t('previewEdit')}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(true)}>{t('reject')}</Button>
        </div>
      )}
      {open && draft && <CertEditor draft={draft} copies={copies} issue={{ id }} onClose={() => setOpen(false)} />}
      {!draft && <span className="text-xs text-warn">{t('cannotIssue')}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="certificates" />}
    </div>
  );
}
