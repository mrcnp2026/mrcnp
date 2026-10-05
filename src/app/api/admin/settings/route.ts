// 설정 바꾸기 (관리자): 근무시간 · 휴일 · 사무실 인터넷 주소. 지금까지는 DB·열쇠 파일을 직접 고쳐야 했다 (2026-10-05).
// - 근무시간은 고치지 않고 "언제부터 적용"되는 새 규칙을 넣는다 (② 4-1). 잘못 넣은 규칙은 숨긴다(지우지 않는다)
// - 휴일은 이번 달과 앞으로의 날짜만 넣고 뺄 수 있다 (지난 달 집계가 달라지지 않게)
// - 사무실 주소는 추가하고, 안 쓰는 것은 끈다 (지우지 않는다). 교체가 아니라 추가가 기본이다 (9-5)
// 누가 바꿨는지는 변경 기록에 남는다 (표에 *_by 칸이 없어 따로 한 줄 적는다).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { cleanLabel, normalizeCidr, validateHoliday, validateRule } from '@/lib/settings-rules';
import { auditStaffAction } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = api('admin.settings', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const db = createAdminClient();
  const today = toKstDate(new Date());
  const note = (table: string, targetId: string, event: string, detail?: Record<string, unknown>) =>
    auditStaffAction({ actorId: me.id, targetId, table, event, reason: event, detail: { ...detail, requestId: ctx.requestId } });

  switch (b.action) {
    case 'rule.add': {
      const v = validateRule(b, today);
      if (!v.ok) throw new ApiError(400, v.code);
      const r = v.value;
      const { data, error } = await db
        .from('work_rules')
        .insert({
          name: `rule ${r.effectiveFrom}`, start_time: r.startTime, end_time: r.endTime, late_grace_min: r.lateGraceMin,
          break_start: r.breakStart, break_end: r.breakEnd, workdays: r.workdays, weekly_rest_day: r.weeklyRestDay, effective_from: r.effectiveFrom,
        })
        .select('id')
        .single();
      if (error?.code === '23505') throw new ApiError(409, 'duplicate_rule');
      if (error) throw new Error(`settings.rule.add: ${error.code}`);
      await note('work_rules', data.id, 'rule.add', { effectiveFrom: r.effectiveFrom });
      return { id: data.id };
    }
    case 'rule.hide': {
      if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
      const { data: rows } = await db.from('work_rules').select('id, effective_from').eq('active', true);
      const target = (rows ?? []).find((x) => x.id === b.id);
      if (!target) throw new ApiError(404, 'not_found');
      // 이미 적용이 시작된 규칙을 숨기면 지난 날짜의 판정 근거가 사라진다 — 앞으로 적용될 규칙만 숨길 수 있다
      if (target.effective_from <= today) throw new ApiError(409, 'rule_in_use');
      const { error } = await db.from('work_rules').update({ active: false }).eq('id', b.id);
      if (error) throw new Error(`settings.rule.hide: ${error.code}`);
      await note('work_rules', b.id, 'rule.hide', { effectiveFrom: target.effective_from });
      return { ok: true };
    }
    case 'holiday.add': {
      const v = validateHoliday(b, today);
      if (!v.ok) throw new ApiError(400, v.code);
      const { error } = await db.from('holidays').insert({ the_date: v.value.date, label: v.value.label, kind: v.value.kind });
      if (error?.code === '23505') throw new ApiError(409, 'duplicate_holiday');
      if (error) throw new Error(`settings.holiday.add: ${error.code}`);
      await note('holidays', v.value.date, 'holiday.add', { label: v.value.label, kind: v.value.kind });
      return { ok: true };
    }
    case 'holiday.remove': {
      if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new ApiError(400, 'invalid_input');
      if (b.date < `${today.slice(0, 7)}-01`) throw new ApiError(400, 'past_date');
      const { data, error } = await db.from('holidays').delete().eq('the_date', b.date).select('the_date, label');
      if (error) throw new Error(`settings.holiday.remove: ${error.code}`);
      if (!data?.length) throw new ApiError(404, 'not_found');
      await note('holidays', b.date, 'holiday.remove', { label: data[0].label });
      return { ok: true };
    }
    case 'network.add': {
      const cidr = normalizeCidr(b.cidr);
      if (!cidr) throw new ApiError(400, 'invalid_cidr');
      const label = cleanLabel(b.label);
      const { data: same } = await db.from('office_networks').select('id, active').eq('cidr', cidr);
      if (same?.some((x) => x.active)) throw new ApiError(409, 'duplicate_network');
      // 꺼 둔 같은 주소가 있으면 새로 만들지 않고 다시 켠다
      if (same?.length) {
        const { error } = await db.from('office_networks').update({ active: true, label }).eq('id', same[0].id);
        if (error) throw new Error(`settings.network.reuse: ${error.code}`);
        await note('office_networks', same[0].id, 'network.on', { cidr });
        return { id: same[0].id, cidr };
      }
      const { data, error } = await db.from('office_networks').insert({ cidr, label }).select('id').single();
      if (error) throw new Error(`settings.network.add: ${error.code}`);
      await note('office_networks', data.id, 'network.add', { cidr });
      return { id: data.id, cidr };
    }
    case 'network.toggle': {
      if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
      const { data, error } = await db.from('office_networks').update({ active: b.active }).eq('id', b.id).select('id, cidr');
      if (error) throw new Error(`settings.network.toggle: ${error.code}`);
      if (!data?.length) throw new ApiError(404, 'not_found');
      await note('office_networks', b.id, b.active ? 'network.on' : 'network.off', { cidr: String(data[0].cidr) });
      return { ok: true };
    }
    default:
      throw new ApiError(400, 'invalid_input');
  }
});
