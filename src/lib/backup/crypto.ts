// 백업 파일 암호화 · 풀기 (scripts/backup.mts, scripts/backup-open.mts에서 쓴다)
// 파일 모양: 표시 6바이트(ATTBK1) · 소금 16 · 시작값 12 · 암호문 · 확인값 16 (AES-256-GCM)
// 비밀번호는 BACKUP_PASSWORD — 잃어버리면 백업 파일을 열 수 없다.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('ATTBK1');
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEAD = MAGIC.length + SALT + IV;

function keyOf(password: string, salt: Buffer): Buffer {
  if (password.length < 12) throw new Error('backup_password_too_short');
  return scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export async function encryptFile(src: string, dst: string, password: string): Promise<void> {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', keyOf(password, salt), iv);
  const out = createWriteStream(dst);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((ok, bad) => out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? bad(e) : ok())));
}

export async function decryptFile(src: string, dst: string, password: string): Promise<void> {
  const size = statSync(src).size;
  if (size < HEAD + TAG) throw new Error('backup_file_too_small');
  const fd = openSync(src, 'r');
  const head = Buffer.alloc(HEAD);
  const tag = Buffer.alloc(TAG);
  try {
    readSync(fd, head, 0, HEAD, 0);
    readSync(fd, tag, 0, TAG, size - TAG);
  } finally {
    closeSync(fd);
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not_a_backup_file');
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT);
  const iv = head.subarray(MAGIC.length + SALT, HEAD);
  const decipher = createDecipheriv('aes-256-gcm', keyOf(password, salt), iv);
  decipher.setAuthTag(tag);
  // 비밀번호가 틀리거나 파일이 상했으면 마지막에 오류가 난다
  await pipeline(createReadStream(src, { start: HEAD, end: size - TAG - 1 }), decipher, createWriteStream(dst));
}
