'use client';
// 직원 정보 입력칸 — 등록 화면과 수정 화면이 같은 칸을 쓴다 (2026-10-05 의뢰인: 샤플 구성원 등록 양식 대조).
// 묶음: 기본 정보(이름·사번·휴대폰·이메일) / 소속(그룹·직무/직급·입사일). 휴대폰·이메일·그룹·직급·입사일은 선택.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { DateTimeInput } from '@/components/DateTimeInput';

export type OrgOption = { id: string; label: string };
export type EmployeeValues = { jobId?: string; name: string; employeeNo: string; phone: string; email?: string; groupId: string; jobTitle: string; joinedOn: string; locale: string };

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';

export function EmployeeFields({
  initial,
  groups,
  today,
  jobs,
  popup = false,
}: {
  initial?: Partial<EmployeeValues>;
  groups: OrgOption[];
  locales?: { code: string; name: string }[]; // 예전 호출과 맞추려고 받기만 한다 — 화면 언어는 직원이 직접 바꾼다
  today: string;
  jobs?: OrgOption[]; // 넘기면 「직무」 고르기 칸이 생긴다 (추가할 때만)
  popup?: boolean; // PC 팝업: 회색 띠 제목 (시프티 「직원 추가하기」)
}) {
  const t = useTranslations('admin.members');
  const legend = popup ? 'mb-3 w-full bg-surface px-3 py-2 text-sm font-bold' : 'mb-3 text-sm font-bold text-primary';
  const label = 'flex min-w-0 flex-col gap-1 text-sm text-muted';
  return (
    // 2026-10-16 의뢰인(디자인): 묶음은 위아래로, 묶음 안에서 칸을 두 개씩 — 한쪽 묶음만 길게 늘어지던 것을 없앤다.
    // 직원 화면 언어는 고르지 않는다(직원이 자기 화면에서 바꾼다) — 값은 그대로 보낸다
    <div className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={initial?.locale ?? 'ko'} />
      <fieldset className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <legend className={legend}>{t('secBasic')}</legend>
        <label className={label}>
          <span>{t('name')} <span className="text-warn">*</span></span>
          <input name="name" required maxLength={50} defaultValue={initial?.name ?? ''} className={field} autoComplete="off" />
        </label>
        <label className={label}>
          <span>{t('employeeNo')} <span className="text-warn">*</span></span>
          <input name="employeeNo" required maxLength={20} pattern="[A-Za-z0-9\-]{1,20}" defaultValue={initial?.employeeNo ?? ''} className={`num ${field}`} autoComplete="off" />
          <span className="text-xs text-faint">{t('employeeNoHelp')}</span>
        </label>
        <label className={label}>
          {t('phone')}
          <input name="phone" type="tel" inputMode="tel" maxLength={20} pattern="[0-9+][0-9\- ]{6,19}" placeholder="010-0000-0000" defaultValue={initial?.phone ?? ''} className={`num ${field}`} autoComplete="off" />
          <span className="text-xs text-faint">{t('phoneHelp')}</span>
        </label>
        {/* 2026-10-16 권한-6: 이메일도 로그인 아이디로 (선택) */}
        <label className={label}>
          {t('email')}
          <input name="email" type="email" inputMode="email" maxLength={254} placeholder={t('emailPh')} defaultValue={initial?.email ?? ''} className={field} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <span className="text-xs text-faint">{t('emailHelp')}</span>
        </label>
      </fieldset>

      <fieldset className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <legend className={legend}>{t('secOrg')}</legend>
        <label className={label}>
          {t('group')}
          <Select name="groupId" defaultValue={initial?.groupId ?? ''} className={field}>
            <option value="">{t('unassigned')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
          {groups.length === 0 && <span className="text-xs text-faint">{t('groupNone')}</span>}
        </label>
        <label className={label}>
          {t('jobTitle')}
          <input name="jobTitle" maxLength={40} defaultValue={initial?.jobTitle ?? ''} className={field} autoComplete="off" />
        </label>
        {jobs && (
          <label className={label}>
            {t('job')}
            <Select name="jobId" defaultValue={initial?.jobId ?? ''} className={field}>
              <option value="">{t('jobNone')}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className={label}>
          {t('joinedOn')}
          <DateTimeInput name="joinedOn" type="date" max={today} defaultValue={initial?.joinedOn ?? ''} className={`num ${field}`} />
        </label>
      </fieldset>
    </div>
  );
}
