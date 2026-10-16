-- 20261016000053_import_marks.sql — 묶음 20 (의뢰인 2026-10-16: 시프티 26년 출퇴근 · 휴가 기록을 실제 기록으로 옮긴다)
-- 옮겨 온 기록이라는 표시와, 같은 줄을 두 번 넣지 않게 하는 열쇠(import_key)를 둔다.
--   · punch_events.source에 'import'(시프티에서 옮김)를 더한다. 출퇴근 기록은 고치거나 지울 수 없는 표라서 두 번 들어가면 되돌릴 수 없다 → import_key로 막는다.
--   · leave_requests.source: 'app'(앱에서 신청 · 직권) / 'import'(시프티에서 옮김) + import_key.
-- 되돌리기: alter table public.punch_events drop column import_key; (source 검사는 'web','qr','admin'으로 다시)
--           alter table public.leave_requests drop column source, drop column import_key;
--   ⚠️ 이미 옮겨 온 줄이 있으면 source 검사를 되돌릴 수 없다(그 줄은 지울 수 없다).

alter table public.punch_events drop constraint if exists punch_events_source_check;
alter table public.punch_events add constraint punch_events_source_check check (source in ('web', 'qr', 'admin', 'import'));
alter table public.punch_events add column import_key text check (import_key is null or char_length(import_key) between 8 and 120);
create unique index punch_events_import_key on public.punch_events (import_key) where import_key is not null;

alter table public.leave_requests add column source text not null default 'app' check (source in ('app', 'import'));
alter table public.leave_requests add column import_key text check (import_key is null or char_length(import_key) between 8 and 120);
create unique index leave_requests_import_key on public.leave_requests (import_key) where import_key is not null;
