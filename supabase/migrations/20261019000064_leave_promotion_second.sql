-- 20261019000064_leave_promotion_second.sql — 묶음 30 (2026-10-19 의뢰인: 연차 촉진 법정 기간 자동 계산 · 2차 통지, 「아직 안 만든 기능」 #35)
-- 1) 촉진에 「사용기간 끝나는 날」 · 「연차 종류(1년 이상 / 1년 미만)」 — 만들 때 한 번 넣고 고치지 않는다(guard_columns 허용 목록에 넣지 않음). 법정 통지 기간은 앱이 이 두 값으로 계산한다.
-- 2) 대상마다 2차 통지(회사가 사용 시기를 지정해 알림) — 지정한 날짜 · 보낸 메시지 · 때 · 보낸 사람. 한 번 보내면 바꾸지 못한다.
--    대상 상태에 「사용 시기 지정함」(DESIGNATED)을 더한다.
-- 되돌리기: alter table public.leave_promotion_campaigns drop column period_end, drop column leave_kind;
--          alter table public.leave_promotion_targets drop column designated, drop column second_message_id, drop column second_notified_at, drop column second_by;
--          (상태 목록 · 보호 트리거는 0038의 정의로 다시 만든다)

alter table public.leave_promotion_campaigns
  add column period_end date,
  add column leave_kind text check (leave_kind is null or leave_kind in ('ANNUAL', 'UNDER_ONE_YEAR'));

alter table public.leave_promotion_targets
  add column designated jsonb check (designated is null or (jsonb_typeof(designated) = 'array' and jsonb_array_length(designated) between 1 and 60)),
  add column second_message_id uuid references public.work_messages(id),
  add column second_notified_at timestamptz,
  add column second_by uuid references public.profiles(id),
  add constraint leave_promotion_targets_second_check check ((second_message_id is null) = (second_notified_at is null) and (second_notified_at is null) = (second_by is null) and (second_notified_at is null or designated is not null));

alter table public.leave_promotion_targets drop constraint leave_promotion_targets_state_check;
alter table public.leave_promotion_targets add constraint leave_promotion_targets_state_check check (state in ('CANDIDATE', 'EXCLUDED', 'NOTIFIED', 'PLAN_SUBMITTED', 'CONFIRMED', 'EXCEPTION', 'DESIGNATED'));

-- 2차 통지 칸도 바꿀 수 있게 허용 목록에 더한다(나머지는 0038과 같다)
drop trigger leave_promotion_targets_guard on public.leave_promotion_targets;
create trigger leave_promotion_targets_guard before update or delete on public.leave_promotion_targets
  for each row execute function public.guard_columns('state', 'exclude_reason', 'message_id', 'notified_at', 'plan', 'plan_version', 'plan_submitted_at', 'plan_history', 'decided_by', 'decided_at', 'decision_note', 'designated', 'second_message_id', 'second_notified_at', 'second_by');

-- 2차 통지는 한 번 — 보낸 뒤에는 지정한 날짜 · 메시지 · 때 · 사람을 바꾸지 못한다
create or replace function public.leave_promotion_second_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.second_message_id is not null and (new.designated is distinct from old.designated or new.second_message_id is distinct from old.second_message_id or new.second_notified_at is distinct from old.second_notified_at or new.second_by is distinct from old.second_by) then
    raise exception 'leave_promotion_targets: a sent second notice cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger leave_promotion_targets_second_lock before update on public.leave_promotion_targets
  for each row execute function public.leave_promotion_second_lock();
revoke all on function public.leave_promotion_second_lock() from public, anon, authenticated;
