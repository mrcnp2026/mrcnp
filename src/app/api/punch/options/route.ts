// 출퇴근 1단계: 1회용 챌린지 (목적 'punch' — 로그인용 챌린지로는 찍을 수 없다)
import { api } from '@/lib/api';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('punch.options', async () => passkeyService().beginAssertion('punch'));
