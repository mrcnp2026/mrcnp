// 검사용 메모리 저장소 — passkey-store.ts(Supabase)와 같은 규칙을 흉내 낸다.
// DB 쪽 규칙(활성 1개 유일 인덱스, 초대 1회 사용, 비상 초대 교체)은 tests/rls-regression.sql이 실제 DB에서 따로 검사한다.
import type { ChallengePurpose, InviteInfo, PasskeyStore, StoredPasskey } from '@/lib/passkey';
import { PasskeyError } from '@/lib/passkey';

type Challenge = { challenge: string; purpose: ChallengePurpose; inviteId: string | null; expiresAt: Date; usedAt: Date | null };

export class MemoryPasskeyStore implements PasskeyStore {
  invites = new Map<string, InviteInfo>(); // key: tokenHash
  passkeys: StoredPasskey[] = [];
  challenges = new Map<string, Challenge>();
  activeEmployees = new Set<string>();
  private seq = 0;

  async findInvite(tokenHash: string) {
    return this.invites.get(tokenHash) ?? null;
  }
  async hasActivePasskey(employeeId: string) {
    return this.passkeys.some((p) => p.employeeId === employeeId && !p.revokedAt);
  }
  async isEmployeeActive(employeeId: string) {
    return this.activeEmployees.has(employeeId);
  }
  async saveChallenge(c: { challenge: string; purpose: ChallengePurpose; inviteId: string | null; expiresAt: Date }) {
    this.challenges.set(c.challenge, { ...c, usedAt: null });
  }
  async consumeChallenge(c: { challenge: string; purpose: ChallengePurpose; inviteId: string | null; now: Date }) {
    const row = this.challenges.get(c.challenge);
    if (!row || row.usedAt || row.expiresAt <= c.now || row.purpose !== c.purpose || row.inviteId !== c.inviteId) return false;
    row.usedAt = c.now;
    return true;
  }
  async registerPasskey(p: Parameters<PasskeyStore['registerPasskey']>[0]) {
    const inv = this.invites.get(p.tokenHash);
    if (!inv || inv.usedAt) throw new PasskeyError('invite_invalid');
    if (inv.issuedVia === 'emergency') {
      for (const k of this.passkeys) if (k.employeeId === inv.employeeId && !k.revokedAt) k.revokedAt = new Date();
    }
    if (await this.hasActivePasskey(inv.employeeId)) throw new PasskeyError('already_registered'); // one_active_passkey
    const row: StoredPasskey = {
      id: `pk${++this.seq}`,
      employeeId: inv.employeeId,
      credentialId: p.credentialId,
      publicKey: p.publicKey,
      signCount: p.signCount,
      transports: p.transports,
      revokedAt: null,
    };
    this.passkeys.push(row);
    inv.usedAt = new Date();
    return { passkeyId: row.id, employeeId: inv.employeeId };
  }
  async findPasskey(credentialId: string) {
    return this.passkeys.find((p) => p.credentialId === credentialId) ?? null;
  }
  async touchPasskey(id: string, signCount: number) {
    const p = this.passkeys.find((x) => x.id === id);
    if (p) p.signCount = signCount;
  }
}
