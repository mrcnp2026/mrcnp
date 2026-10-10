-- 20261010000025_jobs.sql
-- 직무 (의뢰인 2026-10-10: 시프티의 「직무」 기준 — 1. 시급제 · 2. 월급제 · 3. 관리자 : 팀장 · 4. 관리자 : 사업부장 · 경영지원실 · 임원. 목록의 색 막대가 직무 색).
--   · jobs            : 이름 · 색 · 순서. 지우지 않고 꺼 둔다 (4-6)
--   · profiles.job_id : 그 직원의 본직무 (하나). 기존 글자 칸 job_title(직급)은 그대로 둔다
-- 급여 형태(시급/월급)·계약 시간은 「근로정보」에서 따로 다룬다 — 직무는 지금 표시·묶음용이다.
--
-- 되돌리는 방법: alter table public.profiles drop column job_id; drop table public.jobs;
--   ⚠️ 만든 직무와 직원별 지정이 사라진다 (출퇴근 기록·급여 계산에는 영향 없음).

create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null default 'primary' check (color in ('primary','ok','warn','danger','text','muted')),
  sort       int not null default 0,
  active     boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index jobs_unique_name on public.jobs (lower(btrim(name))) where active;

alter table public.jobs enable row level security;
-- 직무 이름·색은 로그인한 사람 누구나 읽는다 (목록 표시). 쓰기는 서버(service_role)만
create policy jobs_select on public.jobs for select to authenticated using (true);
revoke insert, update, delete, truncate on public.jobs from anon, authenticated;
revoke all on public.jobs from anon;
create trigger jobs_no_delete before delete on public.jobs
  for each row execute function public.guard_columns();
create trigger jobs_audit after insert or update or delete on public.jobs
  for each row execute function public.audit_row();

alter table public.profiles add column job_id uuid references public.jobs(id);
create index on public.profiles (job_id);
