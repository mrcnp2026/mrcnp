'use client';
// 직원 추가 창의 탭 — 「한 명씩」(등록 마법사) · 「엑셀로 여러 명」(2026-10-20 의뢰인: 목록 위의 접힌 줄은 별로 → + 직원 추가 창의 탭으로).
// 엑셀 쪽은 공통 모양(components/ExcelImport). 초대는 자동으로 보내지 않는다 — 등록한 뒤 직원마다 보낸다.
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AddTabs } from '@/components/AddTabs';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import type { StaffLine } from '@/lib/staff-bulk';

type Res = { lines: StaffLine[]; results?: { row: number; ok: boolean; code?: string }[] };

export function StaffAddTabs({ one }: { one: ReactNode }) {
  const t = useTranslations('admin.members.import');
  return <AddTabs one={one} many={<StaffExcel />} labels={{ one: t('tabOne'), many: t('tabMany'), group: t('tabs') }} />;
}

function StaffExcel() {
  const t = useTranslations('admin.members.import');
  const te = useTranslations('errors');
  const why = (code: string) => (t.has(`err.${code}`) ? t(`err.${code}`) : te.has(code) ? te(code) : code);
  return (
    <ExcelImport<Res>
      templateHref="/api/admin/employees/import"
      endpoint="/api/admin/employees/import"
      hint={t('hint')}
      errNamespace="admin.members.import.err"
      applyLabel={(n) => t('apply', { n })}
      view={(d) =>
        d.lines.map((l): ImportRow => {
          const r = d.results?.find((x) => x.row === l.row);
          const title = `${l.employeeNo} ${l.name}`.trim();
          if (l.error) return { key: String(l.row), title, state: 'problem', note: why(l.error) };
          if (r) return { key: String(l.row), title, state: r.ok ? 'done' : 'failed', note: r.ok ? t('done') : why(r.code ?? 'generic') };
          return { key: String(l.row), title, state: 'ready' };
        })
      }
    />
  );
}
