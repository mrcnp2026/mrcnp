// subset-font에는 타입 선언이 없다 — 쓰는 모양만 적어 둔다 (src/lib/payroll/slip-pdf.ts)
declare module 'subset-font' {
  export default function subsetFont(font: Buffer | Uint8Array, text: string, options?: { targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2'; preserveNameIds?: number[] }): Promise<Buffer>;
}
