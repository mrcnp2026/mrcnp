-- 20261019000060_leave_quarter_evidence.sql — 묶음 9 (2026-10-15 작성, 2026-10-19 의뢰인 승인: 15분 휴가 · 증빙 파일)
-- 1 · 3) 일수를 소수 다섯째 자리까지 — 15분 = 0.03125일이 잘리지 않게 (휴가 원장은 이미 분 단위 정수라 그대로다)
-- 4) 휴가 증빙 파일 기록 표 — 신청 한 건에 최대 3개(앱이 센다). 파일은 비공개 저장소(leave-evidence)에 두고 서버만 꺼내 준다.
--    고치지 못한다. 떼기는 removed_at · removed_by만 적는다(줄은 남는다). 지우지 못한다.
-- 5) 저장소 버킷 leave-evidence — 비공개, 10MB, PDF · JPG · PNG · HEIC
-- 되돌리기: drop table public.leave_attachments; drop function public.guard_leave_attachment(); delete from storage.buckets where id = 'leave-evidence';
--          (자릿수는 15분 휴가가 없을 때만) alter table public.leave_types alter column day_unit type numeric(6,4); alter table public.leave_requests alter column days type numeric(7,4);

alter table public.leave_types alter column day_unit type numeric(8,5);
alter table public.leave_requests alter column days type numeric(9,5);

create table public.leave_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(id),
  employee_id uuid not null references public.profiles(id),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 200),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  is_test boolean not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  check ((removed_at is null) = (removed_by is null))
);
create index on public.leave_attachments (request_id);
create index on public.leave_attachments (employee_id);

alter table public.leave_attachments enable row level security;
revoke all on public.leave_attachments from anon, authenticated;

create or replace function public.guard_leave_attachment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'leave_attachments: delete not allowed'; end if;
  if (to_jsonb(new) - array['removed_at', 'removed_by']) is distinct from (to_jsonb(old) - array['removed_at', 'removed_by']) then
    raise exception using errcode = '42501', message = 'leave_attachments: content is immutable';
  end if;
  if old.removed_at is not null then raise exception using errcode = 'P0001', message = 'already'; end if;
  return new;
end $$;
create trigger leave_attachments_guard before update or delete on public.leave_attachments
  for each row execute function public.guard_leave_attachment();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-evidence', 'leave-evidence', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
