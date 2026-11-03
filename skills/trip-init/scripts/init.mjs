#!/usr/bin/env node
// trip-init: set up a trip-huddle vault from an answers file, or update an existing vault's settings.
//
//   node init.mjs --answers <file.json> [--vault <folder>] [--reconfigure [--add-food] [--add-bookings] [--add-itinerary] [--add-scout]]
//
// New vault (default): copies vault-template into the folder (empty or missing), then fills it in.
// --reconfigure: the folder already has trip.md. Rewrites trip.md, the per-trip values in Templates
// and Bases, the field packs and the Trip facts in 00 Home.md. Notes are never touched.
// --add-food (with --reconfigure, for a vault made before 0.9.0): adds the restaurants and cafes category: the Food/ folder,
// Bases/Food.base, the new Food Spot template, the Source template's food checklist, the types, and a "Food to decide"
// section on 00 Home.md. It only adds; notes are never touched. The skill asks the user before using it.
// --add-bookings (with --reconfigure, for a vault made before 0.11.0): adds the booking list: the Bookings/ and Confirmations/
// folders, Bases/Bookings.base, the Booking template, the booking fields in the Stay, Transport and Location templates, the
// types, the Bookings section of 00 Home.md and the bookings rule in .claude/CLAUDE.md. Notes are never touched: the
// group-decisions skill's scripts/migrate-bookings.mjs adds the new fields to existing notes.
// --add-itinerary (with --reconfigure, for a vault made before 0.12.0): adds what the build-itinerary skill needs: the Day by
// day table and the three lists in the Route template, start_time, backtrack_km and the Along the way section in the Day Plan
// template, needs_night_nearby in the Location template, the Trip Itinerary and Operator Brief templates, the types, the new
// columns in the Itinerary and Locations Bases and the route step of 00 Home.md. Notes are never touched: the build-itinerary
// skill's scripts/migrate-itinerary.mjs adds the new fields to existing notes. (road_cutoffs and planning_limits.on_the_way_min
// come with every --reconfigure, like the other trip.md settings.)
// --add-scout (with --reconfigure, for a vault made before 0.13.0): adds what the destination brief and the shortlist-places
// skill need: the Destination Brief template, the research kind in the Source template, the destination and checked_on types,
// the brief's line and paragraph on 00 Home.md, and an empty group_wishes in trip.md (with its line in the trip.md text). It
// writes no brief: the trip-init skill does that from research, only when asked. Notes are never touched.
// group_wishes ({must: [], nice: [], avoid: []}): a new vault gets it empty; on --reconfigure a list the answers give replaces
// that list, a list left out keeps its current value, and an older trip.md without it only gets it with --add-scout.
// The per-trip values ("slots") are listed in ../slots.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsProblems } from '../../review-travel-times/scripts/travel.mjs';
import { tripSetting, PLANNING_LIMIT_DEFAULTS, planningLimitsProblems, STAGES, DEFAULT_STAGE, stageProblems, roadCutoffsProblems, EMPTY_WISHES, groupWishesProblems } from '../../../scripts/trip-settings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const PLUGIN = path.resolve(SKILL, '../..');
const TEMPLATE_VAULT = path.join(PLUGIN, 'vault-template');

// ---------- arguments ----------
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const RECONF = args.includes('--reconfigure');
const ADD_FOOD = args.includes('--add-food');
const ADD_BOOKINGS = args.includes('--add-bookings');
const ADD_ITINERARY = args.includes('--add-itinerary');
const ADD_SCOUT = args.includes('--add-scout');
const VAULT = path.resolve(opt('--vault') || process.cwd());
const ANSWERS = opt('--answers');
const die = m => { console.error(`trip-init: ${m}`); process.exit(1); };
if (!ANSWERS) die('missing --answers <file.json>');
if (ADD_FOOD && !RECONF) die('--add-food only works with --reconfigure (a new vault already has the Food category)');
if (ADD_BOOKINGS && !RECONF) die('--add-bookings only works with --reconfigure (a new vault already has the booking list)');
if (ADD_ITINERARY && !RECONF) die('--add-itinerary only works with --reconfigure (a new vault already has what build-itinerary needs)');
if (ADD_SCOUT && !RECONF) die('--add-scout only works with --reconfigure (a new vault already has the destination brief template and group_wishes)');

