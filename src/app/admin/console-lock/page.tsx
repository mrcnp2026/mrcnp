// 통합설정 잠금 화면 — 미들웨어가 열림 표가 없는 통합설정 주소를 여기로 돌린다(주소는 그대로). 숫자를 맞히면 같은 주소를 다시 그려 원래 화면이 열린다 (2026-10-14 결정 사항 개발-29)
import { redirect } from 'next/navigation';
import { ConsoleGate } from '@/components/ConsoleGate';
import { getMe } from '@/lib/auth';
import { pinState } from '@/lib/console-pin';

export default async function ConsoleLockPage() {
  const me = await getMe();
  if (!me || me.role !== 'admin') redirect('/admin');
  const st = await pinState(me.id);
  return <ConsoleGate mode={st.set ? 'open' : 'set'} lockedUntil={st.lockedUntil} />;
}
