// 백업 이름 · 보관 규칙 (2026-10-25): 최근 14일은 전부, 달마다 첫 백업(12개월), 해마다 첫 백업(영구)
import { describe, expect, it } from 'vitest';
import { keepRule, nameFor, parseName } from '@/lib/backup/store';

describe('백업 이름', () => {
  it('한국 시간으로 초까지 만들고, 초가 없는 옛 이름도 읽는다', () => {
    expect(nameFor(new Date('2026-10-25T14:41:39Z'), 'prod')).toBe('prod/db-20261025-234139.jsonl.gz.enc');
    expect(parseName('prod/db-20261025-234139.jsonl.gz.enc')).toEqual({ date: '2026-10-25', time: '23:41', stamp: '20261025-234139' });
    expect(parseName('prod/db-20261025-2335.jsonl.gz.enc')?.date).toBe('2026-10-25');
    expect(parseName('prod/other.txt')).toBeNull();
  });
});

describe('보관 규칙', () => {
  const mk = (dates: string[]) => dates.map((d, i) => ({ name: `prod/db-${d.replace(/-/g, '')}-02000${i % 10}.jsonl.gz.enc`, date: d }));
  it('최근 14일은 모두 두고, 오래된 것은 달 · 해의 첫 백업만 남긴다', () => {
    const list = mk(['2025-01-05', '2025-01-20', '2026-09-03', '2026-09-20', '2026-10-01', '2026-10-24', '2026-10-25']);
    const r = keepRule(list, '2026-10-25');
    const flag = (d: string) => r.get(list.find((x) => x.date === d)!.name)!;
    expect(flag('2026-10-25').recent).toBe(true);
    expect(flag('2026-10-24').recent).toBe(true);
    expect(flag('2026-10-01').recent).toBe(false); // 14일보다 오래됐지만 그달의 첫 백업
    expect(flag('2026-10-01').monthly).toBe(true);
    expect(flag('2026-09-03').monthly).toBe(true);
    expect(flag('2026-09-20')).toEqual({ recent: false, monthly: false, yearly: false }); // 지워도 되는 것
    expect(flag('2025-01-05').yearly).toBe(true);
    expect(flag('2025-01-20')).toEqual({ recent: false, monthly: false, yearly: false });
  });
});