// ---------- the answers ----------
// Property order and defaults, the same as vault-template/trip.md.
const DEFAULTS = {
  schema_version: '0.2', trip_name: '', destination: '', start_date: '', end_date: '', dates_fixed: false, stage: DEFAULT_STAGE,
  arrival: '', departure: '', travellers: '', cost_split_units: 1, cost_split_label: 'person',
  traveller_notes: '', pace: '', food_needs: '', group_vehicle: '', currency: '', currency_symbol: '',
  season: '', daylight_hrs: 10, day_start: '08:00', sunset: '18:00', regions: [], bases: [], evening_bases: [],
  categories: ['viewpoint', 'nature', 'old-town', 'museum', 'market', 'food', 'activity', 'beach', 'hike'],
  map_box: null, field_packs: [], planning_limits: PLANNING_LIMIT_DEFAULTS, road_cutoffs: [], group_wishes: EMPTY_WISHES,
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
// stage: the answer, else what trip.md has now (on --reconfigure), else planning. An old trip.md with no stage gets planning.
let nowStage;
try {
  const old = RECONF && fs.existsSync(path.join(VAULT, 'trip.md')) ? fs.readFileSync(path.join(VAULT, 'trip.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '' : '';
  nowStage = tripSetting(old, 'stage');
} catch { nowStage = undefined; }
A.stage = raw.stage !== undefined && raw.stage !== '' ? raw.stage : (STAGES.includes(nowStage) ? nowStage : DEFAULT_STAGE);
// road_cutoffs: the answer, else what trip.md has now (on --reconfigure, when it is valid), else none.
let nowCutoffs;
try {
  const old = RECONF && fs.existsSync(path.join(VAULT, 'trip.md')) ? fs.readFileSync(path.join(VAULT, 'trip.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '' : '';
  nowCutoffs = tripSetting(old, 'road_cutoffs');
} catch { nowCutoffs = undefined; }
A.road_cutoffs = raw.road_cutoffs !== undefined && raw.road_cutoffs !== null ? raw.road_cutoffs
  : (Array.isArray(nowCutoffs) && !roadCutoffsProblems(nowCutoffs).length ? nowCutoffs : []);
A.planning_limits = { ...PLANNING_LIMIT_DEFAULTS, ...(limitsOk(nowLimits) ? nowLimits : {}), ...(raw.planning_limits && typeof raw.planning_limits === 'object' ? raw.planning_limits : {}) };
// group_wishes: each list the answers give replaces that list; a list left out keeps what trip.md has now (on --reconfigure,
// when it is valid), else it is empty. An older trip.md without group_wishes gets it only with --add-scout or from the answers.
let nowWishes;
try {
  const old = RECONF && fs.existsSync(path.join(VAULT, 'trip.md')) ? fs.readFileSync(path.join(VAULT, 'trip.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '' : '';
  nowWishes = tripSetting(old, 'group_wishes');
} catch { nowWishes = undefined; }
const wishesOk = x => x && typeof x === 'object' && !Array.isArray(x) && !groupWishesProblems(x).length;
const givenWishes = raw.group_wishes !== undefined && raw.group_wishes !== null;
const writeWishes = !RECONF || ADD_SCOUT || nowWishes !== undefined || givenWishes;
A.group_wishes = { ...EMPTY_WISHES, ...(wishesOk(nowWishes) ? nowWishes : {}), ...(givenWishes && typeof raw.group_wishes === 'object' && !Array.isArray(raw.group_wishes) ? raw.group_wishes : {}) };

const problems = [...stageProblems(A.stage)];
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
problems.push(...roadCutoffsProblems(raw.road_cutoffs));          // [{area, no_drive_after: "HH:MM", reason}]
problems.push(...groupWishesProblems(raw.group_wishes, { partial: true }));   // {must: [...], nice: [...], avoid: [...]}, short lines
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
// Inside a [list] or {map} a comma or bracket would end the value, so such text is quoted there too.
const scalar = (v, nested = false) => typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : v == null ? '' : needsQuote(String(v)) || (nested && /[,{}[\]]/.test(String(v))) ? JSON.stringify(String(v)) : String(v);
const yamlValue = (v, nested = false) => Array.isArray(v) ? `[${v.map(x => yamlValue(x, true)).join(', ')}]`
  : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${k}: ${yamlValue(x, true)}`).join(', ')}}`
  : scalar(v, nested);
const keys = [...Object.keys(DEFAULTS), ...Object.keys(A).filter(k => !(k in DEFAULTS))].filter(k => k !== 'group_wishes' || writeWishes);
let front = keys.map(k => { const v = yamlValue(A[k]); return v === '' ? `${k}:` : `${k}: ${v}`; }).join('\n');
// Optional settings that people add by hand (read by scripts/validate.mjs and the review-travel-times skill):
// keep them when settings are rewritten, unless the answers give a new value.
const oldFront = fs.existsSync(tripMd) ? (fs.readFileSync(tripMd, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] || '') : '';
for (const k of ['decision_values', 'folders', 'road_speeds', 'stop_buffer']) {
  const m = k in A ? null : oldFront.match(new RegExp(`^${k}:.*(?:\\n[ \\t]+.*)*`, 'm'));
  if (m) front += '\n' + m[0];
}
const oldTrip = fs.existsSync(tripMd) ? fs.readFileSync(tripMd, 'utf8') : read('trip.md');
let body = oldTrip.replace(/^---\n[\s\S]*?\n---\n?/, '');
// --add-scout: the group_wishes line of the starter's trip.md text, before the "Optional, add by hand" line.
if (ADD_SCOUT && !/^- `group_wishes` /m.test(body)) {
  const line = fs.readFileSync(path.join(TEMPLATE_VAULT, 'trip.md'), 'utf8').match(/^- `group_wishes` .*\n/m)[0];
  body = /^- Optional, add by hand/m.test(body) ? body.replace(/^- Optional, add by hand/m, line + '- Optional, add by hand') : body.replace(/\n*$/, '\n') + line;
}
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
  edit('00 Home.md', t => /Food\.base#To decide/.test(t) || !/^## (Bookings|Stays to book)$/m.test(t) ? t
    : t.replace(/^## (Bookings|Stays to book)$/m, '## Food to decide\n![[Food.base#To decide]]\n\n## $1'));
}

// ---------- --add-bookings: bring a vault made before 0.11.0 up to the booking list ----------
if (ADD_BOOKINGS) {
  const fromStarter = rel => fs.readFileSync(path.join(TEMPLATE_VAULT, rel), 'utf8');
  for (const d of ['Bookings', 'Confirmations']) fs.mkdirSync(path.join(VAULT, d), { recursive: true });
  for (const f of ['Bases/Bookings.base', 'Templates/Booking.md']) if (!fs.existsSync(path.join(VAULT, f))) write(f, fromStarter(f));
  // Transport has no per-trip lines: an old one (no booking fields) is replaced by the starter's.
  if (fs.existsSync(path.join(VAULT, 'Templates/Transport.md')) && !/^cost_agreed:/m.test(read('Templates/Transport.md'))) write('Templates/Transport.md', fromStarter('Templates/Transport.md'));
  // Stay and Location have per-trip lines and field packs, so the new lines are put in place, as in the starter vault.
  const starterGuide = (rel, key) => fromStarter(rel).match(/<!--[\s\S]*?-->/)[0].split('\n').filter(l => l.startsWith(key)).join('\n');   // a FIELD GUIDE line
  edit('Templates/Stay.md', t => {
    if (/^cost_agreed:/m.test(t)) return t;
    t = sub(t, /^booking_ref:\nnights_booked:\nadvance_paid:\n/m, 'booking_ref:\nconfirmation:\nnights_booked:\ncost_agreed:\nadvance_paid:\nbalance_pending:\n', 'booking_ref, nights_booked and advance_paid in the Stay template');
    return sub(t, /^price_per_night \/ extra_bed \/ advance_paid: .*$/m, [starterGuide('Templates/Stay.md', 'price_per_night / '), starterGuide('Templates/Stay.md', 'cost_agreed: '), starterGuide('Templates/Stay.md', 'confirmation: ')].join('\n'),
      'the price_per_night line in the Stay FIELD GUIDE');
  });
  edit('Templates/Location.md', t => {
    if (/^needs_booking:/m.test(t)) return t;
    t = sub(t, /^permits:\n/m, 'permits:\nneeds_booking: false\n', 'permits in the Location template');
    return sub(t, /^(entry_fee: .*)$/m, ['$1', starterGuide('Templates/Location.md', 'needs_booking: '), starterGuide('Templates/Location.md', 'booking_status: ')].join('\n'),
      'the entry_fee line in the Location FIELD GUIDE');
  });
  edit('.obsidian/types.json', t => {
    const j = JSON.parse(t), add = { needs_booking: 'checkbox', cost_agreed: 'number', balance_pending: 'number', confirmation: 'text' };
    for (const [k, v] of Object.entries(add)) if (!(k in j.types)) j.types[k] = v;
    return JSON.stringify(j, null, 2) + '\n';
  });
  edit('00 Home.md', t => {
    const home = fromStarter('00 Home.md');
    const section = home.match(/^## Bookings\n[\s\S]*?(?=\n## )/m)[0];
    if (!/Bookings\.base#To book/.test(t)) t = sub(t, /^## Stays to book\n!\[\[Stays\.base#Booking tracker\]\]\n/m, section, 'the "Stays to book" section of 00 Home.md');
    if (!/`Confirmations\/`/.test(t)) t = sub(t, /^8\. \*\*Book\.\*\*.*$/m, home.match(/^8\. \*\*Book\.\*\*.*$/m)[0], 'step 8 (Book) of "How this vault works" in 00 Home.md');
    if (!/^- \*\*Paid so far \/ still owed:\*\*/m.test(t)) t = sub(t, /^(- \*\*Activities \/ entry fees:\*\*.*)$/m, '$1\n- **Paid so far / still owed:** ', 'the Activities line of the Budget snapshot in 00 Home.md');
    return t;
  });
  if (fs.existsSync(path.join(VAULT, '.claude/CLAUDE.md'))) edit('.claude/CLAUDE.md', t => /## Bookings live on/.test(t) ? t
    : t.replace(/\n*$/, '\n') + fromStarter('.claude/CLAUDE.md').match(/\n## Bookings live on[\s\S]*$/)[0]);
}

// ---------- --add-itinerary: bring a vault made before 0.12.0 up to what build-itinerary needs ----------
if (ADD_ITINERARY) {
  const fromStarter = rel => fs.readFileSync(path.join(TEMPLATE_VAULT, rel), 'utf8');
  for (const f of ['Templates/Trip Itinerary.md', 'Templates/Operator Brief.md']) if (!fs.existsSync(path.join(VAULT, f))) write(f, fromStarter(f));
  // Route has no per-trip lines: an old one (no Day by day table) is replaced by the starter's.
  if (fs.existsSync(path.join(VAULT, 'Templates/Route.md')) && !/^## Day by day$/m.test(read('Templates/Route.md'))) write('Templates/Route.md', fromStarter('Templates/Route.md'));
  // Day Plan and Location have per-trip lines and field packs, so the new lines are put in place, as in the starter vault.
  const starterLine = (rel, re) => fromStarter(rel).match(re)[0];
  edit('Templates/Day Plan.md', t => {
    if (!/^start_time:/m.test(t)) t = sub(t, /^(locations:.*\n(?:\s+-.*\n)*)/m, '$1start_time:\n', 'locations in the Day Plan template');
    if (!/^backtrack_km:/m.test(t)) t = sub(t, /^(total_walk_km:.*\n)/m, '$1backtrack_km:\n', 'total_walk_km in the Day Plan template');
    if (!/^start_time: "HH:MM"/m.test(t)) t = sub(t, /^(early_start: "HH:MM".*)$/m, `${starterLine('Templates/Day Plan.md', /^start_time: "HH:MM".*$/m)}\n$1`, 'the early_start line in the Day Plan FIELD GUIDE');
    if (!/^backtrack_km: km/m.test(t)) t = sub(t, /^rule_bends: how many.*$/m, `${starterLine('Templates/Day Plan.md', /^backtrack_km: km.*$/m)}\n${starterLine('Templates/Day Plan.md', /^rule_bends: how many.*$/m)}`, 'the rule_bends line in the Day Plan FIELD GUIDE');
    if (!/^## Along the way$/m.test(t)) t = sub(t, /^## Meals$/m, fromStarter('Templates/Day Plan.md').match(/^## Along the way\n[\s\S]*?\n\n(?=## Meals)/m)[0] + '## Meals', 'the Meals section of the Day Plan template');
    return t;
  });
  edit('Templates/Location.md', t => {
    if (!/^needs_night_nearby:/m.test(t)) t = sub(t, /^(last_mile:.*\n)/m, '$1needs_night_nearby:\n', 'last_mile in the Location template');
    if (!/^needs_night_nearby: true when/m.test(t)) t = sub(t, /^after_dark_note: .*$/m.test(t) ? /^(after_dark_note: .*)$/m : /^(time_needed_hrs: .*)$/m,
      `$1\n${starterLine('Templates/Location.md', /^needs_night_nearby: true when.*$/m)}`, 'the after_dark_note line in the Location FIELD GUIDE');
    return t;
  });
  edit('.obsidian/types.json', t => {   // in the same places as the starter vault
    const j = JSON.parse(t), types = {};
    const after = { last_mile: [['needs_night_nearby', 'checkbox']], locations: [['start_time', 'text']], rule_bends: [['backtrack_km', 'number']] };
    const notes = [['route', 'text'], ['built_on', 'date'], ['seats', 'number']];   // the Trip Itinerary and Operator Brief properties
    const put = list => { for (const [a, b] of list) if (!(a in j.types) && !(a in types)) types[a] = b; };
    for (const [k, v] of Object.entries(j.types)) {
      if (k === 'needs_booking') put(notes);
      types[k] = v;
      put(after[k] || []);
    }
    put(notes);
    return JSON.stringify({ ...j, types }, null, 2) + '\n';
  });
  edit('Bases/Itinerary.base', t => {
    if (!/^\s+- start_time$/m.test(t)) {
      t = sub(t, /^(  travel_verdict:\n    displayName: .*\n)/m, '$1  start_time:\n    displayName: Start\n  backtrack_km:\n    displayName: Doubles back km\n', 'the travel_verdict column name in the Itinerary base');
      t = sub(t, /^(      - locations\n)/m, '$1      - start_time\n', 'the locations column in the Itinerary base');
      t = sub(t, /^(      - total_walk_km\n)/m, '$1      - backtrack_km\n', 'the total_walk_km column in the Itinerary base');
      t = sub(t, /^(      total_walk_km: Sum\n)/m, '$1      backtrack_km: Sum\n', 'the total_walk_km summary in the Itinerary base');
    }
    return t;
  });
  edit('Bases/Locations.base', t => {
    if (/needs_night_nearby/.test(t)) return t;
    t = sub(t, /^(  time_needed_hrs:\n    displayName: .*\n)/m, '$1  needs_night_nearby:\n    displayName: Night nearby\n', 'the time_needed_hrs column name in the Locations base');
    return sub(t, /^(    name: All\n    order:\n(?:      - .*\n)*?      - time_needed_hrs\n)/m, '$1      - needs_night_nearby\n', 'the All view of the Locations base');
  });
  edit('00 Home.md', t => {
    const home = fromStarter('00 Home.md');
    if (!/^6\. \*\*Plan the route\.\*\*.*build-itinerary/m.test(t)) t = sub(t, /^6\. \*\*Plan the route\.\*\*.*$/m, home.match(/^6\. \*\*Plan the route\.\*\*.*$/m)[0], 'step 6 (Plan the route) of "How this vault works" in 00 Home.md');
    if (!/`build-itinerary` skill plans every day/.test(t)) t = sub(t, /It never scores them, and the group decides\.(?! Once the group picks)/, home.match(/It never scores them, and the group decides\. Once the group picks[^\n]*/)[0], 'the compare-itineraries sentence in 00 Home.md');
    return t;
  });
}

// ---------- --add-scout: bring a vault made before 0.13.0 up to the destination brief and the shortlist ----------
if (ADD_SCOUT) {
  const fromStarter = rel => fs.readFileSync(path.join(TEMPLATE_VAULT, rel), 'utf8');
  if (!fs.existsSync(path.join(VAULT, 'Templates/Destination Brief.md'))) write('Templates/Destination Brief.md', fromStarter('Templates/Destination Brief.md'));
  // The Source template: research joins the source_kind list, with a line on what it means (as in the starter vault).
  edit('Templates/Source Itinerary.md', t => {
    const starter = fromStarter('Templates/Source Itinerary.md');
    if (!/^source_kind: .*\bresearch\b/m.test(t)) t = sub(t, /^source_kind: .*$/m, starter.match(/^source_kind: .*$/m)[0], 'the source_kind line in the Source template');
    if (!/^research: /m.test(t)) t = sub(t, /^(processed: tick .*)$/m, `$1\n${starter.match(/^research: .*$/m)[0]}`, 'the processed line in the Source template');
    return t;
  });
  edit('.obsidian/types.json', t => {   // just before route (or needs_booking), as in the starter vault
    const j = JSON.parse(t), types = {};
    const put = () => { for (const [a, b] of [['destination', 'text'], ['checked_on', 'date']]) if (!(a in j.types) && !(a in types)) types[a] = b; };
    const before = 'route' in j.types ? 'route' : 'needs_booking';
    for (const [k, v] of Object.entries(j.types)) { if (k === before) put(); types[k] = v; }
    put();
    return JSON.stringify({ ...j, types }, null, 2) + '\n';
  });
  edit('00 Home.md', t => {
    const home = fromStarter('00 Home.md');
    if (!/^- \*\*Destination brief:\*\*/m.test(t)) t = sub(t, /^(- \*\*Destination:\*\*.*)$/m, `$1\n${home.match(/^- \*\*Destination brief:\*\*.*$/m)[0]}`, 'the Destination line of Trip facts in 00 Home.md');
    if (!/`shortlist-places` skill/.test(t)) t = sub(t, /^With the trip-huddle plugin, paste or forward/m, `${home.match(/^New to the place\?.*$/m)[0]}\n\nWith the trip-huddle plugin, paste or forward`, 'the "With the trip-huddle plugin" paragraph of 00 Home.md');
    return t;
  });
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
// The Bookings base (S14, S15). A vault made before 0.11.0 has none until --add-bookings adds it.
if (fs.existsSync(path.join(VAULT, 'Bases/Bookings.base'))) edit('Bases/Bookings.base', t => {
  t = sub(t, /cost_agreed \/ [\d.]+/, `cost_agreed / ${A.cost_split_units}`, 'the cost split formula (S14)');
  return sub(t, /(^\s*formula\.cost_per_split:\s*\n\s*displayName: ).*$/m, `$1Per ${A.cost_split_label}${sym ? ' ' + sym : ''}`, 'the formula.cost_per_split column name (S15)');
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
