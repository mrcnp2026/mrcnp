// 공식자료 수집기 — 출처 등록부와 가져오기 (PRD v1.3 6.2 · 28장). 서버에서만 돈다.
//   · 등록한 공식기관 주소만 연다(https · 허용 도메인 · 리디렉션도 허용 도메인만). 인증서 오류 · 차단은 우회하지 않고 그 출처를 실패로 남긴다.
//   · 받은 원문의 해시 · 주소 · 크기를 근거로 남긴다. 값은 parse.ts의 순수 함수가 뽑는다.
//   · 한 출처가 실패해도 다른 출처는 계속한다. 실패한 출처의 지금 쓰는 값은 건드리지 않는다.
import 'server-only';
import { createHash } from 'node:crypto';
import type { Candidate } from '../reference';
import { findAccidentNotice, findHwpxLink, ParseError, parseAccident, parseEmployment, parseHealth, parseHealthLimits, parseMaternity, parseMinimumWage, parsePension, parsePensionLimits, parseTaxAmendment, parseTaxTable, pageText } from './parse';

export const PARSER_VERSION = 'app-1.0';
const ALLOWED = new Set(['edi.nhis.or.kr', 'www.nhis.or.kr', 'www.nps.or.kr', 'www.moel.go.kr', '1350.moel.go.kr', 'www.data.go.kr', 'www.law.go.kr', 'edrm.ei.go.kr']);
const MAX_BYTES = 20 * 1024 * 1024;
const UA = 'PayrollSourceCollector/1.0 (public documents; manual review required)';

export type Evidence = { url: string; status: number; bytes: number; sha256: string; contentType: string };
export class FetchError extends Error {}

function check(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED.has(u.hostname) || u.username || u.password || (u.port && u.port !== '443')) throw new FetchError('url_not_allowed');
  return u;
}

