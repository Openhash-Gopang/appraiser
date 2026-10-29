// 서류 DB 만들기 — data/appraiser.json 의 서류 목록(+ data/issued-docs.json 의 발급 서류, data/docs-aliases.json 의 별칭)을 한 파일 data/docs.json 으로 합친다.
// 사용: node scripts/build-docs-index.mjs        (서류 목록을 바꾼 뒤 반드시 다시 실행 — tests/ 가 최신인지 확인한다)
//       node scripts/build-docs-index.mjs --check (docs.json 이 최신이 아니면 종료 코드 1)
// 항목 형식은 모든 직역 사이트가 같다: { t: 제목, p: 구분, pid: 전문가 ID, c: 분류·출처, d: 설명, a: 별칭 }
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
export const PID = 'appraiser';   // hondi 저장소 expert-registry-core.js 의 감정평가사 전문가 ID

export function buildDocsDb(opts = {}) {
  const src = opts.source || read('data/appraiser.json'), aliases = read('data/docs-aliases.json');
  const docs = [];
  const nk = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  const aliasFor = (t) => {
    const out = [];
    for (const a of aliases) if (a.exact ? t === a.match : t.includes(a.match)) out.push(...a.add);
    return [...new Set(out)];
  };
  const push = (p, c, t, d, own = []) => {
    const row = { t, p, pid: PID, c, d: d.length > 120 ? d.slice(0, 119) + '…' : d };
    const a = [...new Set([...own, ...aliasFor(t)])]; if (a.length) row.a = a;
    docs.push(row);
  };
  for (const c of src.catalog) for (const it of c.items) push('appraiser', c.tab, it.t, it.d);
  // 발급 민원서류(등기사항전부증명서·토지대장 등 첨부서류) — data/issued-docs.json. 작성 대상이 아니라 발급 안내로 보낸다.
  let issued = opts.issued; if (!issued) { try { issued = read('data/issued-docs.json').docs || []; } catch { issued = []; } }
  const have = new Set(docs.map((d) => nk(d.t)));
  for (const f of issued) { if (have.has(nk(f.t))) continue; push('issued', f.c, f.t, f.d || '', f.a || []); }
  const fields = src.fields.map((f) => ({ id: f.id, name: f.name, scope: f.scope || '' }));
  return { v: 1, docs, fields };
}
export function serialize(db) {
  return '{"v":1,\n"docs":[\n' + db.docs.map((x) => JSON.stringify(x)).join(',\n') + '\n],\n"fields":[\n' + db.fields.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n';
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = serialize(buildDocsDb()), path = join(ROOT, 'data/docs.json');
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(path, 'utf8'); } catch { /* 없음 */ }
    if (cur !== out) { console.error('data/docs.json 이 최신이 아닙니다. node scripts/build-docs-index.mjs 를 실행하세요.'); process.exit(1); }
    console.log('docs.json 최신'); process.exit(0);
  }
  writeFileSync(path, out);
  const db = JSON.parse(out); console.log('서류 ' + db.docs.length + '건 · 분야 ' + db.fields.length + '개 → data/docs.json (' + out.length + '자)');
}
