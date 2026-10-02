// 검사용 "가짜 폰" — 실제 폰이 만드는 것과 같은 형식의 패스키 응답을 만든다 (P-256 키, 'none' 증명).
// 서버 검증 코드(@simplewebauthn/server)를 그대로 통과해야 하므로, 이것으로 1회용 챌린지·해제·sign_count 규칙을 실측한다.
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;
  signCount: number;

  constructor(
    private rpID: string,
    private origin: string,
    opts: { signCount?: number; userVerified?: boolean } = {},
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    this.x = Buffer.from(jwk.x!, 'base64url');
    this.y = Buffer.from(jwk.y!, 'base64url');
    this.signCount = opts.signCount ?? 0;
    this.userVerified = opts.userVerified ?? true;
  }
  userVerified: boolean;

  get id() {
    return b64u(this.credentialId);
  }

  private flags(attested: boolean) {
    // UP=0x01, UV=0x04, AT=0x40
    return (1 | (this.userVerified ? 4 : 0) | (attested ? 0x40 : 0)) & 0xff;
  }

  private counter() {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(this.signCount);
    return b;
  }

  register(challenge: string, origin = this.origin) {
    const cose = new Map<number, number | Uint8Array>([
      [1, 2], // kty EC2
      [3, -7], // alg ES256
      [-1, 1], // crv P-256
      [-2, new Uint8Array(this.x)],
      [-3, new Uint8Array(this.y)],
    ]);
    const credLen = Buffer.alloc(2);
    credLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpID),
      Buffer.from([this.flags(true)]),
      this.counter(),
      Buffer.alloc(16), // aaguid
      credLen,
      this.credentialId,
      Buffer.from(isoCBOR.encode(cose)),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authData)],
      ]) as never,
    );
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal' as const],
      },
      clientExtensionResults: {},
    };
  }

  assert(challenge: string, origin = this.origin) {
    const authData = Buffer.concat([sha256(this.rpID), Buffer.from([this.flags(false)]), this.counter()]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
      },
      clientExtensionResults: {},
    };
  }
}
