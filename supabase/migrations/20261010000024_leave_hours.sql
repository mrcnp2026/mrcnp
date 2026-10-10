-- 20261010000024_leave_hours.sql
-- 휴가를 시간 단위로 (의뢰인 2026-10-10: 시프티 기준. "10시 반차 · 11시 반차 · 4시간 반차 등 상세히 구분").
--   · leave_types    : 시간(hours) · 정해진 시작/끝 시각 · 묶음 이름 · 기본 종류 표시(builtin). 관리자가 종류를 만들고 끈다 (지우지 않는다)
--   · leave_requests : 그 휴가의 시작/끝 시각 (신청할 때 종류에서 옮겨 적는다 — 나중에 종류를 고쳐도 지난 신청은 그대로)
--   · 일수 칸의 소수 자리를 늘린다: 30분 = 0.0625일 (하루 8시간 기준)
-- 차감 일수(day_unit) = 시간 ÷ 8 (최대 1). 기존 종류의 값은 그대로다 (연차 1 · 반차 0.5 · 반반차 0.25).
--
-- 되돌리는 방법: 새 칸을 drop column 하면 된다 (leave_types: hours, start_time, end_time, group_name, builtin, updated_by / leave_requests: start_time, end_time).
--   ⚠️ 관리자가 만든 종류로 이미 신청이 들어왔다면 되돌리지 말 것 (그 신청의 시각 정보가 사라진다).

alter table public.leave_types
  alter column day_unit type numeric(6,4),
  add column hours      numeric(4,2) check (hours is null or (hours > 0 and hours <= 24)),
  add column start_time time,
  add column end_time   time,
  add column group_name text check (group_name is null or char_length(btrim(group_name)) between 1 and 40),
  add column builtin    boolean not null default false,
  add column updated_by uuid references public.profiles(id),
  add constraint leave_types_time_pair check ((start_time is null) = (end_time is null)),
  add constraint leave_types_time_order check (start_time is null or end_time > start_time),
  add constraint leave_types_unit_range check (day_unit > 0 and day_unit <= 1),
  add constraint leave_types_name_len check (char_length(btrim(name)) between 1 and 40);

update public.leave_types set builtin = true;
update public.leave_types set hours = case code when 'half' then 4 when 'quarter' then 2 else 8 end;
alter table public.leave_types alter column hours set not null;

-- 지우지 않고 꺼 둔다 (4-6)
create trigger leave_types_no_delete before delete on public.leave_types
  for each row execute function public.guard_columns();

alter table public.leave_requests
  alter column days type numeric(7,4),
  add column start_time time,
  add column end_time   time,
  add constraint leave_requests_time_pair check ((start_time is null) = (end_time is null)),
  add constraint leave_requests_time_order check (start_time is null or end_time > start_time);
