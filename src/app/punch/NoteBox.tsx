'use client';
// 근무노트 (부록 R-10-2). 없어도 출퇴근은 된다 — 필수로 만들지 않는다 (규칙 4).
// 원문 그대로 저장, 텍스트로만 보여 준다(링크·HTML 없음). 고치면 서버가 새 행을 추가한다 (이전 행은 남음).
import { NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle } from '@/components/ui';

const MAX = 200;

export function NoteBox({ initial }: { initial: string | null }) {
  const t = useTranslations('home.note');
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [text, setText] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  return (
    <Card className="flex flex-col gap-2">
      <CardTitle icon={NotebookPen}>{t('title')}</CardTitle>
      {!editing && saved !== null ? (
        <>
          <p className="whitespace-pre-wrap break-words">{saved}</p>
          <Button variant="outline" className="self-start text-sm" onClick={() => setEditing(true)}>
            {t('edit')}
          </Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = await callApi<{ note: { body: string } }>('/api/notes', { body: text });
            setBusy(false);
            if (!r.ok) return setErr(r);
            setSaved(r.data.note.body);
            setEditing(false);
          }}
        >
          <p className="text-xs text-muted">{t('hint')}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            maxLength={MAX}
            rows={3}
            placeholder={t('placeholder')}
            aria-label={t('title')}
            className="w-full rounded-button border border-border bg-bg p-3 text-base text-text"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="num text-xs text-faint">{t('counter', { n: text.length })}</span>
            <div className="flex gap-2">
              {saved !== null && (
                <Button type="button" variant="outline" className="text-sm" onClick={() => { setText(saved); setEditing(false); }}>
                  {t('cancel')}
                </Button>
              )}
              <Button type="submit" variant="outline" disabled={busy || text.trim().length === 0} className="text-sm">
                {t('save')}
              </Button>
            </div>
          </div>
          {err && <ErrorNote code={err.code} requestId={err.requestId} />}
        </form>
      )}
    </Card>
  );
}
