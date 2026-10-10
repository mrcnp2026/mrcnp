'use client';
// 출퇴근기록 목록의 + 버튼 → 기록 추가 (2026-10-11 의뢰인: 시프티처럼 목록에서 바로). 직원을 고르면 대리 등록 양식(ProxyEntry)이 그 직원 것으로 열린다.
// 넣는 길·규칙은 직원별 기록 화면과 같다: 사유 필수 · 저장 전 확인 · 본인 것은 못 넣음 · 「관리자 등록」으로 남음 (②-3 7-6).
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProxyEntry } from '../[id]/ProxyEntry';

export function RecordAdd({ people, today }: { people: { id: string; name: string; group: string | null }[]; today: string }) {
  const t = useTranslations('admin.recordList');
  const [id, setId] = useState('');
  const who = people.find((p) => p.id === id);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('addWho')}
        <select value={id} onChange={(e) => setId(e.target.value)} className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text">
          <option value="">{t('addPick')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.group ? ` (${p.group})` : ''}
            </option>
          ))}
        </select>
      </label>
      {who ? <ProxyEntry key={who.id} employeeId={who.id} name={who.name} kinds={['in', 'out']} today={today} startOpen /> : <p className="text-sm text-faint">{t('addHint')}</p>}
    </div>
  );
}
