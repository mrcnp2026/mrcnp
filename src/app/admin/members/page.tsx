// ④ 직원 탭 — 직원 목록 · 추가 · 초대 QR (마스터 5장). 입퇴사·폰 해제는 ②에서 붙인다.
// 목록 규칙(5장 규칙 4): 폰에서는 카드 목록. 칩은 3개 이하 (R-10-7)
import { getTranslations } from 'next-intl/server';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { createAdminClient } from '@/lib/supabase/admin';
import { AddEmployeeForm } from './AddEmployeeForm';
import { NewInviteButton } from './NewInviteButton';

export default async function MembersPage() {
  const t = await getTranslations('admin.members');
  const db = createAdminClient();
  const [{ data: people }, { data: keys }] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, role, active').order('active', { ascending: false }).order('name'),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
  ]);
  const withPhone = new Set((keys ?? []).map((k) => k.employee_id));
  const list = people ?? [];
  const localhost = new URL(OFFICE.appOrigin).hostname === 'localhost';

  return (
    <PageShell>
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <span className="num text-sm text-faint">{t('count', { n: list.filter((p) => p.active).length })}</span>
      </header>

      {list.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.name}</p>
                    <p className="num text-sm text-faint">{p.employee_no}</p>
                  </div>
                  {p.active && <NewInviteButton employeeId={p.id} name={p.name} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {withPhone.has(p.id) ? <Chip tone="ok">{t('phoneOk')}</Chip> : <Chip tone="warn">{t('phoneNone')}</Chip>}
                  {p.role === 'admin' && <Chip tone="info">{t('adminChip')}</Chip>}
                  {!p.active && <Chip>{t('inactive')}</Chip>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddEmployeeForm locales={LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }))} localhost={localhost} />
    </PageShell>
  );
}
