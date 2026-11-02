// Shared checker for a trip-huddle vault. Every skill calls it; nothing in it is specific to one trip.
// Usage: node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" [--vault <path>] [note.md ...]
//
// Vault: --vault <path>, else the TRIP_VAULT setting, else the current folder.
// It is never worked out from where this script is stored.
// With no note paths it checks every note whose type has a template, plus vault-wide checks.
//
// Driven by the vault's Templates/ folder. Each template's frontmatter gives the note type (`type:`),
// its fields (and their order), and the first <!-- --> comment gives allowed values (FIELD GUIDE lines
// like "difficulty: easy | moderate | strenuous") and an optional hint line:
//   checker: folder=Locations; required=day, date
// `folder` is where notes of that type live. `required` adds fields that must not be empty
// (recommended_by is always required when the template has it).
// Optional trip.md at the vault root: map_box, regions, bases, categories, decision_values and
// folders ({location: Locations}). Whatever is missing falls back to the defaults below.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const pos = [];
let vaultArg;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--vault') vaultArg = argv[++i];
  else if (argv[i].startsWith('--vault=')) vaultArg = argv[i].slice(8);
  else pos.push(argv[i]);
}
const VAULT = path.resolve(vaultArg || process.env.TRIP_VAULT || process.cwd());
const rel = p => path.relative(VAULT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');

const tplDir = path.join(VAULT, 'Templates');
const tplFiles = fs.existsSync(tplDir) ? fs.readdirSync(tplDir).filter(f => f.endsWith('.md')).sort() : [];
if (!tplFiles.length) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no note templates in Templates/). Run this from the vault folder, pass --vault <path>, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}

