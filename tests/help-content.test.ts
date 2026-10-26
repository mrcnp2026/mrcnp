// 도움말 내용 점검 (2026-10-26) — 깨진 링크 · 빈 칸 · 겹치는 번호가 없고, 글에 적은 [메뉴 · 단추] 이름이 앱에 실제로 있는지.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTICLES, FAQS, GROUPS, visibleFor, type Block } from '@/lib/help/content';
import { articleText, pieces, searchHelp } from '@/lib/help/search';

const KO = JSON.parse(readFileSync(path.join(process.cwd(), 'messages', 'ko.json'), 'utf8')) as Record<string, unknown>;
const texts = (b: Block): string[] => (b.t === 'steps' || b.t === 'list' ? b.items : [b.text]);

describe('도움말 내용', () => {
  it('글 · 질문 번호가 겹치지 않고, 묶음 · 관련 글 · 질문의 글 연결이 모두 실제로 있다', () => {
    const ids = ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(FAQS.map((f) => f.id)).size).toBe(FAQS.length);
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const a of ARTICLES) {
      expect(groups.has(a.group), `${a.id}의 묶음`).toBe(true);
      expect(GROUPS.find((g) => g.id === a.group)!.audience, `${a.id}는 묶음과 같은 대상`).toBe(a.audience);
      for (const r of a.related ?? []) expect(ids.includes(r), `${a.id}의 관련 글 ${r}`).toBe(true);
    }
    for (const f of FAQS) if (f.article) expect(ids.includes(f.article), `${f.id}의 글 ${f.article}`).toBe(true);
  });

  it('빈 제목 · 빈 문장 · 빈 단계가 없고, 한 글 안의 소제목 번호가 겹치지 않는다', () => {
    for (const a of ARTICLES) {
      expect(a.title.trim() && a.summary.trim() && a.updated, a.id).toBeTruthy();
      expect(a.sections.length, a.id).toBeGreaterThan(0);
      const sid = a.sections.map((s) => s.id);
      expect(new Set(sid).size, `${a.id} 소제목 번호`).toBe(sid.length);
      for (const s of a.sections) {
        expect(s.title.trim() && s.blocks.length, `${a.id}/${s.id}`).toBeTruthy();
        for (const b of s.blocks) for (const x of texts(b)) expect(x.trim().length, `${a.id}/${s.id}`).toBeGreaterThan(3);
      }
    }
    for (const f of FAQS) expect(f.q.trim() && f.a.trim(), f.id).toBeTruthy();
  });

  it('관리자 글은 직원에게 보이지 않고, 관리자는 둘 다 본다', () => {
    const staff = visibleFor(false), admin = visibleFor(true);
    expect(staff.articles.every((a) => a.audience === 'staff') && staff.faqs.every((f) => f.audience === 'staff')).toBe(true);
    expect(staff.groups.every((g) => g.audience === 'staff')).toBe(true);
    expect(admin.articles.length).toBe(ARTICLES.length);
  });

  it('글에 [대괄호]로 적은 이름은 앱 화면의 실제 이름이다 — 메뉴 · 단추 이름이 바뀌면 여기서 걸린다', () => {
    // 앱 번역 파일의 모든 문구(여러 곳에 있는 이름도 한 번 이상 나오면 인정)
    const all: string[] = [];
    const walk = (o: unknown) => { if (typeof o === 'string') all.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    walk(KO);
    // 화면에 한 낱말이 아니라 「동작」으로만 있는 이름 — 번역 파일에는 다른 꼴로 있다(예: 「고른 {n}명 마감」)
    const SHAPES = new Set(['고른 N명 마감', '공개하지 않은 N명에게 공개']);
    // 이 문서가 설명하는 다른 곳의 이름(번역 파일 밖에서 만든 것)
    const ALIEN = new Set(['급여 점검']);
    const missing = new Set<string>();
    for (const a of ARTICLES) for (const s of a.sections) for (const b of s.blocks) for (const x of texts(b)) for (const p of pieces(x)) {
      if (!p.bold) continue;
      const name = p.text.slice(1, -1);
      if (SHAPES.has(name) || ALIEN.has(name)) continue;
      if (!all.some((v) => v === name || v.includes(name))) missing.add(`${a.id}: ${name}`);
    }
    for (const f of FAQS) for (const p of pieces(f.a)) if (p.bold) { const name = p.text.slice(1, -1); if (!SHAPES.has(name) && !ALIEN.has(name) && !all.some((v) => v === name || v.includes(name))) missing.add(`${f.id}: ${name}`); }
    expect([...missing]).toEqual([]);
  });

  it('검색: 낱말 일부 · 초성으로도 찾고, 직원은 관리자 글을 찾지 못한다', () => {
    const staff = visibleFor(false), admin = visibleFor(true);
    expect(searchHelp('출근', staff.articles, staff.faqs).articles.map((h) => h.article.id)).toContain('staff-punch');
    expect(searchHelp('ㅎㄱ', staff.articles, staff.faqs).articles.length + searchHelp('ㅎㄱ', staff.articles, staff.faqs).faqs.length).toBeGreaterThan(0);
    expect(searchHelp('근태 마감', staff.articles, staff.faqs).articles.some((h) => h.article.audience === 'admin')).toBe(false);
    expect(searchHelp('근태 마감', admin.articles, admin.faqs).articles.map((h) => h.article.id)).toContain('admin-close');
    expect(searchHelp('   ', admin.articles, admin.faqs)).toEqual({ articles: [], faqs: [] });
    expect(articleText(ARTICLES[0]).length).toBeGreaterThan(50);
  });
});
