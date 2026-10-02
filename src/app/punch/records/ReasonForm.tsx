'use client';
// 연장 사유 (직원 작성, 선택). 근무노트와 별개다 — 노트를 사유로 자동 복사하지 않는다 (R-10-2의 8).
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function ReasonForm({ id, initial }: { id: string; initial: string | null }) {
  const t = useTranslations('records');
  const [text, setText] = useState(initial ?? '');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        const r = await callApi(`/api/overtime/${id}/reason`, { reason: text });
        if (!r.ok) return setErr(r);
        setSaved(true);
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        {t('reasonLabel')}
        <input
          value={text}
          maxLength={200}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          className="min-h-11 rounded-button border border-border px-3 text-base text-text"
        />
      </label>
      <Button type="submit" variant="outline" className="self-end text-sm" disabled={!text.trim()}>
        {saved ? t('saved') : t('saveReason')}
      </Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </form>
  );
}
