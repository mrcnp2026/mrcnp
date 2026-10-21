'use client';
// 요청 일괄 승인 (2026-10-21 의뢰인: 목록 왼쪽 체크박스로 골라 한 번에 승인 — PC 화면만).
// 표(components/RequestRows의 table)의 칸마다 BulkPick, 머리줄에 BulkAll, 표 위에 BulkBar. 서로는 화면의 체크박스(data-bulk-pick)로만 이어진다.
// 승인은 한 건씩 그 요청의 원래 승인 API를 부른다 — 권한(본인 요청 · 상위 등급) · 증빙 필수 · 마감 검사가 그대로 걸린다.
// 출근/퇴근 요청 · 정정을 먼저, 연장근로는 맨 뒤(출퇴근이 바뀌면 연장근로가 다시 계산된다 — ApproveDay와 같은 순서). 연장근로는 계산된 시간 그대로 인정.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { reloadAlerts } from '@/components/Alerts';
import { callApi } from '@/components/client-api';
import { Button } from '@/components/ui';

const PICKS = 'input[data-bulk-pick]';
const ORDER = ['punch', 'correction', 'shift', 'leave', 'leaveDelete', 'work', 'overtime'];
const all = () => [...document.querySelectorAll<HTMLInputElement>(PICKS)];

export function BulkPick({ url, kind, label, blocked, blockedNote }: { url: string; kind: string; label: string; blocked: boolean; blockedNote: string }) {
  return <input type="checkbox" data-bulk-pick data-url={url} data-kind={kind} disabled={blocked} aria-label={label} title={blocked ? blockedNote : undefined} className="size-4 align-middle disabled:opacity-30" />;
}

export function BulkAll() {
  const t = useTranslations('admin.inbox');
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => {
      const open = all().filter((x) => !x.disabled);
      setOn(open.length > 0 && open.every((x) => x.checked));
    };
    document.addEventListener('change', sync);
    return () => document.removeEventListener('change', sync);
  }, []);
  return (
    <input
      type="checkbox"
      checked={on}
      aria-label={t('bulkAll')}
      title={t('bulkAll')}
      className="size-4 align-middle"
      onChange={(e) => {
        for (const x of all()) if (!x.disabled) x.checked = e.target.checked;
        document.dispatchEvent(new Event('change'));
      }}
    />
  );
}

export function BulkBar() {
  const t = useTranslations('admin.inbox');
  const router = useRouter();
  const [n, setN] = useState(0);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  useEffect(() => {
    const count = () => setN(all().filter((x) => x.checked && !x.disabled).length);
    count();
    document.addEventListener('change', count);
    return () => document.removeEventListener('change', count);
  }, []);
  async function run() {
    const picked = all()
      .filter((x) => x.checked && !x.disabled)
      .map((x) => ({ url: x.dataset.url!, kind: x.dataset.kind! }))
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const p of picked) {
      const body = p.kind === 'overtime' ? { decision: 'approved', approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null } : { decision: 'approved' };
      const r = await callApi<{ result: string }>(p.url, body);
      if (r.ok) ok++;
      else failed++;
    }
    setBusy(false);
    setAsking(false);
    setResult({ ok, failed });
    for (const x of all()) x.checked = false;
    document.dispatchEvent(new Event('change'));
    router.refresh();
    reloadAlerts();
  }
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-card border border-border bg-bg px-4 py-2" data-bulk-bar>
      <p className="num text-sm font-semibold">{n > 0 ? t('bulkCount', { n }) : t('bulkNone')}</p>
      {result && (
        <p role="status" className={`num text-sm font-semibold ${result.failed ? 'text-danger' : 'text-ok'}`}>
          {t('bulkDone', { n: result.ok })}
          {result.failed > 0 && ` · ${t('bulkFailed', { n: result.failed })}`}
        </p>
      )}
      <span className="ml-auto flex items-center gap-2">
        {asking ? (
          <>
            <span className="text-sm text-muted">{t('bulkAsk', { n })}</span>
            <Button size="sm" disabled={busy || n === 0} onClick={run}>
              {t('bulkConfirm', { n })}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsking(false)}>
              {t('cancel')}
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={n === 0} onClick={() => { setResult(null); setAsking(true); }}>
            {t('bulkApprove', { n })}
          </Button>
        )}
      </span>
    </div>
  );
}
