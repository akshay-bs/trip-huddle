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
//   trip.md (optional) map_box, regions, decision_values, folders (a map of note type to folder) and
//                      planning_limits (slack_ok_hrs is the "ok" threshold of the travel_verdict check) and road_cutoffs
//                      (a Day note leg in a cutoff area driven after its time, with no rule bend written down, is warned about).
//   Logistics/legs.json (optional) the shared distance file of the build-itinerary skill: its links are checked for shape.
import fs from 'node:fs';
import path from 'node:path';
import { TOO_MUCH_BELOW_HRS } from '../skills/plan-day/scripts/sun.mjs';   // the slack verdict thresholds
import { loadPlanningLimits, stageProblems, loadRoadCutoffs, cutoffFor } from './trip-settings.mjs';
import { linkProblems, dayByDay } from '../skills/build-itinerary/scripts/route.mjs';

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
const FOLDERS = { location: 'Locations', stay: 'Stays', day: 'Itinerary', source: 'Sources', comparison: 'Sources', decision: 'Decisions', food: 'Food', route: 'Itinerary', transport: 'Logistics', booking: 'Bookings', itinerary: 'Itinerary', brief: 'Itinerary' };
const DECISION_STATUSES = ['open', 'decided', 'locked'];   // see decisionChecks
// The booking list (see bookingChecks): the fields every bookable note has, the folder for vouchers, and what counts as booked.
const BOOKING_FIELDS = ['booking_status', 'cost_agreed', 'advance_paid', 'balance_pending', 'confirmation'];
const CONFIRMATIONS = 'Confirmations';   // vouchers, tickets and pasted emails; not checked as notes
const BOOKED = ['booked', 'paid'];
const planning = loadPlanningLimits(VAULT);   // the defaults, changed by planning_limits in trip.md
const roadCutoffs = loadRoadCutoffs(VAULT);   // areas where nobody drives after a set time (valid entries only)
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
for (const p of planning.problems) warnings.push(`trip.md: ${p}. The default is used instead`);
for (const p of stageProblems(trip.stage)) warnings.push(`trip.md: ${p}`);
for (const p of roadCutoffs.problems) warnings.push(`trip.md: ${p}. That cutoff is not used until it is fixed`);
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
  // A place carries the booking fields only when needs_booking is true (bookingChecks says when they are missing or stray).
  const optional = type === 'location' ? BOOKING_FIELDS : [];
  const extra = fm.keys.filter(k => !t.keys.includes(k) && !optional.includes(k));
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
    if (type === 'decision' && k === 'status') continue;   // decisionChecks makes a bad status an error
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
    routeDayChecks(f, fm.data, text);
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
  if (type === 'comparison') comparisonChecks(f, fm.data);
  if (type === 'itinerary' || type === 'brief') itineraryChecks(f, type, fm.data, fm.body);
  if (type === 'decision') decisionChecks(f, fm.data);
  if (['stay', 'transport', 'location', 'booking'].includes(type)) bookingChecks(f, type, fm.data, name);
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

