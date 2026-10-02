'use client';
// 지금 시각 — 사무실 시간대로 (next-intl timeZone이 OFFICE.timezone으로 고정, 4-5). 표시만 하고 기록에는 쓰지 않는다:
// 출퇴근 시각은 항상 서버가 정한다 (7-4 요점 4).
import { useFormatter } from 'next-intl';
import { useEffect, useState } from 'react';

export function LiveClock({ initial }: { initial: string }) {
  const f = useFormatter();
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="num" suppressHydrationWarning>
      {f.dateTime(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
      <span className="text-xl text-faint" suppressHydrationWarning>
        :{f.dateTime(now, { second: '2-digit' }).padStart(2, '0')}
      </span>
    </span>
  );
}
