// 「내 계정」 — 나는 누구인지(로그인 아이디) · 내 정보 · 비밀번호 (2026-10-05 의뢰인: 아이디 + 비밀번호 로그인).
// 2026-10-16 의뢰인 디자인: 내 정보가 맨 아래에 붙어 잘 안 보였다 → 접고 펴는 칸으로, 자주 쓰는 순서대로(내 정보 → 비밀번호).
//   접혀 있어도 한 줄 요약이 보인다. 내 정보가 비어 있으면 펼친 채로 열어 넣게 한다. 비밀번호는 드물게 바꾸므로 접어 둔다.
// 지문 로그인만 쓰던 사람(비밀번호 없음)은 여기서 비밀번호를 처음 만든다 — 그래야 PC·다른 폰에서도 로그인할 수 있다(그때는 펼친 채로).
import { getFormatter, getTranslations } from 'next-intl/server';
import { ChevronRight, MapPin, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fold } from '@/components/Fold';
import { PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { PasswordForm } from './PasswordForm';
import { StaffDetailsForm } from '@/components/StaffDetailsForm';
import { loadStaffDetails } from '@/lib/staff-details';
import { toKstDate } from '@/lib/time';

export default async function AccountPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  const [t, td, f, th, tp, tl] = await Promise.all([getTranslations('account'), getTranslations('details'), getFormatter(), getTranslations('home'), getTranslations('privacy'), getTranslations('locationTerms')]);
  const [details, { data: p }, groups] = await Promise.all([
    loadStaffDetails(me.id),
    createAdminClient().from('profiles').select('password_set_at, phone, email, group_id, job_title').eq('id', me.id).maybeSingle(),
    loadOrgGroups(),
  ]);
  const hasPassword = !!p?.password_set_at;
  const today = toKstDate(new Date());
  const ids = [
    { k: t('idNo'), v: me.employeeNo },
    { k: t('idPhone'), v: p?.phone ?? null },
    { k: t('idEmail'), v: p?.email ?? null },
  ].filter((x) => x.v);
  const where = [groupPath(groups, p?.group_id as string | null), p?.job_title].filter(Boolean).join(' · ');
  const bits = [
    details.birthDate ? td('sumBirth', { date: details.birthDate }) : null,
    details.emergencyContacts.length ? td('sumContacts', { n: details.emergencyContacts.length }) : null,
    details.certificates.length ? td('sumCerts', { n: details.certificates.length }) : null,
    details.carModel || details.carNumber ? td('sumCar') : null,
  ].filter(Boolean);
  const detailsEmpty = bits.length === 0;
  const link = 'flex min-h-14 items-center gap-3 px-4 text-sm font-semibold hover:bg-surface';
  return (
    <PageShell>
      {/* 2026-10-30 의뢰인 「내 프로필 디자인 이상해」: 한 줄로 화면 끝까지 늘어나 입력칸이 지나치게 길었다.
          PC는 두 칸 — 왼쪽: 나(이름 · 소속 · 로그인 아이디) + 바로가기, 오른쪽: 내 정보 · 비밀번호. 폰은 나 → 내 정보 → 비밀번호 → 바로가기 순서 그대로 */}
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-4">
        <header className="flex flex-col gap-4 rounded-card border border-border bg-bg p-4 shadow-card lg:col-start-1 lg:row-start-1 lg:items-center lg:p-6 lg:text-center">
          <div className="flex w-full items-center gap-3 lg:flex-col lg:gap-2">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-tint text-lg font-extrabold text-primary lg:size-20 lg:text-3xl">
              {me.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1 lg:w-full">
              <p className="truncate text-lg font-extrabold lg:text-xl">{me.name}</p>
              {where && <p className="truncate text-sm text-muted">{where}</p>}
            </div>
          </div>
          <div className="flex w-full flex-col gap-1 border-t border-border pt-3 lg:text-left">
            <p className="text-xs text-muted">{t('idsTitle')}</p>
            <dl className="flex flex-col">
              {ids.map((x) => (
                <div key={x.k} className="flex gap-3 py-1 text-sm">
                  <dt className="w-16 shrink-0 text-muted">{x.k}</dt>
                  <dd className="num min-w-0 flex-1 font-semibold break-all">{x.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <div className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:gap-4">
          {/* 내 정보 (묶음 17, 2026-10-16 의뢰인: 직원이 직접 넣는다 · 관리자도 고친다) */}
          <Fold id="details" title={td('myTitle')} summary={detailsEmpty ? td('sumEmpty') : bits.join(' · ')} open={detailsEmpty}>
            <p className="pb-3 text-xs text-faint">{td('myNote')}</p>
            <StaffDetailsForm endpoint="/api/me/details" initial={details} today={today} />
          </Fold>

          <Fold
            id="password"
            title={t(hasPassword ? 'changeTitle' : 'createTitle')}
            summary={hasPassword ? t('passwordSince', { date: f.dateTime(new Date(p!.password_set_at as string), { dateStyle: 'medium' }) }) : t('passwordNone')}
            open={!hasPassword}
          >
            {!hasPassword && <p className="pb-3 text-sm text-muted">{t('createNote')}</p>}
            <PasswordForm hasPassword={hasPassword} />
          </Fold>
        </div>

        {/* 바로가기 — 홈 설정(2026-10-18 홈 맨 아래에서 옮김) · 개인정보 처리방침(2026-10-29). 한 칸에 묶었다 */}
        <nav className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-bg lg:col-start-1 lg:row-start-2">
          <Link href="/punch/home-settings" className={link}>
            <Settings aria-hidden size={18} className="shrink-0 text-muted" />
            <span className="flex-1">{th('settingsLink')}</span>
            <ChevronRight aria-hidden size={18} className="text-faint" />
          </Link>
          <Link href="/privacy" className={link}>
            <ShieldCheck aria-hidden size={18} className="shrink-0 text-muted" />
            <span className="flex-1">{tp('link')}</span>
            <ChevronRight aria-hidden size={18} className="text-faint" />
          </Link>
          {/* 위치기반서비스 약관은 개인정보 처리방침 바로 아래 (2026-11-04 의뢰인) */}
          <Link href="/privacy/location" className={link}>
            <MapPin aria-hidden size={18} className="shrink-0 text-muted" />
            <span className="flex-1">{tl('title')}</span>
            <ChevronRight aria-hidden size={18} className="text-faint" />
          </Link>
        </nav>
      </div>
    </PageShell>
  );
}
