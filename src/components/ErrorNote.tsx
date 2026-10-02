'use client';
// 오류 안내: 한 줄 설명 + 문의번호(앞 8자). 에러 원문·영문 코드를 보이지 않는다 (2장, R-10-8, R-12-4)
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ErrorNote({ code, requestId, namespace }: { code: string; requestId?: string; namespace?: string }) {
  const t = useTranslations();
  const key = namespace && t.has(`${namespace}.${code}`) ? `${namespace}.${code}` : t.has(`errors.${code}`) ? `errors.${code}` : 'errors.generic';
  return (
    <div role="alert" className="flex gap-2 rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
      <AlertTriangle aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div>
        <p>{t(key)}</p>
        {requestId && <p className="num mt-1 text-xs">{t('errors.reference', { id: requestId.slice(0, 8).toUpperCase() })}</p>}
      </div>
    </div>
  );
}
