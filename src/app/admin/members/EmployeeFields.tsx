'use client';
// 직원 정보 입력칸 — 등록 화면과 수정 화면이 같은 칸을 쓴다 (2026-10-05 의뢰인: 샤플 구성원 등록 양식 대조).
// 묶음: 기본 정보(이름·사번·휴대폰) / 소속(그룹·직무/직급·입사일) / 화면 언어. 휴대폰·그룹·직급·입사일은 선택.
import { useTranslations } from 'next-intl';
import { DateTimeInput } from '@/components/DateTimeInput';

export type OrgOption = { id: string; label: string };
export type EmployeeValues = { name: string; employeeNo: string; phone: string; email?: string; groupId: string; jobTitle: string; joinedOn: string; locale: string };

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function EmployeeFields({
  initial,
  groups,
  locales,
  today,
  jobs,
  popup = false,
}: {
  initial?: Partial<EmployeeValues>;
  groups: OrgOption[];
  locales: { code: string; name: string }[];
  today: string;
  jobs?: OrgOption[]; // 넘기면 「직무」 고르기 칸이 생긴다 (추가할 때만)
  popup?: boolean; // PC 팝업: 두 칸 + 회색 띠 제목 (시프티 「직원 추가하기」)
}) {
  const t = useTranslations('admin.members');
  const legend = popup ? 'mb-3 w-full bg-surface px-3 py-2 text-sm font-bold' : 'mb-2 text-sm font-bold text-primary';
  return (
    // PC: 묶음 3개를 가로로 (2026-10-06 의뢰인: 한 줄로 길게 늘어져 있었다) · 폰: 세로
    <div className={`flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 ${popup ? '' : 'xl:grid-cols-3'}`}>
      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>{t('secBasic')}</legend>
        <label className="flex flex-col gap-1 text-sm text-muted">
          <span>{t('name')} <span className="text-warn">*</span></span>
          <input name="name" required maxLength={50} defaultValue={initial?.name ?? ''} className={field} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          <span>{t('employeeNo')} <span className="text-warn">*</span></span>
          <input name="employeeNo" required maxLength={20} pattern="[A-Za-z0-9\-]{1,20}" defaultValue={initial?.employeeNo ?? ''} className={`num ${field}`} autoComplete="off" />
          <span className="text-xs text-faint">{t('employeeNoHelp')}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('phone')}
          <input name="phone" type="tel" inputMode="tel" maxLength={20} pattern="[0-9+][0-9\- ]{6,19}" defaultValue={initial?.phone ?? ''} className={`num ${field}`} autoComplete="off" />
          <span className="text-xs text-faint">{t('phoneHelp')}</span>
        </label>
        {/* 2026-10-16 권한-6: 이메일도 로그인 아이디로 (선택) */}
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('email')}
          <input name="email" type="email" inputMode="email" maxLength={254} defaultValue={initial?.email ?? ''} className={field} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <span className="text-xs text-faint">{t('emailHelp')}</span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>{t('secOrg')}</legend>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('group')}
          <select name="groupId" defaultValue={initial?.groupId ?? ''} className={field}>
            <option value="">{t('unassigned')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          {groups.length === 0 && <span className="text-xs text-faint">{t('groupNone')}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('jobTitle')}
          <input name="jobTitle" maxLength={40} defaultValue={initial?.jobTitle ?? ''} className={field} autoComplete="off" />
        </label>
        {jobs && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('job')}
            <select name="jobId" defaultValue="" className={field}>
              <option value="">{t('jobNone')}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('joinedOn')}
          <DateTimeInput name="joinedOn" type="date" max={today} defaultValue={initial?.joinedOn ?? ''} className={`num ${field}`} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>{t('secApp')}</legend>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('locale')}
          <select name="locale" defaultValue={initial?.locale ?? 'en'} className={field}>
            {locales.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </div>
  );
}
