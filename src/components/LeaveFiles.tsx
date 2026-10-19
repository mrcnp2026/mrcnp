'use client';
// 휴가 신청 한 건의 증빙 파일 (묶음 9, 2026-10-19) — 목록(누르면 새 탭에서 열림) · 붙이기 · 떼기. 직원 「연차」 화면 · 관리자 요청함 · 휴가 상세가 같이 쓴다.
// canEdit: 대기 중인 신청에서 본인 또는 처리할 수 있는 관리자. required: 종류 규칙이 「증빙 필수」(파일이 없으면 승인할 수 없다).
import { FileText, Paperclip, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';

export type LeaveFileItem = { id: string; fileName: string; size: number };
const MAX = 3;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif';

export function LeaveFiles({ requestId, files, canEdit, required = false }: { requestId: string; files: LeaveFileItem[]; canEdit: boolean; required?: boolean }) {
  const t = useTranslations('leaveFiles');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (files.length === 0 && !canEdit && !required) return null;
  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', file);
    const r = await fetch(`/api/leave/${requestId}/files`, { method: 'POST', body: fd }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!r?.ok) return setErr({ code: j.error ?? 'network', requestId: j.requestId });
    router.refresh();
  };
  const remove = async (id: string) => {
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/leave/files/${id}/remove`);
    setBusy(false);
    if (!r.ok) return setErr(r);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm" data-leave-files>
      {files.length === 0 && required && <p className="text-warn">{t('requiredMissing')}</p>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.id} className="flex min-w-0 items-center gap-2">
              <a href={`/api/leave/files/${f.id}`} target="_blank" rel="noopener" className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-primary hover:underline">
                <FileText aria-hidden size={16} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{f.fileName}</span>
                <span className="num shrink-0 text-xs text-faint">{kb(f.size)}</span>
              </a>
              {canEdit && (
                <button type="button" disabled={busy} onClick={() => remove(f.id)} aria-label={t('remove', { name: f.fileName })} className="flex size-9 shrink-0 items-center justify-center text-muted disabled:opacity-50">
                  <X aria-hidden size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && files.length < MAX && (
        <label className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start font-semibold text-primary ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Paperclip aria-hidden size={16} strokeWidth={1.75} />
          {busy ? t('uploading') : t('add', { n: files.length, max: MAX })}
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      )}
      {canEdit && <span className="text-xs text-faint">{t('hint')}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="leaveFiles" />}
    </div>
  );
}
