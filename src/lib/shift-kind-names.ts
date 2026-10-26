// 근무일정 유형의 「보이는 이름」 (2026-10-25 의뢰인) — 유형 여섯 개와 계산 방식은 고정이고, 화면에 보이는 이름만 회사에 맞게 바꾼다.
// 비워 두면 기본 이름(번역 파일 admin.shifts.kinds). 값은 app_settings의 한 줄(shift.kind_names)에 이력으로 쌓인다. 순수함수 — 읽고 쓰기는 lib/settings.ts.
export const RENAMABLE_KINDS = ['normal', 'deemed', 'outside', 'remote', 'holiday', 'extra'] as const;
export type RenamableKind = (typeof RENAMABLE_KINDS)[number];
export type KindNames = Partial<Record<RenamableKind, string>>;
export const KIND_NAME_MAX = 20;

/** 입력 검사 — 글자가 아니거나 20자를 넘으면 null(거절), 빈 칸은 기본 이름으로 돌린다는 뜻이라 뺀다, 모르는 유형은 무시 */
export function cleanKindNames(v: unknown): KindNames | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: KindNames = {};
  for (const k of RENAMABLE_KINDS) {
    const raw = (v as Record<string, unknown>)[k];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') return null;
    const s = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (s.length > KIND_NAME_MAX) return null;
    if (s) out[k] = s;
  }
  return out;
}

/** 번역 함수를 감싼다 — 바꾼 이름이 있으면 그것, 없으면 기본 이름 */
export function withKindNames(base: (k: never) => string, names: KindNames | undefined): (k: string) => string {
  return (k: string) => (names as Record<string, string> | undefined)?.[k] || (base as (k: string) => string)(k);
}
