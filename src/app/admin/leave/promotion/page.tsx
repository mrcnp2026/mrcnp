// 연차 사용 촉진 (관리자) — 촉진 목록과 만들기 (PRD v1.3 37.3, L17).
// 프로그램은 통지 · 계획 · 처리의 사실과 시각을 남길 뿐, 법적 촉진 완료나 수당 면제를 정하지 않는다.
import { getTranslations } from 'next-intl/server';
import { ListHead } from '@/components/listframe';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { loadCampaigns } from '@/lib/leave-promotion';
import { toKstDate } from '@/lib/time';
import { CampaignCreate } from './PromotionForms';

const TONE = { DRAFT: 'neutral', SENT: 'info', CLOSED: 'ok' } as const;

export default async function PromotionPage() {
  const tGear = await getTranslations('frame');
  const me = await requireAdmin();
  if (!me) redirect('/login');
  const [t, list] = await Promise.all([getTranslations('admin.promotion'), loadCampaigns(me)]);
  const today = toKstDate(new Date());
  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} settingsHref="/admin/settings?tab=leave" settingsLabel={tGear('item.setLeave')} />
      <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('legal')}</p>
      <Card>
        <CardTitle>{t('createTitle')}</CardTitle>
        <div className="pt-3">
          <CampaignCreate today={today} sample={t('sample')} />
        </div>
      </Card>
      <div className="overflow-x-auto rounded-card border border-border bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left">
              {['colTitle', 'colBasis', 'colDue', 'colState', 'colSent'].map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-3">
                  <Link href={`/admin/leave/promotion/${c.id}`} className="font-bold text-primary hover:underline">
                    {c.title}
                  </Link>
                </td>
                <td className="num px-3 py-3 whitespace-nowrap">{c.basisOn}</td>
                <td className="num px-3 py-3 whitespace-nowrap">{c.planDueOn}</td>
                <td className="px-3 py-3">
                  <Chip tone={TONE[c.state]}>{t(`state.${c.state}`)}</Chip>
                </td>
                <td className="num px-3 py-3 whitespace-nowrap">{c.sentAt ? toKstDate(new Date(c.sentAt)) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-4 text-sm text-faint">{t('empty')}</p>}
      </div>
    </PageShell>
  );
}
