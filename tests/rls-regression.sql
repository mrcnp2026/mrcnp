-- 권한 회귀 검사 (부록 R-12-6) — 마이그레이션을 적용할 때마다 돌린다.
-- 직원·관리자·비로그인 세션과 서버 권한을 흉내 내어 기록 표에 직접 쓰기를 시도하고, 전부 거부되는지 본다.
-- ★ 마지막 줄에서 일부러 오류를 내서 이 안에서 만든 시험 데이터를 전부 되돌린다. DB에 아무것도 남지 않는다.
-- 결과는 오류 메시지 안에 "PASS|번호|설명" / "FAIL|번호|설명" 줄로 담긴다.
do $$
declare
  adm uuid := gen_random_uuid();
  emp uuid := gen_random_uuid();
  pe_emp uuid; n int;
  out text := '';
begin
  insert into auth.users (id, email, aud, role) values
    (adm, 'rls-admin-' || adm || '@test.invalid', 'authenticated', 'authenticated'),
    (emp, 'rls-emp-'   || emp || '@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (id, name, role) values (adm, 'RLS-A', 'admin'), (emp, 'RLS-E', 'employee');
  insert into public.punch_events (employee_id, kind, work_date) values (emp, 'in', '2026-10-02') returning id into pe_emp;
  insert into public.punch_events (employee_id, kind, work_date) values (adm, 'in', '2026-10-02');

  -- ── 직원 세션 ──
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin insert into public.punch_events (employee_id, kind, work_date, is_test, ip_verified) values (emp, 'in', '2026-10-01', false, true); out := out || E'FAIL|01|employee insert punch_events\n';
  exception when others then out := out || E'PASS|01|employee insert punch_events denied\n'; end;
  begin insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, kind, new_punched_at, status) values (emp, '2026-10-02', 'x', emp, 'add_missing', 'out', now(), 'approved'); out := out || E'FAIL|02|employee insert punch_corrections\n';
  exception when others then out := out || E'PASS|02|employee insert punch_corrections denied\n'; end;
  begin insert into public.overtime_requests (employee_id, work_date, overtime_minutes) values (emp, '2026-10-02', 600); out := out || E'FAIL|03|employee insert overtime_requests\n';
  exception when others then out := out || E'PASS|03|employee insert overtime_requests denied\n'; end;
  select count(*) into n from public.punch_events;
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || '|04|employee sees only own punch_events (' || n || E')\n';
  begin update public.profiles set can_view_payroll = true where id = emp; out := out || E'FAIL|05|employee update own profile\n';
  exception when others then out := out || E'PASS|05|employee update own profile denied\n'; end;

  -- ── 관리자 세션 ──
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*) into n from public.punch_events;
  out := out || case when n = 2 then 'PASS' else 'FAIL' end || '|06|admin sees all punch_events with RLS on (' || n || E')\n';
  begin insert into public.punch_events (employee_id, kind, work_date) values (emp, 'out', '2026-10-02'); out := out || E'FAIL|07|admin insert punch_events\n';
  exception when others then out := out || E'PASS|07|admin insert punch_events denied\n'; end;
  begin insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, target_id) values (emp, '2026-10-02', 'x', adm, 'void', pe_emp); out := out || E'FAIL|08|admin insert punch_corrections\n';
  exception when others then out := out || E'PASS|08|admin insert punch_corrections denied\n'; end;
  begin insert into public.overtime_requests (employee_id, work_date, overtime_minutes) values (emp, '2026-10-02', 60); out := out || E'FAIL|09|admin insert overtime_requests\n';
  exception when others then out := out || E'PASS|09|admin insert overtime_requests denied\n'; end;
  begin update public.punch_events set punched_at = now() where id = pe_emp; out := out || E'FAIL|10|admin update punch_events\n';
  exception when others then out := out || E'PASS|10|admin update punch_events denied\n'; end;
  begin delete from public.punch_events where id = pe_emp; out := out || E'FAIL|11|admin delete punch_events\n';
  exception when others then out := out || E'PASS|11|admin delete punch_events denied\n'; end;
  begin update public.profiles set can_view_payroll = true where id = adm; out := out || E'FAIL|12|admin self-grant payroll\n';
  exception when others then out := out || E'PASS|12|admin self-grant payroll denied\n'; end;

  -- ── 비로그인 ──
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin select count(*) into n from public.profiles; out := out || E'FAIL|13|anon select profiles\n';
  exception when others then out := out || E'PASS|13|anon select profiles denied\n'; end;

  -- ── 서버 최고 권한(service_role도 RLS를 건너뛴다)에서도 막혀야 하는 것 ──
  perform set_config('role', 'postgres', true);
  begin update public.punch_events set punched_at = now() where id = pe_emp; out := out || E'FAIL|14|server update punch_events\n';
  exception when others then out := out || E'PASS|14|server update punch_events denied\n'; end;
  begin delete from public.punch_events where id = pe_emp; out := out || E'FAIL|15|server delete punch_events\n';
  exception when others then out := out || E'PASS|15|server delete punch_events denied\n'; end;
  begin insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, new_punched_at) values (emp, '2026-10-02', 'x', emp, 'add_missing', now()); out := out || E'FAIL|16|add_missing without kind\n';
  exception when others then out := out || E'PASS|16|add_missing without kind denied\n'; end;
  begin insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, kind) values (emp, '2026-10-02', 'x', emp, 'add_missing', 'out'); out := out || E'FAIL|17|add_missing without time\n';
  exception when others then out := out || E'PASS|17|add_missing without time denied\n'; end;
  insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, kind, new_punched_at, status, approved_by)
    values (emp, '2026-10-02', 'a', emp, 'add_missing', 'out', '2026-10-02 09:40:00+00', 'approved', adm);
  begin insert into public.punch_corrections (employee_id, work_date, reason, requested_by, correction_type, kind, new_punched_at, status, approved_by)
    values (emp, '2026-10-02', 'b', emp, 'add_missing', 'out', '2026-10-02 10:00:00+00', 'approved', adm); out := out || E'FAIL|18|second approved add_missing same day/kind\n';
  exception when others then out := out || E'PASS|18|second approved add_missing same day/kind denied\n'; end;
  insert into public.overtime_requests (employee_id, work_date, overtime_minutes, night_minutes) values (emp, '2026-10-02', 60, 30);
  begin update public.overtime_requests set approved_minutes = 90 where employee_id = emp; out := out || E'FAIL|19|approved > counted\n';
  exception when others then out := out || E'PASS|19|approved > counted denied\n'; end;
  begin update public.overtime_requests set overtime_minutes = 10 where employee_id = emp; out := out || E'FAIL|20|edit counted overtime (fact)\n';
  exception when others then out := out || E'PASS|20|edit counted overtime (fact) denied\n'; end;
  begin update public.overtime_requests set status = 'approved', approved_minutes = 45, approved_by = adm, decided_at = now() where employee_id = emp; out := out || E'PASS|21|partial approval 45/60 allowed\n';
  exception when others then out := out || 'FAIL|21|partial approval blocked: ' || sqlerrm || E'\n'; end;
  insert into public.work_rules (name, start_time, end_time, effective_from) values ('r1', '09:00', '18:00', '2026-10-01');
  begin insert into public.work_rules (name, start_time, end_time, effective_from) values ('r2', '10:00', '19:00', '2026-10-01'); out := out || E'FAIL|22|second active work rule\n';
  exception when others then out := out || E'PASS|22|second active work rule denied\n'; end;
  begin delete from public.profiles where id = emp; out := out || E'FAIL|23|delete profile\n';
  exception when others then out := out || E'PASS|23|delete profile denied\n'; end;
  select count(*) into n from public.punch_events;
  out := out || case when n = 2 then 'PASS' else 'FAIL' end || '|24|punch_events row count unchanged (' || n || E')\n';

  -- ── 게이트 3: 초대·챌린지·패스키 (0004) ──
  insert into public.invites (employee_id, token_hash, expires_at) values (emp, 'rls-hash-' || emp, now() + interval '1 hour');
  insert into public.webauthn_challenges (challenge, purpose, expires_at) values ('rls-ch-' || emp, 'login', now() + interval '5 minutes');
  -- 서버 함수로 등록: 1번째는 되고, 같은 직원의 2번째 활성 패스키는 거부 (4-11)
  begin perform public.register_passkey('rls-hash-' || emp, 'cred-1-' || emp, '\x01'::bytea, 0, null, 'singleDevice', false, 'test');
    out := out || E'PASS|25|first passkey registered via invite\n';
  exception when others then out := out || 'FAIL|25|first passkey: ' || sqlerrm || E'\n'; end;
  begin perform public.register_passkey('rls-hash-' || emp, 'cred-2-' || emp, '\x02'::bytea, 0, null, 'singleDevice', false, 'test');
    out := out || E'FAIL|26|used invite accepted again\n';
  exception when others then out := out || E'PASS|26|used invite rejected\n'; end;
  insert into public.invites (employee_id, token_hash, expires_at) values (emp, 'rls-hash2-' || emp, now() + interval '1 hour');
  begin perform public.register_passkey('rls-hash2-' || emp, 'cred-3-' || emp, '\x03'::bytea, 0, null, 'singleDevice', false, 'test');
    out := out || E'FAIL|27|second active passkey for one employee\n';
  exception when others then out := out || E'PASS|27|second active passkey denied\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin select count(*) into n from public.invites; out := out || E'FAIL|28|employee reads invites\n';
  exception when others then out := out || E'PASS|28|employee reads invites denied\n'; end;
  begin select count(*) into n from public.webauthn_challenges; out := out || E'FAIL|29|employee reads challenges\n';
  exception when others then out := out || E'PASS|29|employee reads challenges denied\n'; end;
  begin perform public.register_passkey('rls-hash2-' || emp, 'cred-4-' || emp, '\x04'::bytea, 0, null, 'singleDevice', false, 'test');
    out := out || E'FAIL|30|employee calls register_passkey directly\n';
  exception when others then out := out || E'PASS|30|employee calls register_passkey denied\n'; end;
  perform set_config('role', 'postgres', true);

  raise exception 'RLS_RESULTS_BEGIN%RLS_RESULTS_END', E'\n' || out;
end $$;
