-- 20261005000013_org_groups.sql
-- 조직도 (의뢰인 2026-10-05: 샤플 대조) — 부서 › 팀 2단계. 직원을 묶어 보는 용도다. 승인 권한과는 무관하다(승인은 관리자만).
-- 직원 등록 양식 보강: 휴대폰 번호·직무/직급·소속 그룹.
--
-- 되돌리는 방법: alter table public.profiles drop column group_id, drop column phone, drop column job_title; drop table public.org_groups;
--   ⚠️ 입력한 그룹·소속·연락처가 사라진다. 운영 뒤에는 되돌리지 말고 새 마이그레이션으로 고친다 (R-12-6).

create table public.org_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  parent_id  uuid references public.org_groups(id),   -- null = 부서(최상위), 값이 있으면 그 부서의 팀
  sort_order int not null default 0,
  active     boolean not null default true,           -- 지우지 않는다. 안 쓰는 그룹은 숨긴다 (4-6)
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),     -- 변경 기록(audit_row)이 "누가"로 읽는다
  created_at timestamptz not null default now()
);
create index on public.org_groups (parent_id);
-- 같은 자리(같은 부서 밑 또는 최상위)에 같은 이름의 활성 그룹은 하나만
create unique index org_groups_unique_name
  on public.org_groups (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  where active;

-- 2단계까지만: 팀의 부모는 부서(최상위)여야 하고, 팀을 거느린 부서는 다른 부서 밑으로 들어갈 수 없다
create or replace function public.org_groups_two_levels() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'org_groups: a group cannot be its own parent' using errcode = '23514';
    end if;
    if exists (select 1 from public.org_groups p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'org_groups: only two levels (department > team)' using errcode = '23514';
    end if;
    if exists (select 1 from public.org_groups c where c.parent_id = new.id) then
      raise exception 'org_groups: a department with teams cannot become a team' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger org_groups_two_levels before insert or update on public.org_groups
  for each row execute function public.org_groups_two_levels();

-- 직원: 소속 그룹(부서 또는 팀) · 휴대폰 · 직무/직급. 전부 선택 칸
alter table public.profiles
  add column group_id  uuid references public.org_groups(id),
  add column phone     text check (phone is null or phone ~ '^[0-9+][0-9-]{6,19}$'),
  add column job_title text check (job_title is null or char_length(job_title) <= 40);
create index on public.profiles (group_id);

-- 권한 (4-11): 그룹 이름은 로그인한 사람 누구나 읽는다(자기 소속 표시). 쓰기는 서버(service_role)만
alter table public.org_groups enable row level security;
create policy org_groups_select on public.org_groups for select to authenticated using (true);
revoke insert, update, delete, truncate on public.org_groups from anon, authenticated;
revoke all on public.org_groups from anon;

-- 삭제 금지 (숨기기만) + 변경 기록
create trigger org_groups_no_delete before delete on public.org_groups
  for each row execute function public.guard_columns();
create trigger org_groups_no_truncate before truncate on public.org_groups
  for each statement execute function public.forbid_change();
create trigger org_groups_audit after insert or update or delete on public.org_groups
  for each row execute function public.audit_row();
