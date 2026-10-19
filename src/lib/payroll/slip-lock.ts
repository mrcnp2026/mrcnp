// 메일로 보내는 급여명세서 PDF 잠그기 (개발-48, 2026-10-19 의뢰인: 비밀번호 = 생년월일 6자리). AES-256.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { PDFDocument } from '@cantoo/pdf-lib';

/** 생년월일(YYYY-MM-DD) → PDF 비밀번호 YYMMDD */
export const birthPassword = (birth: string | null | undefined): string | null => (typeof birth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? `${birth.slice(2, 4)}${birth.slice(5, 7)}${birth.slice(8, 10)}` : null);

/** 명세서 PDF를 비밀번호로 잠근다 — 열 때 비밀번호, 고치기 · 복사는 막고 인쇄는 허용 */
export async function lockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  doc.encrypt({ userPassword: password, ownerPassword: randomBytes(24).toString('hex'), permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false } });
  return doc.save({ useObjectStreams: false });
}
