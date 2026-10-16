'use client';
// 가입 신청 입력 — 이름 · 이메일(아이디 @ 도메인, 도메인은 직접 입력이 기본 · 네이버 · 지메일 등 고르기) · 휴대폰(선택) · 비밀번호 두 번.
// 폰 390px: 이메일은 [아이디]@[도메인] 한 줄 + 아래에 도메인 고르기 한 줄 — 가로 넘침 없음.
import { Check, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddToHomeAndContinue } from '@/components/AddToHome';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PasswordField } from '@/components/PasswordField';
import { Button } from '@/components/ui';
import { EMAIL_DOMAINS } from '@/lib/email-rules';

const input = 'min-h-12 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';

export function SignupForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [name, setName] = useState('');
  const [local, setLocal] = useState('');
  const [domain, setDomain] = useState('');
  const [pick, setPick] = useState(''); // 빈 값 = 직접 입력
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const email = `${local.trim()}@${(pick || domain).trim()}`;

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 rounded-card border border-ok bg-ok-tint p-3 font-semibold text-ok">
          <Check aria-hidden size={20} strokeWidth={1.75} />
          {t('signup.done')}
        </p>
        <p className="text-sm text-muted">{t('signup.doneNote', { email: email.toLowerCase() })}</p>
        <p className="text-sm text-muted">{t('install.why')}</p>
        <AddToHomeAndContinue next="/login" />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (password !== again) return setErr({ code: 'password_mismatch' });
        setBusy(true);
        const r = await callApi('/api/auth/signup', { name, email, phone, password, locale });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setDone(true);
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('signup.name')}
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={50} required className={input} />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm text-muted">{t('signup.email')}</legend>
        <div className="flex items-center gap-1.5">
          <input
            aria-label={t('signup.emailLocal')}
            value={local}
            onChange={(e) => {
              // 전체 주소를 붙여 넣으면 나눠 담는다
              const v = e.target.value.replace(/\s/g, '');
              const at = v.indexOf('@');
              if (at >= 0) {
                setLocal(v.slice(0, at));
                setPick('');
                setDomain(v.slice(at + 1));
              } else setLocal(v);
            }}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            maxLength={64}
            required
            className={`${input} flex-1`}
          />
          <span aria-hidden className="shrink-0 text-muted">@</span>
          <input
            aria-label={t('signup.emailDomain')}
            value={pick || domain}
            onChange={(e) => setDomain(e.target.value.replace(/\s/g, ''))}
            readOnly={!!pick}
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            maxLength={100}
            required
            className={`${input} flex-1 ${pick ? 'bg-surface text-muted' : ''}`}
          />
        </div>
        <select aria-label={t('signup.emailPick')} value={pick} onChange={(e) => setPick(e.target.value)} className={input}>
          <option value="">{t('signup.direct')}</option>
          {EMAIL_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <p className="text-xs text-faint">{t('signup.emailHint')}</p>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('signup.phone')}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} className={input} />
      </label>

      <PasswordField label={t('register.passwordLabel')} value={password} onChange={setPassword} autoComplete="new-password" showLabel={t('login.showPassword')} hideLabel={t('login.hidePassword')} hint={t('register.passwordHint')} />
      <PasswordField label={t('register.confirmLabel')} value={again} onChange={setAgain} autoComplete="new-password" showLabel={t('login.showPassword')} hideLabel={t('login.hidePassword')} />

      <p className="text-xs text-faint">{t('signup.approveNote')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
      <Button type="submit" disabled={busy || !name.trim() || !local.trim() || !(pick || domain).trim() || !password || !again} className="min-h-14 w-full">
        <Send aria-hidden size={20} strokeWidth={1.75} />
        {busy ? t('common.working') : t('signup.submit')}
      </Button>
    </form>
  );
}
