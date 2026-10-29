// 서류 DB와 자동 완성 시험 (감정평가사 사이트)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { buildDocsDb, serialize, PID } from '../scripts/build-docs-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const db = JSON.parse(read('data/docs.json'));
const win = {}; vm.runInNewContext(read('assets/docs-search.js'), { window: win });
const D = win.NaviLawDocs, idx = D.createIndex(db);
const titles = (r) => Array.from(r, (e) => e.t);
const first = (q) => titles(D.search(idx, q, { limit: 5 }))[0];

test('서류 DB: data/docs.json 이 서류 목록(appraiser.json)·발급 서류에서 만든 최신본이다', () => {
  assert.equal(read('data/docs.json'), serialize(buildDocsDb()), 'node scripts/build-docs-index.mjs 를 실행하세요');
});

test('서류 DB: 서류 75종 + 발급 서류 20종 = 95건, 분야 10개, 모두 감정평가사 전문가 ID', () => {
  assert.equal(PID, 'appraiser');
  assert.equal(db.docs.length, 95);
  assert.equal(db.docs.filter((d) => d.p === 'appraiser').length, 75);
  assert.equal(db.docs.filter((d) => d.p === 'issued').length, 20);
  assert.equal(db.fields.length, 10);
  const seen = new Set();
  for (const d of db.docs) {
    assert.ok(d.t && d.p && d.pid === 'appraiser' && d.c && d.d, JSON.stringify(d));
    const k = d.t.replace(/\s+/g, ''); assert.ok(!seen.has(k), '중복: ' + d.t); seen.add(k);
    assert.ok(d.d.length <= 120, d.t);
  }
});

test('서류 DB: 근거 없는 수치·조문 번호를 적지 않는다(설명·기한 참고)', () => {
  const a = JSON.parse(read('data/appraiser.json'));
  const text = JSON.stringify(a);
  assert.ok(!/제\s*\d+\s*조/.test(text), '조문 번호는 적지 않는다(확인 필요한 것은 서류에서 확인)');
  for (const f of a.fields) for (const x of f.deadlines) assert.ok(!/\d+\s*(일|개월|년)/.test(x.d), f.id + ': ' + x.d);
});

test('발급 서류: 모든 항목에 서류명·발급처·안내가 있고 이름이 겹치지 않는다', () => {
  const issued = JSON.parse(read('data/issued-docs.json')).docs, seen = new Set();
  assert.equal(issued.length, 20);
  for (const f of issued) {
    assert.ok(f.t && f.d && /^(발급 서류|조회 신청) · .+/.test(f.c), JSON.stringify(f));
    const k = f.t.replace(/\s+/g, ''); assert.ok(!seen.has(k), '중복: ' + f.t); seen.add(k);
  }
});

test('검색: 일상어·별칭·초성으로 감정평가 서류를 찾는다', () => {
  assert.equal(first('토지 감정'), '감정평가서(토지)');
  assert.equal(first('아파트 감정'), '감정평가서(집합건물)');
  assert.equal(first('담보'), '담보감정평가서');
  assert.equal(first('ㄷㅂㄱㅈㅍㄱㅅ'), '담보감정평가서');
  assert.equal(first('경매'), '경매 감정평가서');
  assert.equal(first('법원 감정'), '소송 감정서(감정인 제출)');
  assert.equal(first('수수료 청구'), '감정평가 수수료·실비 청구서');
  assert.equal(first('보충'), '보충감정서');
  assert.equal(first('권리금 평가'), '감정평가서(권리금)');
  assert.equal(first('표준지 평가'), '표준지공시지가 조사·평가 보고서');
  assert.equal(first('개별공시지가 검증'), '개별공시지가 검증 의견서');
  assert.equal(first('사진 첨부'), '사진대지');
  assert.equal(first('재개발 평가'), '종전·종후자산 평가서(정비사업)');
});

test('검색: 분야도 제안한다(담보·금융, 경매·소송)', () => {
  const r = D.search(idx, '경매', { limit: 5 });
  assert.ok(Array.from(r, (e) => e.kind).includes('field'));
});

test('검색: 목록에 없는 말은 결과가 없다 — 화면은 "직접 작성" 줄로 이어 준다', () => {
  assert.equal(D.search(idx, '아주특이한서류zzq', { limit: 5 }).length, 0);
});

test('best(): 문장 속 서류명은 더 길게 일치한 서류를 고르고, 일반어에는 걸리지 않는다', () => {
  assert.equal(D.best(idx, '담보감정평가서 초안 작성해 주세요').t, '담보감정평가서');
  assert.equal(D.best(idx, '경매 감정평가서 작성').t, '경매 감정평가서');
  assert.equal(D.best(idx, '감정평가서(건물)').t, '감정평가서(건물)');
  assert.equal(D.best(idx, '신청서 작성해 주세요'), null, '일반어만으로는 서류를 정하지 않는다');
  assert.equal(D.best(idx, '아주특이한서류zzq'), null);
});

test('발급 서류: 서류명·별칭이 정확히 같을 때만 발급 서류, 문장 속 서류명은 작성 요청이다', () => {
  assert.equal(D.findIssued(db, '토지대장').t, '토지대장');
  assert.equal(D.findIssued(db, '건축물 대장').t, '건축물대장');
  assert.equal(D.findIssued(db, '부동산등기부등본').t, '등기사항전부증명서(부동산)');
  assert.equal(D.findIssued(db, '토지대장을 붙인 감정평가서 작성'), null);
  assert.equal(D.findIssued(db, '감정평가서(토지)'), null);
});

test('발급 문의: 서류명 + 발급 문의 표현일 때만 발급 안내, 초안 요청은 아니다', () => {
  assert.equal(D.findIssuedAsk(db, '토지대장 떼는 법').t, '토지대장');
  assert.equal(D.findIssuedAsk(db, '건축물대장 발급 어디서 받아요').t, '건축물대장');
  assert.equal(D.findIssuedAsk(db, '토지대장을 붙인 감정평가서 초안 작성해 줘'), null);
  const msg = D.issuedAsk(D.findIssued(db, '토지대장'), '', '');
  assert.match(msg, /^「토지대장」은\(는\) 작성하는 서류가 아니라 발급받아 첨부하는 서류입니다/);
  assert.match(msg, /정부24/);
});

test('성능: 95건 색인 위 검색이 1회 5ms 안팎', () => {
  const t0 = Date.now(); for (let i = 0; i < 200; i++) D.search(idx, '담보감정', { limit: 8 });
  assert.ok((Date.now() - t0) / 200 < 5, '검색 평균 ' + (Date.now() - t0) / 200 + 'ms');
});
