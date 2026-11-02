// The trip-huddle checker. Checks every note in a trip vault against the vault's own templates.
//
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs" [--vault <folder>] [note.md ...]
//
// The vault is the current folder, or --vault <folder>, or the TRIP_VAULT environment variable.
// It is never worked out from where this script is stored.
// With no note names it checks every trip note in the vault, plus vault-wide checks.
//
// What it reads from the vault:
//   Templates/*.md     each template's `type:` is a note type; its property list is the schema;
//                      FIELD GUIDE lines "key: a | b | c" are closed value lists (a list that
//                      contains "…" is open and not checked).
//   .obsidian/types.json  property types (number, checkbox, date, multitext).
//   trip.md (optional) map_box, regions, decision_values, and folders (a map of note type to folder).
import fs from 'node:fs';
import path from 'node:path';

// ---------- arguments ----------
const argv = process.argv.slice(2);
let vaultArg = process.env.TRIP_VAULT || '';
const noteArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--vault') vaultArg = argv[++i] || '';
  else if (argv[i].startsWith('--vault=')) vaultArg = argv[i].slice(8);
  else noteArgs.push(argv[i]);
}
const VAULT = path.resolve(vaultArg || process.cwd());
const rel = p => path.relative(VAULT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');

if (!fs.existsSync(VAULT) || !(fs.existsSync(path.join(VAULT, '00 Home.md')) || fs.existsSync(path.join(VAULT, 'trip.md')))) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no "00 Home.md" or "trip.md" in it). Run this from the vault folder, or pass --vault <path to the vault>.`);
  process.exit(2);
}
if (!fs.existsSync(path.join(VAULT, 'Templates'))) {
  console.error(`This folder has no Templates/ folder: ${VAULT}\nThe checker learns what a note should look like from the templates. Copy the Templates folder from vault-template/ into the vault, or run trip-init.`);
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
      if (v === '') data[last] = null;
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

// FIELD GUIDE lines like "difficulty: easy | moderate | strenuous" are closed value lists.
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
const SKIP_DIRS = new Set(['.obsidian', '.claude', '.git', '.trash']);
const allFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (SKIP_DIRS.has(f)) continue;
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
const propTypes = (() => {
  try { return JSON.parse(read(path.join(VAULT, '.obsidian/types.json')).replace(/,\s*}/g, '}')).types || {}; }
  catch { return {}; }
})();

// ---------- trip settings (trip.md at the vault root, all optional) ----------
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
const eveningBases = Array.isArray(trip.evening_bases) ? trip.evening_bases.map(String) : [];
const regions = Array.isArray(trip.regions) && trip.regions.length ? trip.regions.map(String) : null;
const decisionValues = Array.isArray(trip.decision_values) && trip.decision_values.length
  ? trip.decision_values.map(String) : ['considering', 'selected', 'backup', 'dropped'];
const FOLDERS = { location: 'Locations', stay: 'Stays', day: 'Itinerary', source: 'Sources', food: 'Food', route: 'Itinerary', transport: 'Logistics' };
if (trip.folders && typeof trip.folders === 'object' && !Array.isArray(trip.folders)) {
  for (const [t, f] of Object.entries(trip.folders)) if (f) FOLDERS[t] = String(f).replace(/^\/+|\/+$/g, '');
}

// ---------- the schema: one per template ----------
const SCHEMA = {};   // type -> { keys, enums, file }
for (const f of mdFiles.filter(p => rel(p).startsWith('Templates/'))) {
  const text = read(f);
  const fm = parseFrontmatter(text);
  const type = fm?.data.type;
  if (!type || SCHEMA[type]) continue;
  SCHEMA[type] = { keys: fm.keys, enums: fieldGuideEnums(text), file: rel(f), hasGuide: /FIELD GUIDE/.test(text) };
}
if (!Object.keys(SCHEMA).length) {
  console.error(`No note templates found in ${VAULT}/Templates (a template needs "type: ..." in its frontmatter).`);
  process.exit(2);
}
const folderUse = {};
for (const f of Object.values(FOLDERS)) folderUse[f] = (folderUse[f] || 0) + 1;

const wikilinks = s => [...s.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\[\[([^\]]+?)\]\]/g)]
  .map(m => m[1].split('|')[0].split('#')[0].replace(/\\$/, '').trim()).filter(Boolean);

// ---------- which notes to check ----------
const errors = [], warnings = [], droppedNoReason = [];
const err = (f, msg) => errors.push(`${rel(f)}: ${msg}`);
const warn = (f, msg) => warnings.push(`${rel(f)}: ${msg}`);
const strayEvening = Array.isArray(trip.bases) ? eveningBases.filter(x => !trip.bases.map(String).includes(x)) : [];
if (strayEvening.length) warnings.push(`trip.md: evening_bases has towns that are not in bases: ${strayEvening.join(', ')}. Use the same spelling as in bases`);

const isTripNoteSpot = p => {
  const r = rel(p);
  if (r.startsWith('Templates/') || r.startsWith('Memories/') || !r.includes('/')) return false;
  if (Object.values(FOLDERS).some(f => r.startsWith(f + '/'))) return true;
  const fm = parseFrontmatter(read(p));
  return !!(fm && SCHEMA[fm.data.type]);   // a trip note filed in the wrong place
};
const explicit = noteArgs.length > 0;
const targets = explicit ? noteArgs.map(a => path.resolve(VAULT, a)) : mdFiles.filter(isTripNoteSpot);

const allNames = new Set(mdFiles.map(p => path.basename(p, '.md')));

for (const f of targets) {
  if (!fs.existsSync(f)) { errors.push(`${noteArgs[targets.indexOf(f)]}: no such file`); continue; }
  const text = read(f);
  const fm = parseFrontmatter(text);
  const dir = path.dirname(rel(f));
  const name = path.basename(f, '.md');
  const sharedFolder = folderUse[dir] > 1;

  if (!fm || fm.data.type === undefined || fm.data.type === null || fm.data.type === '') {
    const msg = fm ? 'the note has no "type" property' : 'the note has no properties (frontmatter) at the top';
    const fix = 'Add the properties from the matching template (Templates/ folder), or move the note out of this folder if it is not a trip note.';
    // Folders shared by several note types (e.g. Itinerary) may hold the user's own notes.
    (sharedFolder ? warn : err)(f, `${msg}. ${fix}`);
    continue;
  }
  const type = String(fm.data.type);
  const t = SCHEMA[type];
  if (!t) {
    err(f, `type "${type}" has no template in Templates/. Known types: ${Object.keys(SCHEMA).join(', ')}. Fix the type, or add a template for it.`);
    continue;
  }
  const want = FOLDERS[type];
  if (want && dir !== want) err(f, `a "${type}" note must live in ${want}/ (it is in ${dir === '.' ? 'the vault root' : dir + '/'}). Move it, or fix its type.`);
  if (/[\[\]#^|:\\/?]/.test(name)) err(f, 'the file name contains a character Obsidian links cannot handle ([ ] # ^ | : \\ / ?). Rename the note.');

  // properties: missing, unknown
  const missing = t.keys.filter(k => !fm.keys.includes(k));
  const extra = fm.keys.filter(k => !t.keys.includes(k));
  if (missing.length) warn(f, `missing properties: ${missing.join(', ')}. Add them (empty is fine) so the note matches ${t.file}.`);
  if (extra.length) warn(f, `properties that are not in ${t.file}: ${extra.join(', ')}. Remove them, or add them to the template if you want to keep them.`);
  const shared = fm.keys.filter(k => t.keys.includes(k));
  const expected = t.keys.filter(k => shared.includes(k));
  if (shared.join() !== expected.join()) warn(f, `properties are not in the same order as ${t.file}. Reorder them to match, so notes stay easy to compare.`);
  if (!/<!--[\s\S]*?FIELD GUIDE[\s\S]*?-->/.test(text) && t.hasGuide) {
    warn(f, 'the FIELD GUIDE comment block from the template is missing');
  }

  // property types (.obsidian/types.json)
  for (const [k, v] of Object.entries(fm.data)) {
    if (v === null || (Array.isArray(v) && !v.length)) continue;
    const ty = propTypes[k];
    if (ty === 'number' && !/^-?\d+(\.\d+)?$/.test(String(v))) err(f, `${k} must be a plain number (no symbol or text), got "${v}"`);
    if (ty === 'checkbox' && !/^(true|false)$/.test(String(v))) err(f, `${k} must be true or false, got "${v}"`);
    if (ty === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(String(v))) err(f, `${k} must be a date like 2027-06-05, got "${v}"`);
    if (ty === 'multitext' && !Array.isArray(v)) warn(f, `${k} should be a list (like [a, b]), got "${v}"`);
  }

  // closed value lists from the template's FIELD GUIDE
  for (const [k, allowed] of Object.entries(t.enums)) {
    const v = fm.data[k];
    if (v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v)) || k === 'decision') continue;
    if (k === 'state' && regions) continue;   // checked against the trip.md regions below
    // A list property (like best_time_of_day: [sunrise, evening]) is checked item by item.
    for (const item of Array.isArray(v) ? v : [v]) {
      if (!allowed.has(String(item))) warn(f, `${k} "${item}" is not one of: ${[...allowed].join(' | ')}. Use one of these, or add the new value to the list in ${t.file}.`);
    }
  }
  if (regions && fm.data.state && !regions.some(r => r.toLowerCase() === String(fm.data.state).toLowerCase())) {
    warn(f, `state "${fm.data.state}" is not one of the trip regions in trip.md: ${regions.join(' | ')}`);
  }

  // coordinates
  if (t.keys.includes('location')) {
    const loc = fm.data.location;
    if (!Array.isArray(loc) || !loc.length) warn(f, 'no coordinates yet, so it will not show on the map. Add location: [lat, lng].');
    else if (loc.length !== 2) err(f, 'location must be two numbers: [lat, lng]');
    else {
      const [lat, lng] = loc.map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) err(f, `location [${loc}] must be two numbers: [lat, lng]`);
      else if (mapBox && !(lat >= mapBox.latMin && lat <= mapBox.latMax && lng >= mapBox.lngMin && lng <= mapBox.lngMax)) {
        err(f, `location [${loc}] is outside the trip map_box in trip.md. Check the coordinates (lat first, then lng).`);
      }
    }
  }

  // decision
  if (t.keys.includes('decision')) {
    if (!decisionValues.includes(fm.data.decision)) err(f, `decision "${fm.data.decision ?? ''}" is not one of: ${decisionValues.join(' | ')}`);
    if (fm.data.decision === 'dropped' && !fm.data.decision_reason) droppedNoReason.push(name);
  }
  const tags = fm.data.tags || [];
  if (t.keys.includes('tags') && !tags.includes(type)) err(f, `tags must include "${type}"`);

  // sources
  if (t.keys.includes('recommended_by')) {
    const recs = (fm.data.recommended_by || []).map(r => r.replace(/^\[\[|\]\]$/g, '').split('|')[0]);
    if (!recs.length) err(f, 'recommended_by is empty. Every note needs a source: link a note from Sources/.');
    for (const r of recs) {
      const hits = byBase.get(r);
      if (!hits) { err(f, `recommended_by links to [[${r}]], which does not exist. Create that Source note or fix the link.`); continue; }
      if (!hits.some(h => rel(h).startsWith(FOLDERS.source + '/'))) warn(f, `recommended_by [[${r}]] is not in ${FOLDERS.source}/`);
      else if (!wikilinks(read(hits[0])).includes(name)) warn(f, `the source [[${r}]] does not link back to [[${name}]]. Add it to the source's places list.`);
    }
  }

  // type-specific checks
  if (type === 'route') {
    const bases = fm.data.bases || [], nights = fm.data.nights_per_base || [];
    if (Array.isArray(bases) && Array.isArray(nights)) {
      if (bases.length !== nights.length) warn(f, `bases has ${bases.length} town(s) but nights_per_base has ${nights.length} number(s). They go in the same order, one number per town.`);
      if (nights.some(n => !/^\d+$/.test(String(n)))) warn(f, 'nights_per_base should be whole numbers, like [2, 3, 2]');
      else if (fm.data.total_nights && nights.length && nights.reduce((a, b) => a + Number(b), 0) !== Number(fm.data.total_nights)) {
        warn(f, `total_nights is ${fm.data.total_nights} but nights_per_base adds up to ${nights.reduce((a, b) => a + Number(b), 0)}`);
      }
    }
  }
  if (type === 'day') {
    const maxHrs = Number(transportLimit('max_hrs_per_day'));
    if (Number.isFinite(maxHrs) && maxHrs > 0 && Number(fm.data.drive_hrs) > maxHrs) {
      warn(f, `drive_hrs ${fm.data.drive_hrs} is over the daily limit of ${maxHrs} hours in the Transport note`);
    }
    dayChecks(f, fm.data, fm.body);
  }
  if (type === 'source' && String(fm.data.processed) === 'true') {
    for (const l of new Set(wikilinks(fm.body))) if (!resolves(l)) warn(f, `marked processed, but [[${l}]] has no note yet`);
    const open = fm.body.replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(l => /^\s*- \[ \]\s*\S/.test(l) && !/^\s*- \[ \]\s*(\[\[\s*\]\])\s*$/.test(l));
    if (open.length) warn(f, `marked processed, but ${open.length} checklist line(s) are not ticked, e.g. "${open[0].trim().slice(0, 60)}". Tick them, or set processed: false`);
  }

  // links and headings
  for (const l of new Set(wikilinks(text))) {
    if (!resolves(l)) warn(f, `unresolved link [[${l}]]. Create the note, or fix the link.`);
  }
  if (!/^# .+/m.test(fm.body)) warn(f, 'no H1 heading (a line starting with "# ")');
  else if (!fm.body.match(/^# (.+)$/m)[1].includes(name.replace(/\s*\(.*\)$/, ''))) warn(f, 'the H1 heading does not match the file name');
  if (/\{\{(title|date|time)\}\}/.test(text)) err(f, 'a template placeholder like {{title}} was not replaced with real text');
}

// Day notes: sun times and the daylight arithmetic must agree with each other.
function dayChecks(f, d, body = '') {
  const clock = v => /^\d{1,2}:\d{2}$/.test(String(v)) ? Number(String(v).split(':')[0]) * 60 + Number(String(v).split(':')[1]) : null;
  const times = {};
  for (const k of ['early_start', 'sunrise', 'sunset']) {
    if (d[k] == null || d[k] === '') continue;
    times[k] = clock(d[k]);
    if (times[k] === null) warn(f, `${k} "${d[k]}" should be a local time like "06:30" (in quotes)`);
  }
  if (times.early_start != null && times.sunrise != null && times.early_start >= times.sunrise) {
    warn(f, `early_start ${d.early_start} is not before sunrise ${d.sunrise}. Leave early_start empty on a day that starts after sunrise`);
  }
  if (Number(d.predawn_hrs) > 0 && !d.early_start) warn(f, 'predawn_hrs is set but early_start is empty. Say when the day starts');
  if (times.sunrise != null && times.sunset != null && d.daylight_hrs && times.sunset > times.sunrise
      && Math.abs((times.sunset - times.sunrise) / 60 - Number(d.daylight_hrs)) > 0.3) {
    warn(f, `daylight_hrs ${d.daylight_hrs} does not match sunrise ${d.sunrise} to sunset ${d.sunset}. daylight_hrs is real daylight, not the length of the day`);
  }
  const num = v => (v === null || v === undefined || v === '' ? 0 : Number(v));
  if (d.daylight_hrs && Number.isFinite(num(d.drive_hrs) + num(d.activity_hrs) + num(d.predawn_hrs))) {
    const slack = Number(d.daylight_hrs) - (num(d.drive_hrs) + num(d.activity_hrs) - num(d.predawn_hrs));
    if (slack < -0.05) warn(f, `drive_hrs + activity_hrs are ${(-slack).toFixed(1)} hrs more than the daylight. Cut or move something, or split the day (verdict: too much)`);
  }
  afterDarkChecks(f, d, body, times.sunset);
}

// After dark. The Schedule says when things happen; the Legs table says which roads are bad at night.
// Only what can be read reliably is checked: Schedule rows that START after sunset (a row's time is the first
// cell, "HH:MM"). A leg has no time of its own, so an `avoid` leg counts as after sunset only when a Schedule row
// after sunset mentions a driving word (drive, leave, depart, return, transfer) and the leg's From or To town.
// A stay that starts before sunset and runs past it is not caught.
function afterDarkChecks(f, d, body, sunset) {
  const section = title => {
    const m = body.replace(/<!--[\s\S]*?-->/g, '').match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
    return m ? m[1] : null;
  };
  const rows = text => (text || '').split(/\r?\n/).filter(l => /^\s*\|/.test(l))
    .map(l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim()))
    .filter(r => !r.every(c => /^:?-+:?$/.test(c)));
  const plain = s => s.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').trim();

  const legs = rows(section('Legs'));
  const head = (legs[0] || []).map(c => c.toLowerCase());
  const darkCol = head.indexOf('after dark'), fromCol = head.indexOf('from'), toCol = head.indexOf('to');
  const avoidLegs = [];
  if (darkCol >= 0) {
    for (const r of legs.slice(1)) {
      const v = (r[darkCol] || '').toLowerCase();
      if (v && v !== 'ok' && v !== 'avoid') warn(f, `Legs table: After dark "${r[darkCol]}" should be ok or avoid`);
      if (v === 'avoid') avoidLegs.push({ from: plain(r[fromCol] || ''), to: plain(r[toCol] || '') });
    }
  }

  const bends = Number(d.rule_bends);
  const listed = (section('Choices that bend the rules') || '').split(/\r?\n/).filter(l => /^\s*- \*\*/.test(l)).length;
  if (d.rule_bends !== null && d.rule_bends !== undefined && d.rule_bends !== '' && Number.isFinite(bends) && bends !== listed) {
    warn(f, `rule_bends is ${d.rule_bends} but "Choices that bend the rules" lists ${listed}. Make them match`);
  }

  const sunsetMin = sunset;
  if (sunsetMin == null || bends > 0) return;
  const toMin = s => { const m = String(s).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hits = new Set();
  for (const r of rows(section('Schedule')).slice(1)) {
    const at = toMin(r[0]);
    if (at == null || at <= sunsetMin) continue;
    const text = r.slice(1).join(' ');
    for (const l of wikilinks(text)) {
      const loc = locationNote(l);
      if (loc?.data.after_dark === 'avoid') hits.add(`[[${l}]] is scheduled at ${r[0]}, after sunset (${d.sunset}), but it is marked after_dark: avoid`);
    }
    if (/\b(driv\w*|leav\w*|depart\w*|return\w*|transfer\w*)\b/i.test(text)) {
      for (const leg of avoidLegs) {
        const lower = plain(text).toLowerCase();
        if ([leg.from, leg.to].some(n => n && lower.includes(n.toLowerCase()))) {
          hits.add(`the leg ${leg.from} to ${leg.to} is marked After dark: avoid, and the Schedule has a drive at ${r[0]}, after sunset (${d.sunset})`);
        }
      }
    }
  }
  for (const h of hits) warn(f, `${h}, and rule_bends is ${Number.isFinite(bends) ? bends : 0}. Move it before sunset, or if the group chooses it, write it under "Choices that bend the rules" and set rule_bends`);
}
function locationNote(name) {
  locationNote.cache ||= new Map();
  if (!locationNote.cache.has(name)) {
    const p = (byBase.get(name) || []).find(x => x.endsWith('.md') && rel(x).startsWith(FOLDERS.location + '/'));
    locationNote.cache.set(name, p ? parseFrontmatter(read(p)) : null);
  }
  return locationNote.cache.get(name);
}

function transportLimit(key) {
  if (transportLimit.cache === undefined) {
    transportLimit.cache = {};
    for (const p of mdFiles.filter(p => path.dirname(rel(p)) === (FOLDERS.transport || ''))) {
      const fm = parseFrontmatter(read(p));
      if (fm?.data.type === 'transport') Object.assign(transportLimit.cache, Object.fromEntries(Object.entries(fm.data).filter(([, v]) => v)));
    }
  }
  return transportLimit.cache[key];
}

// ---------- vault-wide checks ----------
if (!explicit) {
  for (const [b, ps] of byBase) {
    // Templates share names with the notes made from them (e.g. Route), which is fine.
    const md = ps.filter(p => p.endsWith('.md') && !rel(p).startsWith('Templates/'));
    if (md.length > 1) errors.push(`duplicate note name "${b}": ${md.map(rel).join(', ')}. Links need unique names; rename one.`);
  }
  for (const p of mdFiles.filter(p => path.dirname(p) === VAULT && !['00 Home.md', 'trip.md'].includes(path.basename(p)))) {
    const size = fs.statSync(p).size;
    if (size) warnings.push(`${rel(p)}: a note in the vault root (only "00 Home.md" and "trip.md" belong there). If it is a place, stay or day, move it to its folder; if it is your own note, leave it`);
    else errors.push(`${rel(p)}: an EMPTY note in the vault root. It was created by clicking a link before its note existed. Safe to delete`);
  }
  // aliases that collide with another note's name
  for (const f of targets) {
    const fm = parseFrontmatter(read(f));
    for (const a of (Array.isArray(fm?.data.aliases) ? fm.data.aliases : [])) {
      if (allNames.has(a) && a !== path.basename(f, '.md')) warnings.push(`${rel(f)}: alias "${a}" is also another note's name. Links to it will be ambiguous`);
    }
  }
}

if (droppedNoReason.length) warnings.push(`dropped without a decision_reason (${droppedNoReason.length}): ${droppedNoReason.join(', ')}. Add a short reason to each`);
console.log(`Checked ${targets.length} note(s) in ${VAULT}`);
console.log(`\nERRORS (${errors.length})`); errors.forEach(e => console.log('  ✗ ' + e));
console.log(`\nWARNINGS (${warnings.length})`); warnings.forEach(w => console.log('  ! ' + w));
if (errors.length) console.log('\nFix the errors first. Warnings are worth a look but do not block anything.');
process.exit(errors.length ? 1 : 0);
