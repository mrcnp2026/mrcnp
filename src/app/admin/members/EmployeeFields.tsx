'use client';
// 직원 정보 입력칸 — 등록 화면과 수정 화면이 같은 칸을 쓴다 (2026-10-05 의뢰인: 샤플 구성원 등록 양식 대조).
// 묶음: 기본 정보(이름·사번·휴대폰) / 소속(그룹·직무/직급·입사일) / 화면 언어. 휴대폰·그룹·직급·입사일은 선택.
import { useTranslations } from 'next-intl';
import { DateTimeInput } from '@/components/DateTimeInput';

export type OrgOption = { id: string; label: string };
export type EmployeeValues = { name: string; employeeNo: string; phone: string; groupId: string; jobTitle: string; joinedOn: string; locale: string };

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function EmployeeFields({
  initial,
  groups,
  locales,
  today,
}: {
  initial?: Partial<EmployeeValues>;
  groups: OrgOption[];
  locales: { code: string; name: string }[];
  today: string;
}) {
  const t = useTranslations('admin.members');
  return (
    // PC: 묶음 3개를 가로로 (2026-10-06 의뢰인: 한 줄로 길게 늘어져 있었다) · 폰: 세로
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-bold text-primary">{t('secBasic')}</legend>
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
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-bold text-primary">{t('secOrg')}</legend>
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
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('joinedOn')}
          <DateTimeInput name="joinedOn" type="date" max={today} defaultValue={initial?.joinedOn ?? ''} className={`num ${field}`} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-bold text-primary">{t('secApp')}</legend>
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
