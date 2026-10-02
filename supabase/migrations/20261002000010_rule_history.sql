-- ② 4-1: 근무규칙은 이력이다. "켜진 규칙 하나"가 아니라 "그 날짜에 유효한 규칙"을 읽는다 (src/lib/rule-at.ts).
-- active=false는 "숨김"(잘못 넣은 행)이다. 같은 시작일에 두 규칙이 켜져 있으면 어느 것인지 모르므로 막는다.
drop index if exists public.work_rules_one_active;
create unique index work_rules_one_per_day on public.work_rules (effective_from) where active;
-- 규칙 행은 고치지 않는다 — 바꾸려면 새 시작일로 새 행 (숨기기 active=false만 허용)
create or replace function public.work_rules_guard() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'active') <> (to_jsonb(old) - 'active') then
    raise exception 'work_rules 행은 고칠 수 없습니다. 새 시작일로 새 규칙을 넣으세요 (② 4-1)';
  end if;
  return new;
end $$;
create trigger work_rules_no_edit before update on public.work_rules for each row execute function public.work_rules_guard();
create trigger work_rules_no_delete before delete on public.work_rules for each row execute function public.forbid_change();
