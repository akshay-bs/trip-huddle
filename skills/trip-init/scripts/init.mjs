#!/usr/bin/env node
// trip-init: set up a trip-huddle vault from an answers file, or update an existing vault's settings.
//
//   node init.mjs --answers <file.json> [--vault <folder>] [--reconfigure [--add-food]]
//
// New vault (default): copies vault-template into the folder (empty or missing), then fills it in.
// --reconfigure: the folder already has trip.md. Rewrites trip.md, the per-trip values in Templates
// and Bases, the field packs and the Trip facts in 00 Home.md. Notes are never touched.
// --add-food (with --reconfigure, for a vault made before 0.9.0): adds the restaurants and cafes category: the Food/ folder,
// Bases/Food.base, the new Food Spot template, the Source template's food checklist, the types, and a "Food to decide"
// section on 00 Home.md. It only adds; notes are never touched. The skill asks the user before using it.
// The per-trip values ("slots") are listed in ../slots.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsProblems } from '../../review-travel-times/scripts/travel.mjs';
import { tripSetting, PLANNING_LIMIT_DEFAULTS, planningLimitsProblems } from '../../../scripts/trip-settings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const PLUGIN = path.resolve(SKILL, '../..');
const TEMPLATE_VAULT = path.join(PLUGIN, 'vault-template');

// ---------- arguments ----------
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const RECONF = args.includes('--reconfigure');
const ADD_FOOD = args.includes('--add-food');
const VAULT = path.resolve(opt('--vault') || process.cwd());
const ANSWERS = opt('--answers');
const die = m => { console.error(`trip-init: ${m}`); process.exit(1); };
if (!ANSWERS) die('missing --answers <file.json>');
if (ADD_FOOD && !RECONF) die('--add-food only works with --reconfigure (a new vault already has the Food category)');

// ---------- the answers ----------
// Property order and defaults, the same as vault-template/trip.md.
const DEFAULTS = {
  schema_version: '0.2', trip_name: '', destination: '', start_date: '', end_date: '', dates_fixed: false,
  arrival: '', departure: '', travellers: '', cost_split_units: 1, cost_split_label: 'person',
  traveller_notes: '', pace: '', food_needs: '', group_vehicle: '', currency: '', currency_symbol: '',
  season: '', daylight_hrs: 10, day_start: '08:00', sunset: '18:00', regions: [], bases: [], evening_bases: [],
  categories: ['viewpoint', 'nature', 'old-town', 'museum', 'market', 'food', 'activity', 'beach', 'hike'],
  map_box: null, field_packs: [], planning_limits: PLANNING_LIMIT_DEFAULTS,
};
let raw;
try { raw = JSON.parse(fs.readFileSync(path.resolve(ANSWERS), "utf8")); }
catch (e) { die(`can't read the answers file ${ANSWERS}: ${e.message}`); }
const A = { ...DEFAULTS, ...raw, schema_version: '0.2' };
// planning_limits: the defaults, then what trip.md has now (on --reconfigure), then what the answers give.
// Anything left out keeps its current value, so changing one limit never resets the others.
let nowLimits;
try {
  const old = RECONF && fs.existsSync(path.join(VAULT, 'trip.md')) ? fs.readFileSync(path.join(VAULT, 'trip.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '' : '';
  nowLimits = tripSetting(old, 'planning_limits');
} catch { nowLimits = undefined; }   // an unreadable old value is replaced by the defaults
const limitsOk = x => x && typeof x === 'object' && !Array.isArray(x) && !planningLimitsProblems(x).length;
A.planning_limits = { ...PLANNING_LIMIT_DEFAULTS, ...(limitsOk(nowLimits) ? nowLimits : {}), ...(raw.planning_limits && typeof raw.planning_limits === 'object' ? raw.planning_limits : {}) };

const problems = [];
const isTime = v => /^\d{2}:\d{2}$/.test(v);
const isDate = v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
if (!isTime(A.day_start)) problems.push('day_start must look like "08:00"');
if (!isTime(A.sunset)) problems.push('sunset must look like "18:00"');
if (!isDate(A.start_date) || !isDate(A.end_date)) problems.push('dates must look like 2027-06-05, or be ""');
if (!(Number(A.cost_split_units) >= 1)) problems.push('cost_split_units must be a number, 1 or more');
if (!(Number(A.daylight_hrs) > 0 && Number(A.daylight_hrs) <= 24)) problems.push('daylight_hrs must be a number between 0 and 24');
for (const k of ['regions', 'bases', 'evening_bases', 'categories', 'field_packs']) if (!Array.isArray(A[k])) problems.push(`${k} must be a list`);
if (Array.isArray(A.evening_bases) && Array.isArray(A.bases)) {
  const stray = A.evening_bases.filter(b => !A.bases.includes(b));
  if (stray.length) problems.push(`evening_bases must be towns from bases (not in bases: ${stray.join(', ')})`);
}
if (A.map_box) {
  const b = A.map_box, ks = ['lat_min', 'lat_max', 'lng_min', 'lng_max'];
  if (!ks.every(k => typeof b[k] === 'number')) problems.push('map_box needs numbers lat_min, lat_max, lng_min, lng_max');
  else if (b.lat_min >= b.lat_max || b.lng_min >= b.lng_max) problems.push('map_box minimums must be below the maximums');
}
// Optional travel settings, read by the review-travel-times skill (see ../slots.md). Left out of trip.md unless given.
problems.push(...settingsProblems(A.road_speeds, A.stop_buffer));
problems.push(...planningLimitsProblems(raw.planning_limits));   // a limit is a number; see PLANNING_LIMIT_DEFAULTS
const PACK_DIR = path.join(SKILL, 'field-packs');
const PACKS = Object.fromEntries(fs.readdirSync(PACK_DIR).filter(f => f.endsWith('.json'))
  .map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(PACK_DIR, f), 'utf8'))]));
