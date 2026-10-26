-- 직원의 「휴가 정정 요청」 (2026-10-23 의뢰인 승인): 승인된 휴가의 종류 · 날짜 · 시작 시각을 바꿔 달라는 요청.
--   kind 'change' 추가 — 새 내용은 new_* 칸에 담는다(요청 내용은 고정, 결정 칸만 바뀌는 규칙 그대로).
--   승인하면 앱이 새 내용을 검사한 뒤 기존 휴가를 취소하고 새 휴가를 승인으로 만든다(직권 고치기와 같은 순서). 거절하면 휴가는 그대로다.
--   기존 'delete' 요청은 new_* 칸이 비어 있고 그대로 동작한다. 바뀌는 기존 자료 없음.
-- 되돌리는 방법: 'change' 요청이 없을 때만 — 칸 4개를 drop 하고 kind 검사를 ('delete')로 되돌린다.
alter table public.leave_change_requests drop constraint leave_change_requests_kind_check;
alter table public.leave_change_requests add constraint leave_change_requests_kind_check check (kind in ('delete', 'change'));
alter table public.leave_change_requests add column new_type_code text;
alter table public.leave_change_requests add column new_start_date date;
alter table public.leave_change_requests add column new_end_date date;
alter table public.leave_change_requests add column new_start_time time;
alter table public.leave_change_requests add constraint leave_change_requests_change_check check (kind = 'delete' or (new_type_code is not null and new_start_date is not null and new_end_date is not null and new_end_date >= new_start_date));