// Comparison notes (compare-itineraries): 2 or more options, each a Source or Route note; a decided comparison names
// the option that was chosen, and the choice is one of the options.
function comparisonChecks(f, d) {
  const linkName = v => String(v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
  const has = v => v !== null && v !== undefined && v !== '' && linkName(v) !== '';
  const options = (Array.isArray(d.options) ? d.options : []).map(linkName).filter(Boolean);
  if (options.length < 2) err(f, `options needs 2 or more links to the Source or Route notes being compared, found ${options.length}`);
  if (new Set(options).size < options.length) warn(f, 'options lists the same note twice');
  for (const o of options) {
    const hits = byBase.get(o);
    if (!hits) continue;   // an unresolved link is reported with the other links
    const types = hits.map(p => parseFrontmatter(read(p))?.data.type);
    if (!types.some(t => t === 'source' || t === 'route')) warn(f, `option [[${o}]] is not a Source or Route note`);
  }
  if (has(d.recommended) && !options.includes(linkName(d.recommended))) warn(f, `recommended [[${linkName(d.recommended)}]] is not one of the options`);
  const decided = String(d.status) === 'decided';
  if (has(d.decided_option) && !options.includes(linkName(d.decided_option))) err(f, `decided_option [[${linkName(d.decided_option)}]] is not one of the options`);
  if (has(d.decided_option) && !decided) warn(f, `decided_option is set but status is "${d.status ?? ''}". Set status: decided, or clear decided_option`);
  if (decided && !has(d.decided_option)) warn(f, 'status is decided but decided_option is empty. Say which option the group chose');
}

// Decision notes (group-decisions): the status is one of three, the chosen option is one of the options and only exists
// once decided, and a locked decision says what locked it. A locked decision is a hard rule, so the few conflicts that can
// be read reliably are warnings: a chosen stay or place that is not selected, a route that is not agreed, a dropped note
// the decision affects, and fixed dates while trip.md says the dates are flexible.
function decisionChecks(f, d) {
  const linkTarget = v => { const m = String(v ?? '').trim().match(/^\[\[([^\]]*)\]\]$/); return m ? m[1].split('|')[0].split('#')[0].trim() : null; };
  const plain = v => linkTarget(v) ?? String(v ?? '').trim();
  const has = v => v !== null && v !== undefined && String(v).trim() !== '';
  const list = v => (Array.isArray(v) ? v : has(v) ? [v] : []);
  const status = String(d.status ?? '');
  if (!DECISION_STATUSES.includes(status)) err(f, `status "${status}" must be one of: ${DECISION_STATUSES.join(' | ')}`);
  if (!has(d.question)) warn(f, 'question is empty. Write what the group has to decide');
  const options = list(d.options).map(plain).filter(Boolean);
  if (new Set(options).size < options.length) warn(f, 'options lists the same choice twice');
  const chosen = has(d.decided_option);
  if (chosen && !options.includes(plain(d.decided_option))) err(f, `decided_option "${plain(d.decided_option)}" is not one of the options`);
  if (chosen && status === 'open') err(f, 'decided_option is set but status is open. Set status: decided, or clear decided_option');
  if ((status === 'decided' || status === 'locked') && !chosen) err(f, `status is ${status} but decided_option is empty. Say which option the group chose`);
  if (status === 'locked' && !has(d.locked_by)) err(f, 'status is locked but locked_by is empty. Say what made it fixed, for example "flights booked"');
  if (status === 'locked' && !list(d.locks).length) warn(f, 'locked, but locks is empty. Say what it fixes (dates, stay, vehicle, ...)');
  if ((status === 'decided' || status === 'locked') && !has(d.decision_reason)) warn(f, `${status} with no decision_reason. Add a few words on why`);
  if (status !== 'locked') return;

  // conflicts with a locked decision
  const noteOf = name => { const p = (byBase.get(name) || []).find(x => x.endsWith('.md') && !rel(x).startsWith('Templates/')); return p ? parseFrontmatter(read(p)) : null; };
  const target = linkTarget(d.decided_option) && noteOf(linkTarget(d.decided_option));
  if (target && (target.data.type === 'stay' || target.data.type === 'location') && target.data.decision !== 'selected') {
    warn(f, `locked on [[${linkTarget(d.decided_option)}]], but that ${target.data.type === 'stay' ? 'stay' : 'place'} is "${target.data.decision ?? ''}", not selected. Select it (the group's call), or unlock this decision`);
  }
  if (target && target.data.type === 'route' && !['agreed', 'booked'].includes(String(target.data.status))) {
    warn(f, `locked on the route [[${linkTarget(d.decided_option)}]], but that Route note is "${target.data.status ?? ''}". A locked route should be agreed or booked`);
  }
  for (const a of list(d.affects).map(linkTarget).filter(Boolean)) {
    const n = noteOf(a);
    if (n?.data.decision === 'dropped') warn(f, `affects [[${a}]], which the group dropped. A locked decision cannot rest on a dropped note: unlock it, or take the link out`);
  }
  const by = linkTarget(d.locked_by);
  if (by) {
    const n = noteOf(by);
    if (!n) warn(f, `locked_by links to [[${by}]], which does not exist. Link the booked note, or say in words what fixed it`);
    else if (!BOOKED.includes(String(n.data.booking_status))) warn(f, `locked_by links to [[${by}]], but that is not booked or paid (booking_status "${n.data.booking_status ?? ''}"). Book it, or unlock this decision`);
  }
  if (list(d.locks).includes('dates') && String(trip.dates_fixed) === 'false') {
    warn(f, 'locks the dates, but dates_fixed is false in trip.md. Set dates_fixed to true (run trip-init settings), or unlock this decision');
  }
}

