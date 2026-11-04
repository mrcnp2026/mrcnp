-- 20261104000091_shift_template_free.sql
-- 근무일정 템플릿 유형 「무일정 근무」(free) 추가 (2026-11-04 의뢰인: 강혜주 — 청소, 정해진 시간 없이 일한 시간만).
--   이 유형 템플릿을 받은 직원은 그날 계획이 없다 — 지각 · 조퇴 · 미출근을 따지지 않고 찍은 시간만 센다(src/lib/shifts.ts planDay).
--   날짜별 일정(shifts)에는 넣지 않는다 — 템플릿에만.
--
-- 되돌리는 방법: free 템플릿을 다른 유형으로 바꾼 뒤 아래 check를 예전 목록으로 다시 건다.

alter table public.shift_templates drop constraint if exists shift_templates_kind_check;
alter table public.shift_templates add constraint shift_templates_kind_check
  check (kind in ('none','normal','deemed','outside','remote','holiday','extra','free'));
