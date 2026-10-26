-- 20261025000076_org_groups_three_levels.sql — 조직도를 3단계까지 (의뢰인 2026-10-25: 「조직도 3단계 구조도 만들어줘」)
-- 0013의 org_groups_two_levels(부서 › 팀 2단계)를 3단계(본부 › 부서 › 팀 같은 식)로 넓힌다. 단계 이름은 정해 두지 않는다.
--   · 부모는 자기 자신이 될 수 없고, 깊이(맨 위=1)는 3을 넘을 수 없다.
--   · 이미 하위 조직이 있는 조직의 부모를 바꾸면, 그 밑 가지를 포함한 전체 깊이가 3을 넘는지 본다.
-- 기존 자료(2단계)는 그대로 유효하다. 되돌리기: 0013의 org_groups_two_levels 함수를 다시 만들고 트리거를 바꿔 건다.

create or replace function public.org_groups_max_depth() returns trigger
language plpgsql set search_path = '' as $$
declare
  up_depth int := 0;     -- 새 부모까지 올라간 단계 수(부모 자신 포함)
  below int := 0;        -- 이 조직 밑으로 내려가는 가지의 깊이(자기 자신 제외)
  cur uuid;
  n int;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'org_groups: a group cannot be its own parent' using errcode = '23514';
    end if;
    -- 위로 올라가며 센다(순환이면 3번을 넘겨 멈춘다)
    cur := new.parent_id;
    n := 0;
    while cur is not null and n < 5 loop
      up_depth := up_depth + 1;
      if cur = new.id then
        raise exception 'org_groups: a group cannot be placed under its own descendant' using errcode = '23514';
      end if;
      select p.parent_id into cur from public.org_groups p where p.id = cur;
      n := n + 1;
    end loop;
    -- 아래로 내려가는 가지 깊이(수정일 때만 의미가 있다)
    if tg_op = 'UPDATE' then
      if exists (select 1 from public.org_groups c where c.parent_id = new.id) then below := 1; end if;
      if exists (select 1 from public.org_groups c join public.org_groups g on g.parent_id = new.id where c.parent_id = g.id) then below := 2; end if;
    end if;
    if up_depth + 1 + below > 3 then
      raise exception 'org_groups: only three levels are allowed' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists org_groups_two_levels on public.org_groups;
create trigger org_groups_max_depth before insert or update on public.org_groups
  for each row execute function public.org_groups_max_depth();