// The booking list (group-decisions): a selected Stay or Transport note, a selected place with needs_booking: true, and every
// note in Bookings/ carry the same booking fields. Warnings only: a booking with no confirmation linked, amounts that do not
// add up, a booking on something the group no longer has selected, a booked item whose Decision is not locked, and a place
// whose booking fields do not match needs_booking.
function bookingChecks(f, type, d, name) {
  const has = v => v !== null && v !== undefined && String(v).trim() !== '';
  const num = v => (has(v) && /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : null);
  if (type === 'location') {
    const needs = String(d.needs_booking) === 'true';
    const present = BOOKING_FIELDS.filter(k => k in d);
    if (needs && present.length < BOOKING_FIELDS.length) warn(f, `needs_booking is true but the booking fields are missing: ${BOOKING_FIELDS.filter(k => !(k in d)).join(', ')}. Add them right after needs_booking`);
    if (!needs && present.length) warn(f, `has booking fields (${present.join(', ')}) but needs_booking is not true. Set needs_booking: true, or take them out`);
    if (!needs) return;
  }
  const status = String(d.booking_status ?? '');
  const booked = BOOKED.includes(status);
  if (booked && !has(d.confirmation)) warn(f, `booked, no confirmation yet. Link the voucher, slip or email in confirmation (keep the file in ${CONFIRMATIONS}/)`);
  const cost = num(d.cost_agreed), adv = num(d.advance_paid), bal = num(d.balance_pending);
  if (status === 'paid' && bal > 0) warn(f, `paid, but balance_pending is ${bal}. Set it to 0 once the balance is settled, or set booking_status: booked`);
  if (cost !== null && adv !== null && bal !== null && Math.abs(adv + bal - cost) > 0.005) warn(f, `advance_paid (${adv}) + balance_pending (${bal}) is not cost_agreed (${cost}). Check the amounts`);
  const conf = String(d.confirmation ?? '').trim().match(/^\[\[([^\]]*)\]\]$/)?.[1].split('|')[0].trim();
  if (conf && resolves(conf)) {
    const inFolder = conf.startsWith(CONFIRMATIONS + '/') || (byBase.get(conf) || byBase.get(conf + '.md') || []).some(p => rel(p).startsWith(CONFIRMATIONS + '/'));
    if (!inFolder) warn(f, `confirmation [[${conf}]] is not in ${CONFIRMATIONS}/. Keep vouchers and emails there`);
  }
  if (!booked) return;
  if (type !== 'booking' && d.decision !== 'selected') warn(f, `${status}, but the group has it as "${d.decision ?? ''}", not selected. Select it again, or cancel the booking (booking_status: cancelled)`);
  const mine = decisionsFor(name);
  if (mine.length && !mine.some(x => x.status === 'locked')) warn(f, `${status}, but its decision ${mine.map(x => `[[${x.name}]]`).join(', ')} is not locked. Booking it locks the decision: lock it (group-decisions)`);
}
// The Decision notes an item belongs to: the decided_option links to it, or (when the chosen option is plain words, or
// nothing is chosen yet) affects lists it.
function decisionsFor(name) {
  if (!decisionsFor.all) {
    const lt = v => String(v ?? '').trim().match(/^\[\[([^\]]*)\]\]$/)?.[1].split('|')[0].split('#')[0].trim() ?? null;
    decisionsFor.all = mdFiles.filter(p => !rel(p).startsWith('Templates/')).map(p => ({ p, fm: parseFrontmatter(read(p)) }))
      .filter(x => x.fm?.data.type === 'decision').map(({ p, fm }) => ({
        name: path.basename(p, '.md'), status: String(fm.data.status ?? ''), chosen: lt(fm.data.decided_option),
        chosenText: fm.data.decided_option, affects: (Array.isArray(fm.data.affects) ? fm.data.affects : []).map(lt).filter(Boolean),
      }));
  }
  return decisionsFor.all.filter(x => x.chosen === name || (!x.chosen && x.affects.includes(name)));
}

