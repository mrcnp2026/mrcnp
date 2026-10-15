// 격리 DB 전용. 운영 연결값으로 대체하지 않는다. 테스트 자료는 폐기 가능한 DB에만 남긴다.
// ATOMIC_TEST_DB_URL=... ATOMIC_TEST_DB_ISOLATED=yes tsx scripts/verify-atomic-db.mts [--apply-drafts]
import { config } from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
config({ path: '.env.local', quiet: true });
const uri=process.env.ATOMIC_TEST_DB_URL;
if (!uri || process.env.ATOMIC_TEST_DB_ISOLATED!=='yes') throw new Error('isolated_test_database_required');
if (uri.includes('niipfcxsnaroduzjlyvc') || uri===process.env.SUPABASE_DB_URL) throw new Error('production_database_forbidden');
const client=()=>new pg.Client({connectionString:uri,connectionTimeoutMillis:5000,statement_timeout:15000});
const db=client();
const assert=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);console.log('PASS '+label);};
async function rejectCode(work:()=>Promise<unknown>,code:string,label:string){try{await work();throw new Error('unexpected_success');}catch(e){assert((e as {code?:string}).code===code,label);}}
try {
 await db.connect();
 if(process.argv.includes('--apply-drafts')) {
   await db.query('begin');
   try { for(const file of ['atomic_review_fixes.sql','attendance_integrity.sql','payroll_finalization_integrity.sql'])await db.query(await readFile(new URL('../supabase/drafts/'+file,import.meta.url),'utf8'));await db.query('commit'); }catch(e){await db.query('rollback');throw e;}
 }
 const functions=await db.query("select to_regprocedure('public.append_payroll_version_atomic(text,text,jsonb,date,text,integer,uuid)') is not null as ready");
 assert(functions.rows[0].ready,'required_functions_present');
 const actor=randomUUID(),other=randomUUID(),target=randomUUID(),tag=randomUUID().replaceAll('-','').slice(0,12);
 for(const [id,name,role,pay] of [[actor,'atomic actor','admin',true],[other,'atomic approver','admin',true],[target,'atomic target','employee',false]] as const){
   await db.query("insert into auth.users(id,email,aud,role) values($1,$2,'authenticated','authenticated')",[id,tag+'-'+id+'@test.invalid']);
   await db.query("insert into public.profiles(id,name,role,can_view_payroll,admin_level) values($1,$2,$3,$4,case when $3='admin' then 'general' end)",[id,name,role,pay]);
 }
 const code='ATOMIC_'+tag;
 const values={kind:'PAYMENT',ko_name:'atomic fixture',en_name:'atomic fixture',calc_kind:'FIXED',default_amount:100,fixed_allowance:true,tax_treatment:'TAXABLE',tax_exempt_limit:null,ordinary_wage:'EXCLUDED',sort:0};
 const append=(connection:pg.Client,version:number,date:string,payload=values)=>connection.query('select public.append_payroll_version_atomic($1,$2,$3,$4,$5,$6,$7) as row',['payroll_item_versions',code,payload,date,'atomic fixture',version,actor]);
 await append(db,0,'2099-01-01');
 await rejectCode(()=>append(db,1,'2099-02-01',{...values,ko_name:''}),'23514','failed_insert_rolls_back_previous_close');
 const unchanged=await db.query('select count(*)::int as n,bool_and(valid_to is null) as opened from public.payroll_item_versions where code=$1',[code]);
 assert(unchanged.rows[0].n===1&&unchanged.rows[0].opened,'old_version_stays_open');
 const a=client(),b=client();await Promise.all([a.connect(),b.connect()]);
 try{
   await a.query('begin');await append(a,1,'2099-02-01');
   let finished=false;const loser=append(b,1,'2099-03-01').then(()=>({code:'unexpected_success'}),(e:unknown)=>e).finally(()=>{finished=true;});
   await db.query('select pg_sleep(0.1)');assert(!finished,'same_identity_save_waits_for_transaction');
   await a.query('commit');const error=await loser;assert((error as {code?:string}).code==='P0001','stale_expected_version_rejected_after_commit');
 }finally{await a.query('rollback').catch(()=>{});await Promise.all([a.end(),b.end()]);}
 const request=await db.query("insert into public.role_change_requests(target_id,new_role,new_can_view_payroll,reason,requested_by) values($1,'manager',false,'atomic fixture',$2) returning id",[target,actor]);
 const requestId=request.rows[0].id;
 await db.query('update public.profiles set active=false,updated_by=$1 where id=$1',[actor]);
 await rejectCode(()=>db.query("select public.decide_staff_role_atomic($1,$2,'approved',$3)",[other,requestId,randomUUID()]),'P0001','inactive_requester_cannot_be_approved');
 const pending=await db.query('select r.status,p.role from public.role_change_requests r join public.profiles p on p.id=r.target_id where r.id=$1',[requestId]);
 assert(pending.rows[0].status==='pending'&&pending.rows[0].role==='employee','failed_approval_changes_neither_request_nor_profile');
 await db.query('update public.profiles set active=true,updated_by=$1 where id=$1',[actor]);
 await db.query("select public.decide_staff_role_atomic($1,$2,'approved',$3)",[other,requestId,randomUUID()]);
 const done=await db.query('select r.status,p.role from public.role_change_requests r join public.profiles p on p.id=r.target_id where r.id=$1',[requestId]);
 assert(done.rows[0].status==='approved'&&done.rows[0].role==='manager','approval_updates_request_and_profile_together');
 console.log('Isolated fixtures retained. Reset the disposable test database after inspection.');
}catch(e){console.error('FAIL '+String((e as {code?:string}).code??(e as Error).message).slice(0,100));process.exitCode=1;}finally{await db.end().catch(()=>{});}