for (const p of A.field_packs || []) if (!PACKS[p]) problems.push(`unknown field pack "${p}" (have: ${Object.keys(PACKS).join(', ')})`);
if (problems.length) die('the answers file has problems:\n  - ' + problems.join('\n  - '));
A.cost_split_units = Number(A.cost_split_units);
A.daylight_hrs = Number(A.daylight_hrs);
A.cost_split_label = String(A.cost_split_label || 'person').trim().toLowerCase();

// ---------- the folder ----------
const tripMd = path.join(VAULT, 'trip.md');
if (RECONF) {
  if (!fs.existsSync(tripMd)) die(`${VAULT} has no trip.md, so it isn't a trip-huddle vault. Run without --reconfigure to set one up.`);
} else {
  if (fs.existsSync(tripMd)) die(`${VAULT} already has trip.md. Use --reconfigure to change its settings.`);
  const existing = fs.existsSync(VAULT) ? fs.readdirSync(VAULT).filter(n => n !== '.claude') : [];
  const claudeExtra = fs.existsSync(path.join(VAULT, '.claude'))
    ? fs.readdirSync(path.join(VAULT, '.claude')).filter(n => n !== 'scratch') : [];
  if (existing.length || claudeExtra.length) die(`${VAULT} is not empty. Pick an empty or new folder for the vault.`);
  fs.cpSync(TEMPLATE_VAULT, VAULT, { recursive: true, force: false, errorOnExist: false,
    filter: src => path.basename(src) !== '.gitkeep' });
  for (const d of fs.readdirSync(TEMPLATE_VAULT, { withFileTypes: true })) if (d.isDirectory()) fs.mkdirSync(path.join(VAULT, d.name), { recursive: true });
}

const changed = new Set();
const read = rel => fs.readFileSync(path.join(VAULT, rel), 'utf8');
const write = (rel, text) => {
  const p = path.join(VAULT, rel);
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === text) return;
  fs.writeFileSync(p, text); changed.add(rel);
};