// Day notes: sun times and the daylight arithmetic must agree with each other.
function dayChecks(f, d, body = '') {
  const clock = v => /^\d{1,2}:\d{2}$/.test(String(v)) ? Number(String(v).split(':')[0]) * 60 + Number(String(v).split(':')[1]) : null;
  const times = {};
  for (const k of ['start_time', 'early_start', 'sunrise', 'sunset']) {
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
  travelChecks(f, d);
  afterDarkChecks(f, d, body, times.sunset);
  cutoffChecks(f, d, body);
}

// The travel-time check (review-travel-times). Its verdict allows for stops, road types and local reports, so it should
// never be kinder than the slack verdict, which the Itinerary base computes from the same drive_hrs. If it is, the check
// is out of date (the day changed after it) or was written wrong.
function travelChecks(f, d) {
  const has = v => v !== null && v !== undefined && v !== '';
  if (has(d.travel_verdict) && !has(d.travel_checked)) warn(f, 'travel_verdict is set but travel_checked is empty. Say on which date the drive times were checked');
  if (has(d.travel_checked) && !has(d.travel_verdict)) warn(f, 'travel_checked is set but travel_verdict is empty');
  if (!has(d.travel_verdict) || !d.daylight_hrs) return;
  const rank = { ok: 0, tight: 1, 'too much': 2 };
  if (!(String(d.travel_verdict) in rank)) return;   // a bad value is reported by the value-list check
  const n = v => (has(v) ? Number(v) : 0);
  const slack = Math.round((Number(d.daylight_hrs) - (n(d.drive_hrs) + n(d.activity_hrs) - n(d.predawn_hrs))) * 10) / 10;
  if (!Number.isFinite(slack)) return;
  const slackVerdict = slack < TOO_MUCH_BELOW_HRS ? 'too much' : slack < planning.limits.slack_ok_hrs ? 'tight' : 'ok';
  if (rank[d.travel_verdict] < rank[slackVerdict]) {
    warn(f, `travel_verdict is "${d.travel_verdict}", but the day's slack (${slack} hrs) gives "${slackVerdict}". The travel check is out of date: the day changed after it, or the drive times were not updated. Run the travel-time check again`);
  }
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
// Road cutoffs (road_cutoffs in trip.md). A leg is in a cutoff area when its From or To is that area (a town), or a place or
// stay whose nearest_base or base_town is that area, or when Logistics/legs.json puts the link in it. As with after dark,
// only what can be read reliably is checked: a Schedule row that starts after the cutoff time, with a driving or arriving
// word and the leg's From or To, counts as that leg ending after the cutoff. Unagreed, it makes the day "too much" (the
// travel check gives the same); written down as a rule bend, the day is "tight (1 rule bend)" and there is no warning.
function cutoffChecks(f, d, body) {
  const cuts = roadCutoffs.cutoffs;
  const bends = Number(d.rule_bends);
  if (!cuts.length || bends > 0) return;
  const section = title => { const m = body.replace(/<!--[\s\S]*?-->/g, '').match(new RegExp(`^## ${title}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')); return m ? m[1] : null; };
  const rows = text => (text || '').split(/\r?\n/).filter(l => /^\s*\|/.test(l))
    .map(l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim())).filter(r => !r.every(c => /^:?-+:?$/.test(c)));
  const plain = s => s.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').trim();
  const legs = rows(section('Legs'));
  const head = (legs[0] || []).map(c => c.toLowerCase());
  const fromCol = head.indexOf('from'), toCol = head.indexOf('to');
  if (fromCol < 0 || toCol < 0) return;
  const hits = new Set();
  for (const r of legs.slice(1)) {
    const ends = [plain(r[fromCol] || ''), plain(r[toCol] || '')].filter(Boolean);
    if (ends.length < 2) continue;
    const link = legsFile().links.find(l => [l.from, l.to].map(x => String(x).toLowerCase()).sort().join('|') === ends.map(x => x.toLowerCase()).sort().join('|'));
    const cut = cutoffFor(cuts, link?.cutoff_area) || ends.map(n => cutoffFor(cuts, n) || cutoffFor(cuts, noteArea(n))).find(Boolean);
    if (!cut) continue;
    for (const s of rows(section('Schedule')).slice(1)) {
      const at = (String(s[0]).match(/^(\d{1,2}):(\d{2})/) || []).slice(1).map(Number);
      if (at.length !== 2 || at[0] * 60 + at[1] <= cut.min) continue;
      const text = plain(s.slice(1).join(' ')).toLowerCase();
      if (/\b(driv\w*|leav\w*|depart\w*|return\w*|transfer\w*|arriv\w*)\b/.test(text) && ends.some(n => text.includes(n.toLowerCase()))) {
        hits.add(`the leg ${ends[0]} to ${ends[1]} is in the ${cut.area} area, where nobody drives after ${cut.no_drive_after}${cut.reason ? ` (${cut.reason})` : ''}, and the Schedule has it at ${s[0]}`);
      }
    }
  }
  for (const h of hits) warn(f, `${h}, and rule_bends is ${Number.isFinite(bends) ? bends : 0}. Unless the group agrees to it as a rule bend, that makes the day too much, even a minute over. Drive it before ${cutoffFor(cuts, h.match(/in the (.*?) area/)[1]).no_drive_after}, or if the group chooses it, write it under "Choices that bend the rules" and set rule_bends`);
}
// The base town of a place or stay note (nearest_base or base_town), or null.
function noteArea(name) {
  const p = (byBase.get(name) || []).find(x => x.endsWith('.md') && !rel(x).startsWith('Templates/'));
  if (!p) return null;
  const d = parseFrontmatter(read(p))?.data || {};
  return d.nearest_base || d.base_town || null;
}
// Logistics/legs.json, the shared distance file (build-itinerary). An empty file when there is none or it can't be read.
function legsFile() {
  if (legsFile.cache) return legsFile.cache;
  const p = path.join(VAULT, FOLDERS.transport || 'Logistics', 'legs.json');
  legsFile.cache = { links: [], exists: fs.existsSync(p), path: p };
  if (!legsFile.cache.exists) return legsFile.cache;
  try { const j = JSON.parse(read(p)); legsFile.cache = { ...legsFile.cache, links: Array.isArray(j.links) ? j.links : [], json: j }; }
  catch (e) { legsFile.cache.error = e.message; }
  return legsFile.cache;
}

// Route notes (build-itinerary): the Day by day table has one row per night plus the last day, and its nights per town, in
// order, match bases and nights_per_base. A Route with no filled Day by day table is not checked here.
function routeDayChecks(f, d, text) {
  const days = dayByDay(text);
  if (!days || !days.length) return;
  const nights = (Array.isArray(d.nights_per_base) ? d.nights_per_base : []).map(Number);
  const total = Number.isFinite(Number(d.total_nights)) && d.total_nights !== null && d.total_nights !== '' ? Number(d.total_nights) : nights.reduce((a, b) => a + b, 0);
  if (Number.isFinite(total) && total > 0 && days.length !== total + 1) warn(f, `Day by day has ${days.length} row(s), but ${total} nights need ${total + 1} (one per night, plus the last day)`);
  const plain = s => s.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').trim();
  const runs = [];
  for (const r of days) {
    const n = plain(r.night);
    if (!n || /^[-–—]+$/.test(n) || /^(none|fly home|home|departure)$/i.test(n)) continue;
    const town = noteArea(n) && (byBase.get(n) || []).some(p => rel(p).startsWith(FOLDERS.stay + '/')) ? noteArea(n) : n;
    const last = runs[runs.length - 1];
    if (last && last.town.toLowerCase() === town.toLowerCase()) last.nights++; else runs.push({ town, nights: 1 });
  }
  const bases = (Array.isArray(d.bases) ? d.bases : []).map(String);
  const want = bases.map((b, i) => `${b} ${nights[i] ?? '?'}`).join(', '), got = runs.map(r => `${r.town} ${r.nights}`).join(', ');
  if (bases.length && want.toLowerCase() !== got.toLowerCase()) warn(f, `the nights in Day by day (${got || 'none'}) do not match bases and nights_per_base (${want}). Make them agree`);
}

// The Trip itinerary and the Operator brief (build-itinerary): for the chosen route they link every Day note; they never
// link a place, stay or food spot the group dropped; a brief holds no food choices, bookings or confirmations.
function itineraryChecks(f, type, d, body) {
  const links = new Set(wikilinks(body));
  const route = String(d.route ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
  const routeNote = route ? (byBase.get(route) || []).find(p => p.endsWith('.md')) : null;
  const routeStatus = routeNote ? String(parseFrontmatter(read(routeNote))?.data.status ?? '') : '';
  if (route && !routeNote) warn(f, `route links to [[${route}]], which does not exist`);
  if (!route || ['agreed', 'booked'].includes(routeStatus)) {
    const dayNotes = mdFiles.filter(p => path.dirname(rel(p)) === FOLDERS.day && parseFrontmatter(read(p))?.data.type === 'day').map(p => path.basename(p, '.md'));
    const missing = dayNotes.filter(n => !links.has(n));
    if (missing.length) warn(f, `does not link ${missing.length} Day note(s): ${missing.map(n => `[[${n}]]`).join(', ')}. ${type === 'brief' ? 'The brief' : 'The itinerary'} covers every day; rebuild it from the Day notes`);
  }
  for (const l of links) {
    const p = (byBase.get(l) || []).find(x => x.endsWith('.md') && !rel(x).startsWith('Templates/'));
    if (!p) continue;
    const n = parseFrontmatter(read(p))?.data || {};
    if (n.decision === 'dropped') warn(f, `links [[${l}]], which the group dropped. Rebuild it from the Day notes, or take the link out`);
    if (type === 'brief' && (n.type === 'food' || n.type === 'booking' || rel(p).startsWith(CONFIRMATIONS + '/'))) warn(f, `links [[${l}]]. An operator brief holds no food choices, bookings or confirmations: take it out`);
  }
  if (type === 'brief' && /\b(booking_ref|confirmation)\b/i.test(body.replace(/<!--[\s\S]*?-->/g, ''))) warn(f, 'mentions a booking reference or confirmation. An operator brief never holds them: take it out');
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
    // The selected vehicle's limits; with none selected, every Transport note's (an older vault has one, with no decision).
    const notes = mdFiles.filter(p => path.dirname(rel(p)) === (FOLDERS.transport || '')).map(p => parseFrontmatter(read(p))?.data).filter(d => d?.type === 'transport');
    const selected = notes.filter(d => d.decision === 'selected');
    for (const d of selected.length ? selected : notes) Object.assign(transportLimit.cache, Object.fromEntries(Object.entries(d).filter(([, v]) => v)));
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

// The shared distance file: readable, and each link well formed (warnings; the scripts refuse a bad link anyway).
if (!explicit && legsFile().exists) {
  const lf = legsFile(), name = rel(lf.path);
  if (lf.error) warnings.push(`${name}: can't be read (${lf.error}). Fix it, or delete it and run build-itinerary's route.mjs links again`);
  else {
    const bad = lf.links.flatMap(linkProblems);
    if (bad.length) warnings.push(`${name}: ${bad.length} problem(s) in the links, e.g. ${bad.slice(0, 3).join('; ')}`);
    const seen = new Set(), twice = [];
    for (const l of lf.links) { const k = [l.from, l.to].map(x => String(x).toLowerCase()).sort().join('|'); if (seen.has(k)) twice.push(`${l.from} – ${l.to}`); seen.add(k); }
    if (twice.length) warnings.push(`${name}: the same road is listed twice: ${twice.join(', ')}. Keep one link per pair (a link works both ways)`);
  }
}
if (droppedNoReason.length) warnings.push(`dropped without a decision_reason (${droppedNoReason.length}): ${droppedNoReason.join(', ')}. Add a short reason to each`);
console.log(`Checked ${targets.length} note(s) in ${VAULT}`);
console.log(`\nERRORS (${errors.length})`); errors.forEach(e => console.log('  ✗ ' + e));
console.log(`\nWARNINGS (${warnings.length})`); warnings.forEach(w => console.log('  ! ' + w));
if (errors.length) console.log('\nFix the errors first. Warnings are worth a look but do not block anything.');
process.exit(errors.length ? 1 : 0);
