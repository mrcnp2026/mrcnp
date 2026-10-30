'use client';
// 증명서 발급 전 미리보기 · 고치기 (2026-10-30 의뢰인: 「미리보기도 없고 — 내용을 편집할 수 있고 그다음 PDF」).
// 왼쪽: 고칠 칸(생년월일 · 소속 · 직무 · 기간 · 용도), 오른쪽: 서버가 그린 실제 PDF(「견본」 표시) — 받는 종이와 똑같다. 칸을 고치면 잠깐 뒤 다시 그린다.
// 「이대로 발급」을 눌러야 발급되고 발급번호가 붙는다. 이름 · 종류 · 회사 정보는 여기서 고치지 않는다(회사 정보는 통합설정 › 회사 기본설정).
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { callApi } from './client-api';
import { ErrorNote } from './ErrorNote';
import { Button } from './ui';

export type CertDraft = {
  kind: 'EMPLOYMENT' | 'CAREER' | 'RETIREMENT'; name: string; birthDate: string | null; group: string | null; jobTitle: string | null;
  startsOn: string | null; endsOn: string | null; purpose: string; issuedOn: string;
  company: { name: string; ceo: string; bizNo: string; address: string; phone: string };
};

const field = 'min-h-10 w-full rounded-button border border-border bg-bg px-3 text-sm';
const b64 = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function CertEditor({ draft, copies, issue, onClose }: { draft: CertDraft; copies: number; issue: { id: string } | { employeeId: string }; onClose: () => void }) {
  const t = useTranslations('certificates');
  const tp = useTranslations('certPdf');
  const router = useRouter();
  const [v, setV] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [done, setDone] = useState<{ id: string; serial: string } | null>(null);
  const set = (k: keyof CertDraft) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value || null });
  const edits = useMemo(() => ({ birthDate: v.birthDate, group: v.group, jobTitle: v.jobTitle, startsOn: v.startsOn, endsOn: v.endsOn, purpose: v.purpose }), [v]);
  // 미리보기 주소 — 고친 칸이 바뀌고 0.6초 뒤에 다시 그린다(글자마다 그리지 않게)
  const target = useMemo(() => {
    const e = b64(edits);
    return 'id' in issue ? `/api/admin/certificates/preview?id=${issue.id}&e=${e}` : `/api/admin/certificates/preview?employeeId=${issue.employeeId}&kind=${v.kind}&purpose=${encodeURIComponent(v.purpose || '-')}&copies=${copies}&e=${e}`;
  }, [edits, issue, v.kind, v.purpose, copies]);
  const [src, setSrc] = useState(target);
  useEffect(() => {
    const id = setTimeout(() => setSrc(target), 600);
    return () => clearTimeout(id);
  }, [target]);
  const companyEmpty = !v.company.ceo || !v.company.bizNo || !v.company.address;
  const shown = done ? `/api/certificates/${done.id}?view=1` : src;

  return (
    <div className="pop-backdrop fixed inset-0 z-50 flex items-end justify-center bg-text/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={t('editorTitle')}>
      <div className="sheet-up flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col rounded-t-card bg-bg md:h-[calc(100dvh-3rem)] md:rounded-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-lg font-bold">{t('editorTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('cancel')} className="flex size-9 items-center justify-center rounded-button text-muted hover:bg-surface"><X aria-hidden size={20} /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[18rem_minmax(0,1fr)] md:overflow-hidden">
          <div className="flex flex-col gap-3 text-sm md:overflow-y-auto">
            <p className="text-xs text-muted">{t('editorHint')}</p>
            <p className="rounded-button bg-surface px-3 py-2 font-bold">{v.name} · {t(`kind.${v.kind}`)}</p>
            <label className="flex flex-col gap-1"><span className="font-bold">{tp('birth')}</span><input type="date" value={v.birthDate ?? ''} onChange={set('birthDate')} className={field} disabled={!!done} /></label>
            <label className="flex flex-col gap-1"><span className="font-bold">{tp('group')}</span><input value={v.group ?? ''} onChange={set('group')} maxLength={60} className={field} disabled={!!done} /></label>
            <label className="flex flex-col gap-1"><span className="font-bold">{tp('job')}</span><input value={v.jobTitle ?? ''} onChange={set('jobTitle')} maxLength={60} className={field} disabled={!!done} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className="font-bold">{t('from')}</span><input type="date" value={v.startsOn ?? ''} onChange={set('startsOn')} className={field} disabled={!!done} /></label>
              {v.kind !== 'EMPLOYMENT' && <label className="flex flex-col gap-1"><span className="font-bold">{t('to')}</span><input type="date" value={v.endsOn ?? ''} onChange={set('endsOn')} className={field} disabled={!!done} /></label>}
            </div>
            <label className="flex flex-col gap-1"><span className="font-bold">{tp('purpose')}</span><input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} maxLength={100} className={field} disabled={!!done} /></label>
            {companyEmpty && <p className="rounded-button bg-warn-tint p-2.5 text-xs text-warn">{t('companyEmpty')}</p>}
            {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="certificates" />}
          </div>
          {/* 실제 PDF — 받는 종이와 같다 */}
          <iframe key={shown} src={shown} title={t('editorTitle')} className="min-h-96 w-full rounded-card border border-border bg-surface md:h-full" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {done ? (
            <>
              <span role="status" className="mr-auto text-sm font-bold text-ok">{t('issuedAs', { no: done.serial })}</span>
              <a href={`/api/certificates/${done.id}`} className="inline-flex h-10 items-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary">{t('download')}</a>
              <Button type="button" variant="outline" onClick={() => { onClose(); router.refresh(); }}>{t('close')}</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
              <Button type="button" disabled={busy || !v.purpose.trim()} onClick={async () => {
                setBusy(true);
                setErr(null);
                const body = 'id' in issue ? { action: 'issue', id: issue.id, edits } : { action: 'direct', employeeId: issue.employeeId, kind: v.kind, purpose: v.purpose, copies, edits };
                const r = await callApi<{ id: string; serial: string }>('/api/admin/certificates', body);
                setBusy(false);
                if (!r.ok) return setErr(r);
                setDone({ id: r.data.id, serial: r.data.serial });
              }}>{t('issueThis')}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
