-- 20261016000046_two_grades.sql — 묶음 13의 1번 (의뢰인 2026-10-15 승인 2026-10-16)
-- 등급은 최고관리자(대표자 포함 최대 3명) · 일반직원 두 가지. 지금 「대표자」(ceo)는 최고관리자(super)로 옮긴다.
-- 1명씩만 두던 유일 인덱스를 없애고, 최고관리자(super · ceo)를 3명까지만 허용하는 검사(트리거)를 둔다.
-- 되돌리기: drop trigger profiles_top_limit on public.profiles; drop function public.guard_top_admins();
--           create unique index profiles_one_super on public.profiles ((true)) where admin_level = 'super';
--           create unique index profiles_one_ceo on public.profiles ((true)) where admin_level = 'ceo';

drop index if exists public.profiles_one_super;
drop index if exists public.profiles_one_ceo;

create or replace function public.guard_top_admins()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.admin_level in ('super', 'ceo') and new.active then
    perform pg_advisory_xact_lock(hashtextextended('top_admins', 0));
    if (select count(*) from public.profiles where admin_level in ('super', 'ceo') and active and id <> new.id) >= 3 then
      raise exception using errcode = 'P0001', message = 'super_full';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_top_limit on public.profiles;
create trigger profiles_top_limit before insert or update of admin_level, active on public.profiles
  for each row execute function public.guard_top_admins();

update public.profiles set admin_level = 'super' where admin_level = 'ceo';
