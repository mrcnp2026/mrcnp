// 폰 등록 저장소 — Supabase(service_role) 구현. 서버 전용.
import 'server-only';
import { OFFICE } from '@/config/office';
import { createPasskeyService, PasskeyError, type InviteInfo, type PasskeyStore, type StoredPasskey } from '@/lib/passkey';
import { createAdminClient } from '@/lib/supabase/admin';

// bytea는 PostgREST에서 '\x0a0b…' 16진 문자열로 오간다
const toHex = (b: Uint8Array) => '\\x' + Buffer.from(b).toString('hex');
const fromHex = (s: string) => new Uint8Array(Buffer.from(s.replace(/^\\x/, ''), 'hex'));

function fail(what: string, error: { message: string } | null): never {
  // 오류 원문에는 개인정보가 없지만, 화면에는 보내지 않고 서버 로그에만 남긴다 (R-5의 7)
  throw new Error(`${what}: ${error?.message ?? 'unknown'}`);
}

export function supabasePasskeyStore(): PasskeyStore {
  const db = createAdminClient();
  return {
    async findInvite(tokenHash) {
      const { data, error } = await db
        .from('invites')
        .select('id, employee_id, expires_at, used_at, revoked_at, issued_via, profiles!invites_employee_id_fkey(name, employee_no, active, locale)')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) fail('findInvite', error);
      if (!data) return null;
      const p = data.profiles as unknown as { name: string; employee_no: string | null; active: boolean; locale: string };
      return {
        inviteId: data.id,
        employeeId: data.employee_id,
        employeeNo: p.employee_no ?? '',
        name: p.name,
        locale: p.locale,
        employeeActive: p.active,
        expiresAt: new Date(data.expires_at),
        usedAt: data.used_at ? new Date(data.used_at) : null,
        revokedAt: data.revoked_at ? new Date(data.revoked_at) : null,
        issuedVia: data.issued_via,
      } satisfies InviteInfo;
    },

    async hasActivePasskey(employeeId) {
      const { count, error } = await db
        .from('user_passkeys')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .is('revoked_at', null);
      if (error) fail('hasActivePasskey', error);
      return (count ?? 0) > 0;
    },

    async isEmployeeActive(employeeId) {
      const { data, error } = await db.from('profiles').select('active').eq('id', employeeId).maybeSingle();
      if (error) fail('isEmployeeActive', error);
      return Boolean(data?.active);
    },

    async saveChallenge(c) {
      // 만료된 지 하루 넘은 챌린지는 이때 함께 지운다 — 예약 작업(cron)을 만들지 않는다 (3장)
      await db.from('webauthn_challenges').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());
      const { error } = await db.from('webauthn_challenges').insert({
        challenge: c.challenge,
        purpose: c.purpose,
        invite_id: c.inviteId,
        expires_at: c.expiresAt.toISOString(),
      });
      if (error) fail('saveChallenge', error);
    },

    async consumeChallenge(c) {
      // 조건부 update 한 문장 — 두 요청이 동시에 와도 한쪽만 1행을 받는다 (R-4)
      let q = db
        .from('webauthn_challenges')
        .update({ used_at: c.now.toISOString() })
        .eq('challenge', c.challenge)
        .eq('purpose', c.purpose)
        .is('used_at', null)
        .gt('expires_at', c.now.toISOString());
      q = c.inviteId ? q.eq('invite_id', c.inviteId) : q.is('invite_id', null);
      const { data, error } = await q.select('challenge');
      if (error) fail('consumeChallenge', error);
      return (data?.length ?? 0) === 1;
    },

    async registerPasskey(p) {
      const { data, error } = await db.rpc('register_passkey', {
        p_token_hash: p.tokenHash,
        p_credential_id: p.credentialId,
        p_public_key: toHex(p.publicKey),
        p_sign_count: p.signCount,
        p_transports: p.transports,
        p_device_type: p.deviceType,
        p_backed_up: p.backedUp,
        p_device_label: p.deviceLabel,
      });
      if (error) {
        if (error.message.includes('invite_invalid')) throw new PasskeyError('invite_invalid');
        if (error.message.includes('employee_inactive')) throw new PasskeyError('employee_inactive');
        if (error.code === '23505') throw new PasskeyError('already_registered'); // one_active_passkey
        fail('registerPasskey', error);
      }
      const row = (data as { passkey_id: string; employee_id: string }[])[0];
      return { passkeyId: row.passkey_id, employeeId: row.employee_id };
    },

    async findPasskey(credentialId) {
      const { data, error } = await db
        .from('user_passkeys')
        .select('id, employee_id, credential_id, public_key, sign_count, transports, revoked_at')
        .eq('credential_id', credentialId)
        .maybeSingle();
      if (error) fail('findPasskey', error);
      if (!data) return null;
      return {
        id: data.id,
        employeeId: data.employee_id,
        credentialId: data.credential_id,
        publicKey: fromHex(data.public_key),
        signCount: Number(data.sign_count),
        transports: data.transports,
        revokedAt: data.revoked_at ? new Date(data.revoked_at) : null,
      } satisfies StoredPasskey;
    },

    async touchPasskey(id, signCount, now) {
      const { error } = await db
        .from('user_passkeys')
        .update({ sign_count: signCount, last_used_at: now.toISOString() })
        .eq('id', id);
      if (error) fail('touchPasskey', error);
    },
  };
}

export function passkeyService() {
  return createPasskeyService(supabasePasskeyStore(), {
    rpID: OFFICE.rpID,
    rpName: OFFICE.rpName,
    origin: OFFICE.appOrigin,
    challengeTtlMin: OFFICE.challengeTtlMin,
  });
}
