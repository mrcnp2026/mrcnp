-- 20261016000052_staff_notes.sql — 묶음 19 (의뢰인 2026-10-16: 직원 상세 「개인 정보」에 그 사람에 대한 비고 사항)
-- 관리자만 쓰고 읽는 메모. 한 건은 4줄 정도(500자까지), 여러 건이 쌓이고 화면은 4건씩 넘겨 본다. 직원에게는 보이지 않는다.
-- 지우면 숨기기만 한다(deleted_at) — 누가 언제 썼고 지웠는지는 변경 기록(audit_row, updated_by)에 남는다.
-- 앱 서버(관리자 열쇠)만 읽고 쓴다.
-- 되돌리기: drop table public.staff_notes;

create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

create index staff_notes_employee on public.staff_notes (employee_id, created_at desc) where deleted_at is null;

alter table public.staff_notes enable row level security;
revoke all on public.staff_notes from anon, authenticated;

create trigger staff_notes_audit after insert or update or delete on public.staff_notes for each row execute function public.audit_row();
