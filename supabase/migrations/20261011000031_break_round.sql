-- 20261011000031_break_round.sql
-- 근무규칙에 둘째 휴게시간대와 급여용 시간의 끊는 단위 (의뢰인 2026-10-11, 결정 문서 확정-9: "시프티에서 지금 쓰는 방식 그대로").
--   · extra_breaks   : 첫 휴게시간대(break_start~break_end) 말고 더 있는 휴게시간대들. 예: [{"start":"17:00","end":"17:30"}]
--   · round_step_min : 급여용 시간을 끊는 단위(분). 출근은 올림 · 퇴근은 내림. 0 = 끊지 않는다
-- 기존 규칙의 값은 그대로다(둘째 휴게 없음 · 끊지 않음). 숫자가 달라지려면 관리자가 설정 화면에서 "언제부터" 적용할 새 규칙을 넣어야 한다 —
-- 지난 날짜의 계산은 바뀌지 않는다.
--
-- 되돌리는 방법: alter table public.work_rules drop column extra_breaks, drop column round_step_min;

alter table public.work_rules
  add column extra_breaks   jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_breaks) = 'array'),
  add column round_step_min integer not null default 0 check (round_step_min in (0, 5, 10, 15, 30, 60));