/** 한 출처의 가져오기 묶음 — 받은 것마다 근거를 쌓는다 */
export class Session {
  evidence: Evidence[] = [];
  async fetch(url: string, form?: Record<string, string>): Promise<{ bytes: Uint8Array; text: string; url: string }> {
    let target = check(url).toString();
    for (let attempt = 0; ; attempt++) {
      try {
        let res: Response | null = null;
        // 리디렉션은 직접 따라가며 주소마다 허용 도메인인지 다시 본다
        for (let hop = 0; hop < 5; hop++) {
          res = await fetch(target, { method: form && hop === 0 ? 'POST' : 'GET', body: form && hop === 0 ? new URLSearchParams(form) : undefined, headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'manual', signal: AbortSignal.timeout(25_000), cache: 'no-store' });
          if (res.status < 300 || res.status >= 400) break;
          const loc = res.headers.get('location');
          if (!loc) throw new FetchError('redirect_without_location');
          target = check(new URL(loc, target).toString()).toString();
        }
        if (!res || res.status >= 300) {
          if (res && [502, 503, 504].includes(res.status) && attempt === 0) continue;
          throw new FetchError(`http_${res?.status ?? 0}`);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength > MAX_BYTES) throw new FetchError('too_large');
        const type = res.headers.get('content-type') ?? '';
        const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() ?? 'utf-8';
        let text = '';
        try {
          text = new TextDecoder(charset === 'ks_c_5601-1987' ? 'euc-kr' : charset, { fatal: false }).decode(buf);
        } catch {
          text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        }
        this.evidence.push({ url: target, status: res.status, bytes: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex'), contentType: type });
        return { bytes: buf, text, url: target };
      } catch (e) {
        // 시간 초과만 한 번 더 해 본다. 인증서 · 차단 · 형식 오류는 다시 하지 않는다
        if (attempt === 0 && e instanceof Error && e.name === 'TimeoutError') continue;
        throw e instanceof FetchError ? e : new FetchError(e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : `network:${(e.cause as { code?: string } | undefined)?.code ?? e.name}`) : 'network');
      }
    }
  }
}

type Found = Omit<Candidate, 'sourceUrl' | 'sourceHash' | 'parserVersion'>[];
export type Source = { id: string; authority: string; url: string; run: (s: Session) => Promise<Found> };

/**
 * 출처 등록부. 주소는 기관이 해마다 새 글을 올리면 바뀔 수 있다(건강보험 안내 · 국민연금 공지 · 최저임금 보도자료) —
 * 그때는 값이 그대로 다시 읽혀 「변경 없음」이 되거나 글 모양이 달라 실패로 남는다. 실패 · 오래된 자료는 화면의 수집 결과에 보인다.
 * 산재보험은 고시 목록을 앞쪽부터 넘겨 가며 가장 최근 연도의 고시를 찾는다(시험 프로그램은 14쪽 고정이었다).
 */
export const SOURCES: Source[] = [
  { id: 'health', authority: '국민건강보험공단', url: 'https://edi.nhis.or.kr/portal/images/popup/20251204_pop01longdesc.html', run: async (s) => parseHealth((await s.fetch('https://edi.nhis.or.kr/portal/images/popup/20251204_pop01longdesc.html')).text) },
  { id: 'health_limits', authority: '보건복지부', url: 'https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=39', run: async (s) => parseHealthLimits((await s.fetch('https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=39')).text) },
  { id: 'pension', authority: '국민연금공단', url: 'https://www.nps.or.kr/eng/ntnlpnsplan/cntb/getOHAI0013M0.do', run: async (s) => parsePension((await s.fetch('https://www.nps.or.kr/eng/ntnlpnsplan/cntb/getOHAI0013M0.do')).text) },
  {
    id: 'pension_limits',
    authority: '국민연금공단',
    url: 'https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?hmpgBbsCd=BS20240137&hmpgCd=01&menuId=MN24000897&pageIndex=3&pstId=ZZ202600000000000147&searchGbu=%EC%A0%84%EC%B2%B4&sortSe=FR',
    run: async (s) => parsePensionLimits((await s.fetch('https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?hmpgBbsCd=BS20240137&hmpgCd=01&menuId=MN24000897&pageIndex=3&pstId=ZZ202600000000000147&searchGbu=%EC%A0%84%EC%B2%B4&sortSe=FR')).text),
  },
  { id: 'employment', authority: '고용노동부', url: 'https://edrm.ei.go.kr/ei/eim/eg/ei/eiEminsr/retrieveEi0301Info.do', run: async (s) => parseEmployment((await s.fetch('https://edrm.ei.go.kr/ei/eim/eg/ei/eiEminsr/retrieveEi0301Info.do')).text) },
  {
    id: 'accident',
    authority: '고용노동부',
    url: 'https://www.moel.go.kr/info/lawinfo/instruction/list.do',
    run: async (s) => {
      // 고시 목록을 1쪽부터 — 가장 최근 연도의 고시가 나올 때까지(최대 25쪽). 못 찾으면 찾지 못했다고 남긴다
      let best: { year: number; href: string; from: string } | null = null;
      for (let page = 1; page <= 25 && !best; page++) {
        const list = await s.fetch(`https://www.moel.go.kr/info/lawinfo/instruction/list.do?pageIndex=${page}`);
        const hit = findAccidentNotice(list.text);
        if (hit) best = { ...hit, from: list.url };
      }
      if (!best) throw new ParseError('accident:notice_not_found');
      const detail = await s.fetch(new URL(best.href, best.from).toString());
      const file = await s.fetch(new URL(findHwpxLink(detail.text), detail.url).toString());
      return parseAccident(file.bytes, best.year);
    },
  },
  {
    id: 'tax',
    authority: '국세청',
    url: 'https://www.data.go.kr/data/15050747/fileData.do',
    run: async (s) => {
      // 공공데이터포털의 국세청 제공 파일 — 화면이 쓰는 내려받기 절차를 그대로 따른다. 절차가 바뀌면 멈춘다
      const page = await s.fetch('https://www.data.go.kr/data/15050747/fileData.do');
      const pk = /const pk\s*=\s*"([^"]+)"/.exec(page.text)?.[1];
      const detailPk = /const detailPk\s*=\s*"([^"]+)"/.exec(page.text)?.[1];
      if (!pk || !detailPk) throw new ParseError('tax:portal_page');
      const detail = await s.fetch('https://www.data.go.kr/tcs/dss/selectDpkDetailInfo.do', { publicDataDetailPk: detailPk });
      const a = /fn_fileDataDown\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/.exec(detail.text);
      if (!a || a[1] !== pk || a[2] !== detailPk || a[5] !== 'hwpx') throw new ParseError('tax:attachment_meta');
      const meta = await s.fetch('https://www.data.go.kr/tcs/dss/selectFileDataDownload.do', { publicDataPk: pk, publicDataDetailPk: detailPk, atchFileId: a[3], fileDetailSn: a[4], publicDataTyCode: 'PR0051' });
      let m: { status?: boolean; atchFileId?: string; fileDetailSn?: string | number };
      try {
        m = JSON.parse(meta.text);
      } catch {
        throw new ParseError('tax:download_meta');
      }
      if (m.status !== true || !m.atchFileId) throw new ParseError('tax:download_permission');
      const file = await s.fetch(`https://www.data.go.kr/cmm/cmm/fileDownload.do?${new URLSearchParams({ atchFileId: m.atchFileId, fileDetailSn: String(m.fileDetailSn ?? '') })}`);
      return parseTaxTable(file.bytes, /국세청_근로소득 간이세액표_(\d{8})/.exec(pageText(page.text))?.[1] ?? null);
    },
  },
  { id: 'tax_amendment', authority: '국가법령정보센터', url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?lsId=003956', run: async (s) => parseTaxAmendment((await s.fetch('https://www.law.go.kr/LSW/lsRvsDocListP.do?lsId=003956')).text) },
  { id: 'minimum_wage', authority: '고용노동부', url: 'https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=18144', run: async (s) => parseMinimumWage((await s.fetch('https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=18144')).text) },
  { id: 'maternity', authority: '고용노동부', url: 'https://1350.moel.go.kr/rtmview.do?id=1000316539', run: async (s) => parseMaternity((await s.fetch('https://1350.moel.go.kr/rtmview.do?id=1000316539')).text) },
];

export type SourceResult = { source: string; authority: string; ok: boolean; error?: string; requests: number; found: number; staged?: number; unchanged?: number; ms: number };

/** 출처 하나 실행 — 실패는 던지지 않고 결과로 돌려준다 */
export async function collectOne(src: Source): Promise<{ result: SourceResult; candidates: Candidate[] }> {
  const s = new Session();
  const t0 = Date.now();
  try {
    const found = await src.run(s);
    const last = s.evidence.at(-1);
    return {
      result: { source: src.id, authority: src.authority, ok: true, requests: s.evidence.length, found: found.length, ms: Date.now() - t0 },
      candidates: found.map((c) => ({ ...c, sourceUrl: last?.url ?? src.url, sourceHash: last?.sha256 ?? null, parserVersion: PARSER_VERSION })),
    };
  } catch (e) {
    const error = e instanceof ParseError || e instanceof FetchError ? e.message : 'unexpected';
    return { result: { source: src.id, authority: src.authority, ok: false, error: error.slice(0, 80), requests: s.evidence.length, found: 0, ms: Date.now() - t0 }, candidates: [] };
  }
}
