-- 20261103000085_work_message_hide.sql
-- 전달 글 숨기기 (2026-11-03 의뢰인: 「전달에 이미 기록된 연장근로 · 회신 필요 · 안내 메시지는 지워버려」).
--   지우지 않고 숨긴다(②-0 4-6) — 숨긴 글은 받은 · 보낸 목록 · 읽지 않은 숫자 · 검색에서 빠진다. 누가 언제 숨겼는지 남는다.
--   글 내용(제목 · 본문 · 받는 사람)은 여전히 고칠 수 없다. 바뀌는 칸은 hidden_at · hidden_by 뿐.
--
-- 되돌리는 방법: 트리거를 0038의 guard_columns()로 다시 만들고 alter table public.work_messages drop column hidden_at, drop column hidden_by;
--   숨겼던 글이 다시 보인다.

alter table public.work_messages
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles(id);

drop trigger work_messages_guard on public.work_messages;
create trigger work_messages_guard before update or delete on public.work_messages
  for each row execute function public.guard_columns('hidden_at', 'hidden_by');
