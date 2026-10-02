// 폰으로 로그인 1단계: 1회용 챌린지. 사번을 묻지 않는다 (폰에 저장된 패스키가 누구인지 알려 준다)
import { api } from '@/lib/api';
import { passkeyService } from '@/lib/passkey-store';

export const POST = api('passkey.login.options', async () => passkeyService().beginAssertion('login'));