// ---------- frontmatter parsing (the simple YAML subset this vault uses) ----------
function parseFrontmatter(text, stripComments = false) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const keys = [], data = {};
  let last = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (kv) {
      last = kv[1]; keys.push(last);
      let v = kv[2].trim();
      if (stripComments && !/^["']/.test(v)) v = v.replace(/\s+#.*$/, '');
      if (v === '' ) data[last] = null;
      else if (v === '[]') data[last] = [];
      else if (/^\{.*\}$/.test(v)) data[last] = parseInlineMap(v);
      else if (/^\[.*\]$/.test(v)) data[last] = v.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean);
      else data[last] = unquote(v);
      continue;
    }
    const sub = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/);
    if (sub && last && (data[last] === null || (data[last] && !Array.isArray(data[last]) && typeof data[last] === 'object'))) {
      data[last] = data[last] || {};
      data[last][sub[1]] = unquote(sub[2].trim());
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
function parseInlineMap(v) {
  const out = {};
  for (const part of v.slice(1, -1).split(',')) {
    const [k, ...rest] = part.split(':');
    if (k && k.trim() && rest.length) out[k.trim()] = unquote(rest.join(':').trim());
  }
  return out;
}
const unquote = s => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

// FIELD GUIDE lines like "difficulty: easy | moderate | strenuous" -> closed enums.
// Lists containing "…" are open (e.g. nearest_base): not enforced, and listed in enums.open.
function fieldGuideEnums(text) {
  const enums = {}, open = new Set();
  const c = text.match(/<!--([\s\S]*?)-->/);
  if (!c) return { enums, open };
  for (const line of c[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!m || !m[2].includes('|')) continue;
    if (m[2].includes('…')) { open.add(m[1]); continue; }
    const vals = m[2].split(/\s{2,}|\(/)[0].split('|').map(s => s.trim()).filter(Boolean);
    if (vals.length > 1) enums[m[1]] = new Set(vals);
  }
  return { enums, open };
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

// ---------- optional trip settings (trip.md at the vault root) ----------
const trip = (() => {
  try { return parseFrontmatter(read(path.join(VAULT, 'trip.md')), true)?.data || {}; }
  catch { return {}; }
})();
const mapBox = (() => {
  const b = trip.map_box;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const n = ['lat_min', 'lat_max', 'lng_min', 'lng_max'].map(k => Number(b[k]));
  return n.every(Number.isFinite) && b.lat_min !== '' ? { latMin: n[0], latMax: n[1], lngMin: n[2], lngMax: n[3] } : null;
})();

// Defaults, used when neither the template hint nor trip.md says otherwise (the values this vault always had).
const DEFAULT_FOLDERS = { location: 'Locations', stay: 'Stays', source: 'Sources' };
const DEFAULT_DECISIONS = ['considering', 'selected', 'backup', 'dropped'];
// FIELD GUIDE fields whose allowed values can come from a trip.md list.
const TRIP_LISTS = { state: 'regions', nearest_base: 'bases', base_town: 'bases', category: 'categories' };

const firstComment = text => (text.match(/<!--([\s\S]*?)-->/) || [])[1] || '';
function hints(text) {
  const out = { folder: null, required: [] };
  const m = firstComment(text).match(/^checker:\s*(.*)$/m);
  if (!m) return out;
  for (const part of m[1].split(';')) {
    const [k, ...v] = part.split('=');
    const val = v.join('=').trim();
    if (k.trim() === 'folder') out.folder = val || null;
    if (k.trim() === 'required') out.required = val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

// ---------- templates: one per note type ----------
const tripList = k => Array.isArray(trip[k]) && trip[k].length ? trip[k].map(String) : null;
const tripFolders = trip.folders && typeof trip.folders === 'object' && !Array.isArray(trip.folders) ? trip.folders : {};
const decisionOverride = tripList('decision_values');
const TEMPLATES = {};
const templateProblems = [];
for (const f of tplFiles) {
  const txt = read(path.join(tplDir, f));
  const fm = parseFrontmatter(txt);
  const type = fm && typeof fm.data.type === 'string' ? fm.data.type : '';
  if (!type) continue; // not a note template
  if (TEMPLATES[type]) { templateProblems.push(`Templates/${f}: a second template for type "${type}" (also ${TEMPLATES[type].file})`); continue; }
  const h = hints(txt);
  const t = { type, file: `Templates/${f}`, keys: fm.keys, ...fieldGuideEnums(txt),
    folder: tripFolders[type] || h.folder || DEFAULT_FOLDERS[type] || null,
    hasGuide: /<!--[\s\S]*?-->/.test(txt), guideNamed: /<!--[\s\S]*?FIELD GUIDE[\s\S]*?-->/.test(txt) };
  t.required = [...new Set([...(fm.keys.includes('recommended_by') ? ['recommended_by'] : []), ...h.required])];
  for (const k of t.required) if (!fm.keys.includes(k)) templateProblems.push(`Templates/${f}: checker hint names "${k}", which is not a property of the template`);
  TEMPLATES[type] = t;
}
if (!Object.keys(TEMPLATES).length) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(Templates/ has no note templates with a "type:" property). Run this from the vault folder, pass --vault <path>, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}
const sourceFolder = TEMPLATES.source?.folder || DEFAULT_FOLDERS.source;
const decisionValues = t => decisionOverride || (t.enums.decision ? [...t.enums.decision] : DEFAULT_DECISIONS);
const inTripList = (list, v) => list.some(x => x.toLowerCase() === String(v).toLowerCase());

const wikilinks = s => [...s.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\[\[([^\]]+?)\]\]/g)]
  .map(m => m[1].split('|')[0].split('#')[0].replace(/\\$/, '').trim()).filter(Boolean);
const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
// Small edit distance, so a mistyped type ("stya") in a note is caught but a type without a template ("route") is not.
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// ---------- which notes to check ----------
const errors = [], warnings = [], droppedNoReason = [];
const err = (f, msg) => errors.push(`${rel(f)}: ${msg}`);
const warn = (f, msg) => warnings.push(`${rel(f)}: ${msg}`);
templateProblems.forEach(m => errors.push(m));

const isRoot = p => path.dirname(p) === VAULT;
const folderOwners = new Set(Object.values(TEMPLATES).map(t => t.folder).filter(Boolean));
const parsed = new Map(); // path -> parseFrontmatter result (or null)
const fmOf = p => { if (!parsed.has(p)) parsed.set(p, parseFrontmatter(read(p))); return parsed.get(p); };

const explicit = pos.map(a => { const v = path.resolve(VAULT, a); return !fs.existsSync(v) && fs.existsSync(path.resolve(a)) ? path.resolve(a) : v; });
const notes = mdFiles.filter(p => !isRoot(p) && !rel(p).startsWith('Templates/'));
const targets = explicit.length ? explicit : notes.filter(p => {
  const fm = fmOf(p);
  const type = fm?.data.type;
  if (type && TEMPLATES[type]) return true;
  return folderOwners.has(path.dirname(rel(p))) && (!type || Object.keys(TEMPLATES).some(k => distance(k, String(type)) <= 2));
});

// ---------- per-note checks ----------
for (const f of targets) {
  if (!fs.existsSync(f)) { err(f, 'file not found'); continue; }
  const text = read(f);
  const fm = fmOf(f);
  if (!fm) { err(f, 'no frontmatter'); continue; }
  const t = TEMPLATES[fm.data.type];
  if (!t) {
    if (explicit.length && fm.data.type) warn(f, `no template for type "${fm.data.type}" in Templates/, not checked`);
    else err(f, `unknown type "${fm.data.type}" (expected ${Object.keys(TEMPLATES).join(', ')})`);
    continue;
  }
  const name = path.basename(f, '.md');
  const type = t.type;

  if (t.folder && path.dirname(rel(f)) !== t.folder) err(f, `type ${type} must live in ${t.folder}/`);
  if (/[\[\]#^|:\\/?]/.test(name)) err(f, 'file name contains a forbidden character');

  // property set and order
  const missing = t.keys.filter(k => !fm.keys.includes(k));
  const extra = fm.keys.filter(k => !t.keys.includes(k));
  if (missing.length) err(f, `missing properties: ${missing.join(', ')}`);
  if (extra.length) warn(f, `properties not in template: ${extra.join(', ')}`);
  const order = fm.keys.filter(k => t.keys.includes(k));
  const expected = t.keys.filter(k => fm.keys.includes(k));
  if (order.join() !== expected.join()) err(f, 'properties are not in template order');
  if (t.guideNamed && !/<!--[\s\S]*?FIELD GUIDE[\s\S]*?-->/.test(text)) warn(f, 'FIELD GUIDE comment block missing');
  else if (t.hasGuide && !/<!--[\s\S]*?-->/.test(text)) warn(f, 'template comment block missing');

  // required fields
  for (const k of t.required) {
    if (k === 'recommended_by') continue; // checked below, with its links
    if (fm.keys.includes(k) && isEmpty(fm.data[k])) err(f, `${k} is required but empty`);
  }

  // types
  for (const [k, v] of Object.entries(fm.data)) {
    if (isEmpty(v)) continue;
    const ty = types[k];
    if (ty === 'number' && !/^-?\d+(\.\d+)?$/.test(String(v))) err(f, `${k} must be a plain number, got "${v}"`);
    if (ty === 'checkbox' && !/^(true|false)$/.test(String(v))) err(f, `${k} must be true/false, got "${v}"`);
    if (ty === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(String(v))) err(f, `${k} must be YYYY-MM-DD, got "${v}"`);
  }
  // value lists (warnings: values occasionally carry nuance)
  for (const k of fm.keys) {
    const v = fm.data[k];
    if (isEmpty(v) || Array.isArray(v) || typeof v === 'object' || k === 'decision') continue;
    const tl = t.open.has(k) ? null : tripList(TRIP_LISTS[k]); // an open list in the template (ends in …) is not enforced
    if (tl) {
      if (!inTripList(tl, v)) warn(f, `${k} "${v}" is not one of the trip ${TRIP_LISTS[k]} in trip.md: ${tl.join(' | ')}`);
    } else if (t.enums[k] && !t.enums[k].has(String(v))) warn(f, `${k} "${v}" is not one of: ${[...t.enums[k]].join(' | ')}`);
  }

  // coordinates (bounding box from trip.md map_box; skipped when absent)
  if (t.keys.includes('location')) {
    const loc = fm.data.location;
    if (!Array.isArray(loc) || !loc.length) warn(f, 'no coordinates yet (will not show on the map)');
    else if (loc.length !== 2) err(f, 'location must be [lat, lng]');
    else {
      const [lat, lng] = loc.map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) err(f, `location ${loc} must be two numbers`);
      else if (mapBox && !(lat >= mapBox.latMin && lat <= mapBox.latMax && lng >= mapBox.lngMin && lng <= mapBox.lngMax)) {
        err(f, `location ${loc} is outside the trip map_box in trip.md`);
      }
    }
  }

  // planning fields
  if (t.keys.includes('decision')) {
    const allowed = decisionValues(t);
    if (!allowed.includes(fm.data.decision)) err(f, `decision "${fm.data.decision}" invalid (use ${allowed.join(' | ')})`);
    if (fm.data.decision === 'dropped' && !fm.data.decision_reason) droppedNoReason.push(name);
  }
  const tags = fm.data.tags || [];
  if (!tags.includes(type)) err(f, `tags must include "${type}"`);

  // sources
  if (t.keys.includes('recommended_by')) {
    const recs = (fm.data.recommended_by || []).map(r => r.replace(/^\[\[|\]\]$/g, '').split('|')[0]);
    if (!recs.length && t.required.includes('recommended_by')) err(f, 'recommended_by is empty (every note needs a source)');
    for (const r of recs) {
      const hits = byBase.get(r);
      if (!hits) { err(f, `recommended_by → [[${r}]] does not exist`); continue; }
      if (!hits.some(h => rel(h).startsWith(sourceFolder + '/'))) warn(f, `recommended_by → [[${r}]] is not in ${sourceFolder}/`);
      else if (!wikilinks(read(hits[0])).includes(name)) warn(f, `source [[${r}]] does not link back to [[${name}]]`);
    }
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
if (!explicit.length) {
  for (const [b, ps] of byBase) {
    const md = ps.filter(p => p.endsWith('.md'));
    if (md.length > 1) errors.push(`duplicate note name "${b}": ${md.map(rel).join(', ')}`);
  }
  for (const p of mdFiles.filter(p => isRoot(p) && !['00 Home.md', 'trip.md'].includes(path.basename(p)))) {
    const size = fs.statSync(p).size;
    if (size) warnings.push(`note in vault root: ${rel(p)} (has content; the user's own note? leave it unless asked)`);
    else errors.push(`stray EMPTY note in vault root: ${rel(p)} (created by clicking a link; safe to delete)`);
  }
  // aliases that collide with another note's name
  for (const f of targets) {
    const fm = fmOf(f);
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
