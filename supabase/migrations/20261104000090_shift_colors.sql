-- 20261104000090_shift_colors.sql
-- 근무일정 템플릿 · 직무 색 5가지 추가 (2026-11-04 의뢰인: 템플릿마다 색을 다르게). 기존 6색 중 primary · ok가 같은 초록이라 구분이 안 됐다.
--   blue · purple · orange · sky · pink — 실제 색 값은 src/config/theme.ts의 shift-* 토큰.
--
-- 되돌리는 방법: 새 색을 쓰는 줄을 기존 색으로 바꾼 뒤 아래 두 check를 예전 6색으로 다시 건다.

alter table public.shift_templates drop constraint if exists shift_templates_color_check;
alter table public.shift_templates add constraint shift_templates_color_check
  check (color in ('primary','ok','warn','danger','text','muted','blue','purple','orange','sky','pink'));

alter table public.jobs drop constraint if exists jobs_color_check;
alter table public.jobs add constraint jobs_color_check
  check (color in ('primary','ok','warn','danger','text','muted','blue','purple','orange','sky','pink'));
