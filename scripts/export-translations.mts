// 번역 검수용 표 내보내기 (부록 R-15의 1) — 검수자가 코드나 JSON을 열지 않고 이 표 하나로 작업한다.
//   npm run i18n:export            → outputs가 아니라 이 PC의 지정 경로로 저장 (기본: ../checks/번역-검수.csv)
// 열: key, 한국어, 영어, 베트남어, 태국어, 쓰이는 화면(키의 앞부분), 변수({name} 등)
// 엑셀에서 한글·태국어가 깨지지 않게 UTF-8 BOM을 붙인다.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'messages');
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'));
const [ko, en, vi, th] = ['ko', 'en', 'vi', 'th'].map(load);

type Tree = { [k: string]: string | Tree };
function flat(o: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'object') Object.assign(out, flat(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
const F = { ko: flat(ko), en: flat(en), vi: flat(vi), th: flat(th) };
const csv = (s: string | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`;

const rows = [['key', '한국어', '영어', '베트남어', '태국어', '쓰이는 화면', '변수'].map(csv).join(',')];
for (const key of Object.keys(F.en)) {
  const vars = [...new Set(F.en[key].match(/\{\w+\}/g) ?? [])].join(' ');
  rows.push([key, F.ko[key], F.en[key], F.vi[key], F.th[key], key.split('.').slice(0, -1).join('.'), vars].map(csv).join(','));
}
const out = process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'checks', '번역-검수.csv');
fs.writeFileSync(out, '﻿' + rows.join('\r\n') + '\r\n', 'utf8');
console.log(`${rows.length - 1}개 문구 → ${out}`);
