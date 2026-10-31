// Validates Location and Stay notes against the vault templates.
// Usage (from the vault root): node "${CLAUDE_PLUGIN_ROOT}/skills/add-place/scripts/validate.mjs" [note.md ...]
// With no arguments it checks every note in Locations/ and Stays/, plus vault-wide checks.
// The vault is the current directory, or TRIP_VAULT if set.
import fs from 'node:fs';
import path from 'node:path';

const VAULT = path.resolve(process.env.TRIP_VAULT || process.cwd());
const rel = p => path.relative(VAULT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');

if (!fs.existsSync(path.join(VAULT, 'Templates', 'Location.md'))) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no Templates/Location.md). Run this from the vault folder, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}

// ---------- frontmatter parsing (the simple YAML subset this vault uses) ----------
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const keys = [], data = {};
  let last = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (kv) {
      last = kv[1]; keys.push(last);
      const v = kv[2].trim();
      if (v === '' ) data[last] = null;
      else if (v === '[]') data[last] = [];
      else if (/^\[.*\]$/.test(v)) data[last] = v.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean);
      else data[last] = unquote(v);
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && last) {
      if (!Array.isArray(data[last])) data[last] = [];
      data[last].push(unquote(item[1].trim()));
    }
  }
  return { keys, data, body: text.slice(m[0].length) };
}
const unquote = s => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

// FIELD GUIDE lines like "difficulty: easy | moderate | strenuous" -> closed enums.
// Lists containing "…" are open (e.g. nearest_base) and are not enforced.
function fieldGuideEnums(text) {
  const enums = {};
  const c = text.match(/<!--([\s\S]*?)-->/);
  if (!c) return enums;
  for (const line of c[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!m || !m[2].includes('|') || m[2].includes('…')) continue;
    const vals = m[2].split(/\s{2,}|\(/)[0].split('|').map(s => s.trim()).filter(Boolean);
    if (vals.length > 1) enums[m[1]] = new Set(vals);
  }
  return enums;
}

// ---------- vault index ----------
const allFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (f === '.obsidian' || f === '.claude' || f === '.git' || f === '.trash') continue;
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : allFiles.push(p);
  }
})(VAULT);
const mdFiles = allFiles.filter(p => p.endsWith('.md'));
const byBase = new Map();
for (const p of allFiles) {
  const b = path.basename(p).replace(/\.md$/, '');
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(p);
}
const pathSet = new Set(allFiles.map(p => rel(p).replace(/\.md$/, '')));
const resolves = link => byBase.has(link) || pathSet.has(link) || byBase.has(link + '.md');
const types = (() => {
  try { return JSON.parse(read(path.join(VAULT, '.obsidian/types.json')).replace(/,\s*}/g, '}')).types; }
  catch { return {}; }
})();

const TEMPLATES = {
  location: { folder: 'Locations', file: 'Templates/Location.md' },
  stay: { folder: 'Stays', file: 'Templates/Stay.md' },
};
for (const t of Object.values(TEMPLATES)) {
  const txt = read(path.join(VAULT, t.file));
  t.keys = parseFrontmatter(txt).keys;
  t.enums = fieldGuideEnums(txt);
}

const wikilinks = s => [...s.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\[\[([^\]]+?)\]\]/g)]
  .map(m => m[1].split('|')[0].split('#')[0].replace(/\\$/, '').trim()).filter(Boolean);

// ---------- per-note checks ----------
const errors = [], warnings = [], droppedNoReason = [];
const err = (f, msg) => errors.push(`${rel(f)}: ${msg}`);
const warn = (f, msg) => warnings.push(`${rel(f)}: ${msg}`);