// ---------- trip.md ----------
const needsQuote = s => s === '' || /^[\s\-?:,\[\]{}#&*!|>'"%@`]|[:#]\s|:$|^\d{2}:\d{2}$|^(true|false|null|yes|no|~)$|^[\d.+-]+$/i.test(s) && !/^\d{4}-\d{2}-\d{2}$/.test(s);
const scalar = v => typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : v == null ? '' : needsQuote(String(v)) ? JSON.stringify(String(v)) : String(v);
const yamlValue = v => Array.isArray(v) ? `[${v.map(scalar).join(', ')}]`
  : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${k}: ${yamlValue(x)}`).join(', ')}}`
  : scalar(v);
const keys = [...Object.keys(DEFAULTS), ...Object.keys(A).filter(k => !(k in DEFAULTS))];
let front = keys.map(k => { const v = yamlValue(A[k]); return v === '' ? `${k}:` : `${k}: ${v}`; }).join('\n');
// Optional settings that people add by hand (read by scripts/validate.mjs and the review-travel-times skill):
// keep them when settings are rewritten, unless the answers give a new value.
const oldFront = fs.existsSync(tripMd) ? (fs.readFileSync(tripMd, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] || '') : '';
for (const k of ['decision_values', 'folders', 'road_speeds', 'stop_buffer']) {
  const m = k in A ? null : oldFront.match(new RegExp(`^${k}:.*(?:\\n[ \\t]+.*)*`, 'm'));
  if (m) front += '\n' + m[0];
}
const oldTrip = fs.existsSync(tripMd) ? fs.readFileSync(tripMd, 'utf8') : read('trip.md');
const body = oldTrip.replace(/^---\n[\s\S]*?\n---\n?/, '');
write('trip.md', `---\n${front}\n---\n${body}`);

// ---------- --add-food: bring a vault made before 0.9.0 up to the Food category ----------
if (ADD_FOOD) {
  const fromStarter = rel => fs.readFileSync(path.join(TEMPLATE_VAULT, rel), 'utf8');
  fs.mkdirSync(path.join(VAULT, 'Food'), { recursive: true });
  if (!fs.existsSync(path.join(VAULT, 'Bases/Food.base'))) write('Bases/Food.base', fromStarter('Bases/Food.base'));
  // The old Food Spot template had no kind, meal or scheduled_day. Replace it only when it is that old one; the price band
  // line is filled again below.
  if (!/^kind:/m.test(read('Templates/Food Spot.md'))) write('Templates/Food Spot.md', fromStarter('Templates/Food Spot.md'));
  edit('Templates/Source Itinerary.md', t => /## Restaurants and cafes mentioned/.test(t) ? t
    : sub(t, /(## Stays mentioned\n- \[ \] \[\[ \]\]\n)/, '$1\n## Restaurants and cafes mentioned\n- [ ] [[ ]]\n', 'the Stays mentioned list in the Source template'));
  edit('.obsidian/types.json', t => {   // kind and meal go just before cuisine, as in the starter vault
    const j = JSON.parse(t), types = {};
    for (const [k, v] of Object.entries(j.types)) {
      if (k === 'cuisine') for (const [a, b] of [['kind', 'text'], ['meal', 'multitext']]) if (!(a in j.types)) types[a] = b;
      types[k] = v;
    }
    return JSON.stringify({ ...j, types }, null, 2) + '\n';
  });
  edit('00 Home.md', t => /Food\.base#To decide/.test(t) || !/^## Stays to book$/m.test(t) ? t
    : t.replace(/^## Stays to book$/m, '## Food to decide\n![[Food.base#To decide]]\n\n## Stays to book'));
}

// ---------- slots (see ../slots.md) ----------
function edit(rel, fn) { const p = path.join(VAULT, rel); if (!fs.existsSync(p)) die(`missing ${rel}`); write(rel, fn(read(rel))); }
function sub(text, re, line, what) {
  if (!re.test(text)) die(`couldn't find ${what}. Was the file edited by hand? Compare it with vault-template.`);
  return text.replace(re, line);
}
// The FIELD GUIDE is the first <!-- ... --> comment after the frontmatter.
function guideRange(text, what) {
  const fm = text.indexOf('\n---', 4); const start = text.indexOf('<!--', fm); const end = text.indexOf('-->', start);
  if (fm < 0 || start < 0 || end < 0) die(`no FIELD GUIDE comment found while setting ${what}`);
  return [start, end];
}
// Replace a FIELD GUIDE line (inside that comment only).
function guideLine(text, key, line) {
  const [start, end] = guideRange(text, key);
  const g = sub(text.slice(start, end), new RegExp(`^${key}:.*$`, 'm'), line, `the ${key} line in the FIELD GUIDE`);
  return text.slice(0, start) + g + text.slice(end);
}
const list = (xs, open) => xs.length ? xs.join(' | ') + (open ? ' | …' : '') : null;
const sym = String(A.currency_symbol || '').trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

edit('Templates/Day Plan.md', t => {
  t = sub(t, /^daylight_hrs:.*$/m, `daylight_hrs: ${A.daylight_hrs}`, 'daylight_hrs (S1)');
  t = sub(t, /^\| \d{2}:\d{2} \| Breakfast \/ depart \|  \|$/m, `| ${A.day_start} | Breakfast / depart |  |`, 'the day start row (S2)');
  return sub(t, /^\| \d{2}:\d{2} \| Sunset \|  \|$/m, `| ${A.sunset} | Sunset |  |`, 'the sunset row (S3)');
});
edit('Templates/Location.md', t => {
  t = guideLine(t, 'state', list(A.regions, false) ? `state: ${list(A.regions, false)}` : 'state: region, state or province the place is in  (set your list at trip setup)');
  t = guideLine(t, 'nearest_base', list(A.bases, true) ? `nearest_base: ${list(A.bases, true)}` : 'nearest_base: base town you would stay in to visit this place  (set your list at trip setup)');
  return guideLine(t, 'category', `category: ${list(A.categories, true) || list(DEFAULTS.categories, true)}`);
});
edit('Templates/Stay.md', t => guideLine(t, 'base_town',
  list(A.bases, true) ? `base_town: ${list(A.bases, true)}` : 'base_town: base town the stay is in  (set your list at trip setup)'));
edit('Templates/Food Spot.md', t => guideLine(t, 'price_band',
  sym ? `price_band: ${sym} | ${sym.repeat(2)} | ${sym.repeat(3)}` : 'price_band: low | mid | high'));
// The Itinerary base cannot read trip.md, so the "ok" threshold of its verdict is written into it (slot S13).
edit('Bases/Itinerary.base', t => sub(t, /(formula\.slack_hrs < 0, "too much", if\(formula\.slack_hrs < )[\d.]+/, `$1${Number(A.planning_limits.slack_ok_hrs)}`,
  'the slack verdict formula (S13)'));
edit('Bases/Stays.base', t => {
  t = sub(t, /est_total \/ [\d.]+/, `est_total / ${A.cost_split_units}`, 'the cost split formula (S9)');
  const label = (key, value, slot) => { t = sub(t, new RegExp(`(^\\s*${key.replace('.', '\\.')}:\\s*\\n\\s*displayName: ).*$`, 'm'), `$1${value}`, `the ${key} column name (${slot})`); };
  label('formula.cost_per_split', `Per ${A.cost_split_label}${sym ? ' ' + sym : ''}`, 'S10');
  label('est_total', `Total${sym ? ' ' + sym : ''}`, 'S11');
  label('price_per_night', sym ? `${sym} / night` : 'Per night', 'S12');
  return t;
});

// ---------- field packs ----------
const frontKeys = t => (t.match(/^---\n([\s\S]*?)\n---/)?.[1] || '').split('\n').map(l => l.match(/^([\w-]+):/)?.[1]).filter(Boolean);
// Take every pack out, then put the chosen ones back in name order, so the result never depends on history.
for (const pass of ['remove', 'add']) for (const [name, pack] of Object.entries(PACKS).sort(([a], [b]) => a.localeCompare(b))) {
  const want = pass === 'add';
  if (want && !A.field_packs.includes(name)) continue;
  for (const [tpl, spec] of Object.entries(pack.templates)) {
    edit(`Templates/${tpl}`, t => {
      const present = frontKeys(t);
      const props = Object.keys(spec.properties);
      if (want) {
        const add = props.filter(k => !present.includes(k));
        if (!add.length) return t;
        const lines = add.map(k => { const x = spec.properties[k]; return x === '' || x == null ? `${k}:` : `${k}: ${yamlValue(x)}`; }).join('\n');
        t = sub(t, /^recommended_by:/m, `${lines}\nrecommended_by:`, `recommended_by in ${tpl}`);
        const g = spec.guide.filter(l => !t.includes(l)).join('\n');
        const [, end] = guideRange(t, tpl);
        return g ? t.slice(0, end) + g + '\n' + t.slice(end) : t;
      }
      // Not chosen: take the pack's properties and guide lines out again.
      for (const k of props) {
        t = t.replace(new RegExp(`^${k}:.*\\n`, 'm'), '');
      }
      for (const l of spec.guide) t = t.replace(l + '\n', '');
      return t;
    });
  }
  if (want) edit('.obsidian/types.json', t => {
    const j = JSON.parse(t); j.types = { ...j.types, ...Object.fromEntries(Object.entries(pack.types).filter(([k]) => !(k in j.types))) };
    return JSON.stringify(j, null, 2) + '\n';
  });
}

// ---------- 00 Home.md: heading and Trip facts ----------
const kept = [];
edit('00 Home.md', t => {
  // Only fill what is still the starter text, so hand-written lines are never overwritten.
  if (A.trip_name) t = t.replace(/^# <Trip name>$/m, `# ${A.trip_name}`);
  const nights = A.start_date && A.end_date ? Math.round((Date.parse(A.end_date) - Date.parse(A.start_date)) / 864e5) : null;
  const facts = {
    'Destination': A.destination || null,
    'Dates': A.start_date && A.end_date ? `${A.start_date} – ${A.end_date}, ${nights} nights. ${A.dates_fixed ? 'Fixed (bookings made).' : 'Flexible.'}` : null,
    'Arrival / departure': A.arrival || A.departure ? `${A.arrival || '?'} / ${A.departure || '?'}` : null,
    'Group': A.travellers ? `${A.travellers} people; costs split per ${A.cost_split_label} (${A.cost_split_units} share${A.cost_split_units === 1 ? '' : 's'}).${A.traveller_notes ? ' ' + A.traveller_notes : ''}` : null,
    'Pace': A.pace || null,
    'Season conditions': A.season ? `${cap(A.season)}: about ${A.daylight_hrs} usable daylight hours, day starts around ${A.day_start}, sunset around ${A.sunset}.` : null,
    'Transport': A.group_vehicle ? `${A.group_vehicle}. See [[Logistics/Transport|Transport]].` : null,
    'Food': A.food_needs || null,
  };
  for (const [label, value] of Object.entries(facts)) {
    if (!value) continue;
    const re = new RegExp(`^- \\*\\*${label.replace(/[/]/g, '\\/')}:\\*\\*(.*)$`, 'm');
    const m = t.match(re);
    if (!m) continue;
    const now = m[1].trim();
    if (now === '' || /^<.*>/.test(now)) t = t.replace(re, `- **${label}:** ${value}`);
    else if (now !== value) kept.push(label);
  }
  return t;
});

// ---------- starter notes (new vaults only; --reconfigure never touches notes) ----------
if (!RECONF) {
  const fromTemplate = (rel, title, fill = t => t) => {
    if (fs.existsSync(path.join(VAULT, rel))) return;
    fs.mkdirSync(path.dirname(path.join(VAULT, rel)), { recursive: true });
    write(rel, fill(read(`Templates/${path.basename(rel)}`).replace(/\{\{title\}\}/g, title)));
  };
  fromTemplate('Itinerary/Route.md', 'Route');
  fromTemplate('Logistics/Transport.md', 'Transport',
    t => A.group_vehicle ? t.replace(/^vehicle:.*$/m, `vehicle: ${scalar(A.group_vehicle)}`) : t);
}

// ---------- report ----------
console.log(`${RECONF ? 'Updated' : 'Set up'} trip vault: ${VAULT}`);
console.log(changed.size ? 'Changed:\n' + [...changed].sort().map(f => `  - ${f}`).join('\n') : 'Nothing changed.');
if (kept.length) console.log(`Trip facts in 00 Home.md kept as written (check they still match trip.md): ${kept.join(', ')}`);
console.log(`Field packs: ${A.field_packs.length ? A.field_packs.join(', ') : 'none'}`);
