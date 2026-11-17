// 급여 계산의 차단 · 안내 한 줄을 화면 글로 — 대장 · 직원별 명세 · 사원별 급여가 같이 쓴다. 서버 전용.
// 「확인 안 된 급여 설정」 목록은 코드 이름(ledger, allowance.night, FULL_ATTENDANCE …)으로 저장돼 있어 회사 설정의 한국어 이름으로 바꿔 보인다
// (2026-11-17 의뢰인: 「몬소린지 모르겠고 영어 빼」). 저장된 값은 그대로 둔다 — 바꾸면 계산 입력이 달라져 모든 대장이 「다시 계산 필요」가 된다.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { loadItems } from './data';

export type BlockerLike = { code: string; detail?: string };

export async function blockerText(): Promise<(b: BlockerLike) => string> {
  const [t, tp, items] = await Promise.all([getTranslations('admin.payRuns'), getTranslations('admin.paySettings'), loadItems()]);
  const itemName = new Map(items.map((i) => [i.code, i.koName]));
  const dk = (d: string) => d.replace(/[.-]/g, '_'); // 번역 열쇠에는 점 · 줄표를 쓸 수 없다
  const one = (k: string) => (t.has(`detail.${dk(k)}`) ? t(`detail.${dk(k)}`) : k);
  const basisName = (k: string) =>
    k === 'ledger' ? t('basis.ledger') : k === 'employee-defaults' ? t('basis.employeeDefaults') : k.startsWith('allowance.') && tp.has(`s07.kind.${k.slice(10)}`) ? tp(`s07.kind.${k.slice(10)}`) : (itemName.get(k) ?? one(k));
  const detailOf = (b: BlockerLike) => (!b.detail ? '' : b.code === 'basis_unverified' ? b.detail.split(', ').map(basisName).join(', ') : one(b.detail));
  return (b) => (t.has(`blocker.${b.code}`) ? t(`blocker.${b.code}`, { detail: detailOf(b) }) : `${b.code}${b.detail ? ` (${b.detail})` : ''}`);
}