const args = process.argv.slice(2).map(a => path.resolve(VAULT, a));
const targets = args.length ? args : mdFiles.filter(p => /^(Locations|Stays)\//.test(rel(p)));

for (const f of targets) {
  const text = read(f);
  const fm = parseFrontmatter(text);
  if (!fm) { err(f, 'no frontmatter'); continue; }
  const t = TEMPLATES[fm.data.type];
  if (!t) { err(f, `unknown type "${fm.data.type}" (expected location or stay)`); continue; }
  const name = path.basename(f, '.md');

  if (path.dirname(rel(f)) !== t.folder) err(f, `type ${fm.data.type} must live in ${t.folder}/`);
  if (/[\[\]#^|:\\/?]/.test(name)) err(f, 'file name contains a forbidden character');

  // property set and order
  const missing = t.keys.filter(k => !fm.keys.includes(k));
  const extra = fm.keys.filter(k => !t.keys.includes(k));
  if (missing.length) err(f, `missing properties: ${missing.join(', ')}`);
  if (extra.length) warn(f, `properties not in template: ${extra.join(', ')}`);
  const order = fm.keys.filter(k => t.keys.includes(k));
  const expected = t.keys.filter(k => fm.keys.includes(k));
  if (order.join() !== expected.join()) err(f, 'properties are not in template order');
  if (!/<!--[\s\S]*?FIELD GUIDE[\s\S]*?-->/.test(text)) warn(f, 'FIELD GUIDE comment block missing');

  // types
  for (const [k, v] of Object.entries(fm.data)) {
    if (v === null || (Array.isArray(v) && !v.length)) continue;
    const ty = types[k];
    if (ty === 'number' && !/^-?\d+(\.\d+)?$/.test(String(v))) err(f, `${k} must be a plain number, got "${v}"`);
    if (ty === 'checkbox' && !/^(true|false)$/.test(String(v))) err(f, `${k} must be true/false, got "${v}"`);
    if (ty === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(String(v))) err(f, `${k} must be YYYY-MM-DD, got "${v}"`);
  }
  // enums (warnings: values occasionally carry nuance)
  for (const [k, allowed] of Object.entries(t.enums)) {
    const v = fm.data[k];
    if (v === null || v === undefined || Array.isArray(v) || k === 'decision') continue;
    if (!allowed.has(String(v))) warn(f, `${k} "${v}" is not one of: ${[...allowed].join(' | ')}`);
  }

  // coordinates (rough NE India bounding box)
  const loc = fm.data.location;
  if (!Array.isArray(loc) || !loc.length) warn(f, 'no coordinates yet (will not show on the map)');
  else if (loc.length !== 2) err(f, 'location must be [lat, lng]');
  else {
    const [lat, lng] = loc.map(Number);
    if (!(lat > 24 && lat < 28.5 && lng > 89 && lng < 97)) err(f, `location ${loc} is outside Assam/Meghalaya`);
  }

  // planning fields
  if (!['considering', 'selected', 'backup', 'dropped'].includes(fm.data.decision)) err(f, `decision "${fm.data.decision}" invalid`);
  if (fm.data.decision === 'dropped' && !fm.data.decision_reason) droppedNoReason.push(name);
  const tags = fm.data.tags || [];
  if (!tags.includes(fm.data.type)) err(f, `tags must include "${fm.data.type}"`);

  // sources
  const recs = (fm.data.recommended_by || []).map(r => r.replace(/^\[\[|\]\]$/g, '').split('|')[0]);
  if (!recs.length) err(f, 'recommended_by is empty (every note needs a source)');
  for (const r of recs) {
    const hits = byBase.get(r);
    if (!hits) { err(f, `recommended_by → [[${r}]] does not exist`); continue; }
    if (!hits.some(h => rel(h).startsWith('Sources/'))) warn(f, `recommended_by → [[${r}]] is not in Sources/`);
    else if (!wikilinks(read(hits[0])).includes(name)) warn(f, `source [[${r}]] does not link back to [[${name}]]`);
  }

  // links in the note
  for (const l of new Set(wikilinks(text))) {
    if (!resolves(l)) warn(f, `unresolved link [[${l}]]`);
  }
  if (!/^# .+/m.test(fm.body)) warn(f, 'no H1 heading');
  else if (!fm.body.match(/^# (.+)$/m)[1].includes(name.replace(/\s*\(.*\)$/, ''))) warn(f, 'H1 heading does not match file name');
  if (/\{\{title\}\}/.test(text)) err(f, '{{title}} placeholder not replaced');
}

// ---------- vault-wide checks ----------
if (!args.length) {
  for (const [b, ps] of byBase) {
    const md = ps.filter(p => p.endsWith('.md'));
    if (md.length > 1) errors.push(`duplicate note name "${b}": ${md.map(rel).join(', ')}`);
  }
  for (const p of mdFiles.filter(p => path.dirname(p) === VAULT && path.basename(p) !== '00 Home.md')) {
    const size = fs.statSync(p).size;
    if (size) warnings.push(`note in vault root: ${rel(p)} (has content; the user's own note? leave it unless asked)`);
    else errors.push(`stray EMPTY note in vault root: ${rel(p)} (created by clicking a link; safe to delete)`);
  }
  // aliases that collide with another note's name
  for (const f of mdFiles.filter(p => /^(Locations|Stays)\//.test(rel(p)))) {
    const fm = parseFrontmatter(read(f));
    for (const a of (fm?.data.aliases || [])) {
      if (byBase.has(a) && a !== path.basename(f, '.md')) warnings.push(`${rel(f)}: alias "${a}" equals another note's name`);
    }
  }
}

if (droppedNoReason.length) warnings.push(`dropped without decision_reason (${droppedNoReason.length}): ${droppedNoReason.join(', ')}`);
console.log(`Checked ${targets.length} note(s).`);
console.log(`\nERRORS (${errors.length})`); errors.forEach(e => console.log('  ✗ ' + e));
console.log(`\nWARNINGS (${warnings.length})`); warnings.forEach(w => console.log('  ! ' + w));
process.exit(errors.length ? 1 : 0);
