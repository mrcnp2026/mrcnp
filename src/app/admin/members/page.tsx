// ④ 직원 탭 — 누가 가입(폰 등록)했고 누가 아직인지 한눈에 (2026-10-02 의뢰인).
// 위: 전체·가입·미가입 걸러보기 / 가운데: 2열 작은 카드 (이름·사번·가입 상태·초대 링크) / 아래: 「직원 추가」는 눌러야 펼쳐진다.
// 초대 링크 보내기는 카드 안의 작은 버튼 — 확인은 아래에서 올라오는 창 (NewInviteButton). 입퇴사·폰 해제는 ②에서 붙인다.
import { Check, UserPlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, Chip, PageShell } from '@/components/ui';
import { LOCALE_NAMES, LOCALES } from '@/i18n/locales';
import { createAdminClient } from '@/lib/supabase/admin';
import { OFFICE } from '@/config/office';
import { AddEmployeeForm } from './AddEmployeeForm';
import { NewInviteButton } from './NewInviteButton';

type Filter = 'all' | 'joined' | 'pending';
const LOCALE_LIST = LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] }));

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ f?: string; add?: string }> }) {
  const t = await getTranslations('admin.members');
  const sp = await searchParams;
  const filter: Filter = sp.f === 'joined' || sp.f === 'pending' ? sp.f : 'all';
  const db = createAdminClient();
  const [{ data: people }, { data: keys }] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, role, active').order('active', { ascending: false }).order('name'),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
  ]);
  const withPhone = new Set((keys ?? []).map((k) => k.employee_id));
  // 검사 전용 계정(e2e-audit)은 검사 중에만 켜진다 — 꺼져 있으면 목록에 안 보이게
  const all = (people ?? []).filter((p) => p.active || p.employee_no !== 'e2e-audit');
  const active = all.filter((p) => p.active);
  const joined = active.filter((p) => withPhone.has(p.id));
  const pending = active.filter((p) => !withPhone.has(p.id));
  const list = filter === 'joined' ? joined : filter === 'pending' ? pending : all;
  const localhost = new URL(OFFICE.appOrigin).hostname === 'localhost';
  const tabs: { key: Filter; n: number }[] = [
    { key: 'all', n: active.length },
    { key: 'joined', n: joined.length },
    { key: 'pending', n: pending.length },
  ];

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2 px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <Link href="/admin/members?add=1#new-member" scroll={false} className="inline-flex min-h-11 items-center gap-1 rounded-button bg-primary px-4 text-sm font-bold text-on-primary">
          <UserPlus aria-hidden size={18} strokeWidth={2} />
          {t('addShort')}
        </Link>
      </header>

      {/* 걸러보기 — 숫자가 곧 현황 (가입 9 · 미가입 2) */}
      <nav className="grid grid-cols-3 rounded-card bg-bg p-1" aria-label={t('filter')}>
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.key === 'all' ? '/admin/members' : `/admin/members?f=${x.key}`}
            scroll={false}
            aria-current={filter === x.key ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center rounded-button ${filter === x.key ? 'bg-primary-tint text-primary' : 'text-muted'}`}
          >
            <span className={`num text-xl leading-none font-extrabold ${x.key === 'pending' && x.n > 0 && filter !== x.key ? 'text-warn' : ''}`}>{x.n}</span>
            <span className="text-xs font-medium">{t(`f_${x.key}`)}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="px-1 text-muted">{all.length === 0 ? t('empty') : t('emptyFilter')}</p>
      ) : (
        // 시안과 같은 한 줄 목록 (2026-10-02 의뢰인): 첫 글자 · 이름 · 사번과 가입 상태 · 링크 보내기
        <Card className="p-0 py-1">
          <ul>
            {list.map((p) => {
              const ok = withPhone.has(p.id);
              return (
                <li key={p.id} className={`flex min-h-16 items-center gap-3 px-5 py-2 ${p.active ? '' : 'opacity-60'}`}>
                  <span
                    aria-hidden
                    className={`flex size-10 shrink-0 items-center justify-center rounded-chip font-bold ${ok ? 'bg-primary-tint text-primary' : 'bg-warn-tint text-warn'}`}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.role === 'admin' && <Chip tone="info">{t('adminChip')}</Chip>}
                    </span>
                    <span className="num flex items-center gap-1 truncate text-xs">
                      <span className="text-faint">{p.employee_no}</span>
                      <span className="text-faint">·</span>
                      {!p.active ? (
                        <span className="text-faint">{t('inactive')}</span>
                      ) : ok ? (
                        <span className="inline-flex items-center gap-0.5 font-bold text-ok">
                          <Check aria-hidden size={12} strokeWidth={3} />
                          {t('joined')}
                        </span>
                      ) : (
                        <span className="font-bold text-warn">{t('notJoined')}</span>
                      )}
                    </span>
                  </span>
                  {p.active && (
                    <span className="shrink-0">
                      <NewInviteButton employeeId={p.id} name={p.name} compact again={ok} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 직원 추가 양식은 「추가」를 눌렀을 때만 (평소에는 목록만 보이게) */}
      {(sp.add === '1' || all.length === 0) && (
        <section id="new-member" className="scroll-mt-16">
          <AddEmployeeForm locales={LOCALE_LIST} localhost={localhost} />
        </section>
      )}
    </PageShell>
  );
}
