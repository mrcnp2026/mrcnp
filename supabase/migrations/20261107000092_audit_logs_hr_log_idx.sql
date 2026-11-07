-- 20261107000092_audit_logs_hr_log_idx.sql
-- 인사 기록(/admin/hr-log, src/lib/hr-log.ts loadHrLog)의 audit_logs 두 조회가 줄마다 JSON을 열어 보며 표 전체(4.3만 줄)를 훑었다.
--   2026-11-07 개발 DB 측정: 처리 기록 4,416ms → 1.5ms, 직원 정보 수정 줄 평균 1,512ms → 6ms (색인을 넣고 잰 뒤 되돌림).
--   조건이 조회와 똑같아야 색인을 쓴다 — loadHrLog의 eq · not · is를 바꾸면 여기도 같이 바꾼다.
--
-- 되돌리는 방법: drop index public.audit_logs_hr_events_idx, public.audit_logs_hr_updates_idx;

create index if not exists audit_logs_hr_events_idx on public.audit_logs (created_at desc)
  where target_table = 'profiles' and (after_data ->> 'event') is not null;

create index if not exists audit_logs_hr_updates_idx on public.audit_logs (created_at desc)
  where target_table = 'profiles' and action = 'update' and (after_data ->> 'event') is null;
