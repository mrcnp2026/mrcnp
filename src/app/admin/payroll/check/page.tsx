// 급여 미리 보기(옛 급여 점검, 급여-68)는 뺐다 (2026-11-04 의뢰인: 「그냥 빼자」 — 근태 점검 · 급여대장과 겹치고 계약 재등록 알림도 필요 없다).
// 예전 주소로 들어오면 급여대장으로 보낸다. 표(0087)는 그대로 둔다 — 저장된 자료가 없다.
import { redirect } from 'next/navigation';

export default function PayCheckGone() {
  redirect('/admin/payroll/runs');
}
