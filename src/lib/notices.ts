// 공지 — 서버 전용 읽기·쓰기 (②-5 7-15). 쓰기는 전부 여기를 거친다 (브라우저 쓰기 권한 없음).
import 'server-only';
import { cache } from 'react';
import { selectableLocales, type Locale } from '@/i18n/locales';
import { noticeState, numbersMatch, pickDisplay, popupOrder, type NoticeRow, type TranslationRow } from '@/lib/notice-logic';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateNotice } from '@/lib/translate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase 행 모양 그대로
const toNotice = (r: any): NoticeRow => ({
  id: r.id, title: r.title, body: r.body, important: r.important, legal: r.legal, audience: r.audience,
  startsAt: new Date(r.starts_at), endsAt: r.ends_at ? new Date(r.ends_at) : null, status: r.status, version: r.version,
  createdAt: new Date(r.created_at),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTr = (r: any): TranslationRow => ({
  locale: r.locale, title: r.title, body: r.body, source: r.source, reviewed: r.reviewed, numbersOk: r.numbers_ok, basedOnVersion: r.based_on_version,
});

/** 번역할 언어 = 검수돼 켜진 언어 중 한국어 제외 (처음엔 영어만 — ① 4-10) */
export function translationLocales(): Exclude<Locale, 'ko'>[] {
  return selectableLocales().filter((l): l is Exclude<Locale, 'ko'> => l !== 'ko');
}

export async function getNotice(id: string) {
  const db = createAdminClient();
  const [{ data: n }, { data: tr }, { data: tg }] = await Promise.all([
    db.from('notices').select('*').eq('id', id).maybeSingle(),
    db.from('notice_translations').select('*').eq('notice_id', id),
    db.from('notice_targets').select('employee_id').eq('notice_id', id),
  ]);
  if (!n) return null;
  return { notice: toNotice(n), translations: (tr ?? []).map(toTr), targets: (tg ?? []).map((t) => t.employee_id as string) };
}

export async function listNoticesForAdmin(now: Date) {
  const db = createAdminClient();
  const [{ data: ns }, { data: reads }, { data: people }, { data: targets }] = await Promise.all([
    db.from('notices').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('notice_reads').select('notice_id, employee_id, version'),
    db.from('profiles').select('id, name, active'),
    db.from('notice_targets').select('notice_id, employee_id'),
  ]);
  const active = (people ?? []).filter((p) => p.active);
  return (ns ?? []).map((r) => {
    const n = toNotice(r);
    // 확인 현황: 현재 판 기준 · 대상 재직자 기준 (요점 17)
    const audience = n.audience === 'all' ? active : active.filter((p) => (targets ?? []).some((t) => t.notice_id === n.id && t.employee_id === p.id));
    const confirmed = new Set((reads ?? []).filter((x) => x.notice_id === n.id && x.version === n.version).map((x) => x.employee_id));
    return {
      notice: n,
      state: noticeState(n, now),
      confirmed: audience.filter((p) => confirmed.has(p.id)).length,
      total: audience.length,
      notConfirmed: audience.filter((p) => !confirmed.has(p.id)).map((p) => p.name as string),
    };
  });
}

export type NoticeInput = {
  title: string;
  body: string;
  important: boolean;
  legal: boolean;
  audience: 'all' | 'selected';
  targets: string[];
  startsAt: Date;
  endsAt: Date | null;
};

/** 새 공지(임시 저장) 또는 고치기. mode: 게시 뒤 고칠 때 'typo'(판 유지) | 'reshow'(판 +1, 모두 다시 확인) */
export async function saveNotice(id: string | null, input: NoticeInput, actorId: string, mode: 'typo' | 'reshow' = 'reshow'): Promise<string> {
  const db = createAdminClient();
  const row = {
    title: input.title, body: input.body, important: input.important, legal: input.legal, audience: input.audience,
    starts_at: input.startsAt.toISOString(), ends_at: input.endsAt?.toISOString() ?? null, updated_by: actorId, updated_at: new Date().toISOString(),
  };
  let noticeId = id;
  if (!noticeId) {
    const { data, error } = await db.from('notices').insert({ ...row, created_by: actorId }).select('id').single();
    if (error) throw new Error(`notice.insert: ${error.code}`);
    noticeId = data.id as string;
  } else {
    const { data: cur } = await db.from('notices').select('status, version, title, body').eq('id', noticeId).single();
    const contentChanged = cur && (cur.title !== input.title || cur.body !== input.body);
    const bump = cur?.status === 'published' && mode === 'reshow' && contentChanged;
    const { error } = await db.from('notices').update({ ...row, version: bump ? cur!.version + 1 : cur!.version }).eq('id', noticeId);
    if (error) throw new Error(`notice.update: ${error.code}`);
  }
  // 대상 직원: 지우지 못하는 표가 아니라 설정이므로 바꿔 넣는다
  await db.from('notice_targets').delete().eq('notice_id', noticeId);
  if (input.audience === 'selected' && input.targets.length) {
    await db.from('notice_targets').insert(input.targets.map((e) => ({ notice_id: noticeId, employee_id: e })));
  }
  return noticeId!;
}

/** 번역 초안 만들기 (요점 9). 실패는 언어별로 돌려준다 — 막지 않는다 (요점 10) */
export async function draftTranslations(noticeId: string): Promise<{ locale: string; ok: boolean; reason?: string; numbersOk?: boolean }[]> {
  const got = await getNotice(noticeId);
  if (!got) return [];
  const out: { locale: string; ok: boolean; reason?: string; numbersOk?: boolean }[] = [];
  for (const loc of translationLocales()) {
    const r = await translateNotice({ title: got.notice.title, body: got.notice.body }, loc);
    if (!r.ok) {
      console.error(JSON.stringify({ route: 'notices.translate', code: 'TRANSLATION_FAILED', reason: r.reason })); // 본문은 남기지 않는다
      out.push({ locale: loc, ok: false, reason: r.reason });
      continue;
    }
    const numbersOk = numbersMatch(`${got.notice.title}\n${got.notice.body}`, `${r.title}\n${r.body}`);
    await saveTranslation(noticeId, loc, { title: r.title, body: r.body, reviewed: false, source: 'machine', numbersOk }, got.notice.version);
    out.push({ locale: loc, ok: true, numbersOk });
  }
  return out;
}

export async function saveTranslation(
  noticeId: string,
  locale: string,
  t: { title: string; body: string; reviewed: boolean; source: 'machine' | 'human'; numbersOk?: boolean },
  version?: number,
  sourceText?: { title: string; body: string },
) {
  const db = createAdminClient();
  let v = version;
  let numbersOk = t.numbersOk;
  if (v === undefined || (numbersOk === undefined && !sourceText)) {
    const got = await getNotice(noticeId);
    v = got!.notice.version;
    sourceText = { title: got!.notice.title, body: got!.notice.body };
  }
  if (numbersOk === undefined) numbersOk = numbersMatch(`${sourceText!.title}\n${sourceText!.body}`, `${t.title}\n${t.body}`);
  const { error } = await db.from('notice_translations').upsert({
    notice_id: noticeId, locale, title: t.title, body: t.body, source: t.source, reviewed: t.reviewed, numbers_ok: numbersOk,
    based_on_version: v, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`notice.translation: ${error.code}`);
}

export async function setStatus(noticeId: string, status: 'published' | 'archived' | 'draft', actorId: string) {
  const { error } = await createAdminClient().from('notices').update({ status, updated_by: actorId, updated_at: new Date().toISOString() }).eq('id', noticeId);
  if (error) throw new Error(`notice.status: ${error.code}`);
}

/** 지금 시각 기준 직원 공지 — 한 요청 안에서 한 번만 읽는다 (틀의 팝업과 홈의 종 아이콘이 같이 쓴다) */
export const visibleNoticesNow = cache((employeeId: string, locale: string) => visibleNoticesFor(employeeId, locale, new Date()));

/** 직원에게 지금 보여 줄 공지 (요점 19): 대상 · 게시 중 · 현재 판을 아직 확인 안 함 */
export async function pendingNoticesFor(employeeId: string, locale: string) {
  const all = await visibleNoticesNow(employeeId, locale);
  return popupOrder(all.filter((n) => !n.confirmed), 3);
}

/** 직원 공지 목록: 대상이고 게시 중인 것 전부 (확인 여부 포함) */
export async function visibleNoticesFor(employeeId: string, locale: string, now: Date) {
  const db = createAdminClient();
  const [{ data: ns }, { data: tg }, { data: reads }] = await Promise.all([
    db.from('notices').select('*').eq('status', 'published').lte('starts_at', now.toISOString()),
    db.from('notice_targets').select('notice_id').eq('employee_id', employeeId),
    db.from('notice_reads').select('notice_id, version').eq('employee_id', employeeId),
  ]);
  const mine = new Set((tg ?? []).map((t) => t.notice_id));
  const list = (ns ?? []).map(toNotice).filter((n) => noticeState(n, now) === 'live' && (n.audience === 'all' || mine.has(n.id)));
  if (!list.length) return [];
  const { data: trs } = await db.from('notice_translations').select('*').in('notice_id', list.map((n) => n.id));
  return list
    .map((n) => {
      const d = pickDisplay(n, (trs ?? []).filter((t) => t.notice_id === n.id).map(toTr), locale);
      return {
        id: n.id, version: n.version, important: n.important, startsAt: n.startsAt,
        confirmed: (reads ?? []).some((r) => r.notice_id === n.id && r.version === n.version),
        display: d, original: { title: n.title, body: n.body },
      };
    })
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

/** 확인 (요점 22): 판 번호와 보여 준 언어를 함께 남긴다. 두 번 눌러도 한 번 */
export async function confirmNotice(noticeId: string, version: number, shownLocale: string, employeeId: string) {
  const { error } = await createAdminClient()
    .from('notice_reads')
    .upsert({ notice_id: noticeId, employee_id: employeeId, version, shown_locale: shownLocale }, { onConflict: 'notice_id,employee_id,version', ignoreDuplicates: true });
  if (error) throw new Error(`notice.confirm: ${error.code}`);
}
