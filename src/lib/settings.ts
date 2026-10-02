// 설정 조회·저장 — ② 7-1. ★★ app_settings를 읽는 곳은 이 파일뿐이다 (검사: tests/settings.test.ts).
// 읽기: "그 날짜 이전(포함)에 시작한 것 중 가장 최근" — 최신 행을 그냥 읽으면 과거 판정이 바뀐다 (② 4-1, B-1).
// 쓰기: 기존 행을 고치지 않고 새 행을 넣는다 (DB 트리거가 update를 막는다). 변경 기록은 DB 트리거가 남긴다 (4-3).
import 'server-only';
import { cache } from 'react';
import { SETTINGS, type SettingKey, type SettingValue } from '@/config/settings-catalog';
import { pickAt } from '@/lib/settings-pick';
import { createAdminClient } from '@/lib/supabase/admin';

type Row = { key: string; value: unknown; effective_from: string };

/** 모든 설정 이력 — 한 요청에 한 번만 읽는다 (행이 많지 않다: 키 20개 × 바꾼 횟수) */
const loadAll = cache(async (): Promise<Row[]> => {
  const { data, error } = await createAdminClient().from('app_settings').select('key, value, effective_from').order('effective_from', { ascending: false });
  if (error) throw new Error(`settings.load: ${error.code}`);
  return (data ?? []) as Row[];
});

/** 그 날짜에 유효했던 값. 이력이 없으면 기본값 */
export async function getSettingAt<K extends SettingKey>(key: K, onDate: string): Promise<SettingValue<K>> {
  return pickAt(await loadAll(), key, onDate, SETTINGS[key].default) as SettingValue<K>;
}

/** 여러 설정을 한 번에 (같은 날짜) */
export async function settingsAt(onDate: string): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const rows = await loadAll();
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(SETTINGS) as SettingKey[]) out[k] = pickAt(rows, k, onDate, SETTINGS[k].default);
  return out as { [K in SettingKey]: SettingValue<K> };
}

/** 키 하나의 이력 (설정 화면에서 "언제부터 무엇으로"를 보여 줄 때) */
export async function settingHistory(key: SettingKey): Promise<{ value: unknown; effectiveFrom: string }[]> {
  return (await loadAll()).filter((r) => r.key === key).map((r) => ({ value: r.value, effectiveFrom: r.effective_from }));
}

/** 새 행으로 저장. 같은 날짜에 이미 예약된 값이 있으면 오류 (고치지 않는다 — 다른 날짜로 다시 넣는다) */
export async function putSetting(key: SettingKey, value: unknown, effectiveFrom: string, actorId: string): Promise<'ok' | 'duplicate'> {
  const { error } = await createAdminClient().from('app_settings').insert({ key, value, effective_from: effectiveFrom, updated_by: actorId });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw new Error(`settings.put: ${error.code}`);
  return 'ok';
}
