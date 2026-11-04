// Shared reader for trip.md settings, and the planning limits. Plain Node, no dependencies.
// Used by scripts/validate.mjs, the plan-day sun script, the review-travel-times script, the build-itinerary route script and trip-init
// (group_wishes too: the checker and trip-init),
// so the numbers a group changes in trip.md reach every one of them the same way.
import fs from 'node:fs';
import path from 'node:path';

const isNum = x => typeof x === 'number' && Number.isFinite(x);

// ---- a very small reader for the two YAML shapes trip.md may use: {a: {b: 1}} on one line, or indented lines
function parseFlow(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const fail = () => { throw new Error(`can't read "${src.trim()}" (expected something like {hill: {car: 30, group: 22}})`); };
  const scalar = () => {
    ws();
    if (src[i] === '"' || src[i] === "'") { const q = src[i++]; let s = ''; while (i < src.length && src[i] !== q) s += src[i++]; if (src[i] !== q) fail(); i++; return s; }
    const m = /[^,}\]:]+/y; m.lastIndex = i; const r = m.exec(src); if (!r) fail();
    i += r[0].length; const t = r[0].trim();
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
  };
  const value = () => {
    ws();
    if (src[i] === '{') {
      i++; const o = {}; ws();
      while (src[i] !== '}') {
        const k = scalar(); ws(); if (src[i] !== ':') fail(); i++;
        o[String(k)] = value(); ws();
        if (src[i] === ',') i++; ws(); if (i >= src.length) fail();
      }
      i++; return o;
    }
    if (src[i] === '[') {
      i++; const a = []; ws();
      while (src[i] !== ']') { a.push(value()); ws(); if (src[i] === ',') i++; ws(); if (i >= src.length) fail(); }
      i++; return a;
    }
    return scalar();
  };
  const v = value(); ws(); if (i < src.length) fail();
  return v;
}
function parseBlock(lines) {   // indented "key: value" lines -> nested object; "- " lines -> a list
  if (/^\s+-(\s|$)/.test(lines[0] || '')) return parseBlockList(lines);
  const root = {}, stack = [{ indent: -1, obj: root }];
  let open = null;   // the last "key:" with nothing after it: "- item" lines under it make it a list
  for (const line of lines) {
    const dash = line.match(/^\s+-\s*(.*?)\s*$/);
    if (dash && open) {
      if (!Array.isArray(open.parent[open.key])) open.parent[open.key] = [];
      open.parent[open.key].push(dash[1] === '' ? '' : parseFlow(dash[1]));
      continue;
    }
    const m = line.match(/^(\s+)([\w-]+):\s*(.*?)\s*$/);
    if (!m) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= m[1].length) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (m[3] === '') { parent[m[2]] = {}; stack.push({ indent: m[1].length, obj: parent[m[2]] }); open = { parent, key: m[2] }; }
    else { parent[m[2]] = parseFlow(m[3]); open = null; }
  }
  return root;
}
function parseBlockList(lines) {   // "  - area: X\n    no_drive_after: ..." or "  - {area: X}" or "  - text"
  const out = [];
  let item = null;
  for (const line of lines) {
    const dash = line.match(/^\s+-\s*(.*?)\s*$/);
    if (dash) {
      const kv = dash[1].match(/^([\w-]+):\s*(.*)$/);
      if (kv && !/^[{[]/.test(dash[1])) { item = { [kv[1]]: kv[2] === '' ? '' : parseFlow(kv[2]) }; out.push(item); }
      else { item = null; out.push(dash[1] === '' ? '' : parseFlow(dash[1])); }
      continue;
    }
    const kv = line.match(/^\s+([\w-]+):\s*(.*?)\s*$/);
    if (kv && item) item[kv[1]] = kv[2] === '' ? '' : parseFlow(kv[2]);
    else throw new Error(`can't read the line "${line.trim()}" in a list`);
  }
  return out;
}
// Read one top-level property of trip.md: a scalar, a flow map, or an indented block. undefined if absent or empty.
export function tripSetting(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const at = lines.findIndex(l => l.startsWith(key + ':'));
  if (at < 0) return undefined;
  const rest = lines[at].slice(key.length + 1).trim();
  if (rest) {
    const unhashed = /^["']/.test(rest) ? rest : rest.replace(/\s+#.*$/, '');
    return /^[{[]/.test(unhashed) ? parseFlow(unhashed) : unhashed.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  const block = [];
  for (const l of lines.slice(at + 1)) { if (/^\s+\S/.test(l)) block.push(l); else if (l.trim() !== '') break; }
  return block.length ? parseBlock(block) : undefined;
}

// The frontmatter text of trip.md in a vault ('' when there is no trip.md).
export function tripFrontmatter(vault) {
  try { return fs.readFileSync(path.join(path.resolve(vault), 'trip.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || ''; }
  catch { return ''; }
}

// ---- planning limits: the defaults a group changes in trip.md as it plans (`planning_limits`).
// Each is a guideline, not a law. Keep in step with vault-template/trip.md and docs/PLAN-compare-itineraries.md.
export const PLANNING_LIMIT_DEFAULTS = {
  slack_ok_hrs: 1.5,          // a day with at least this much daylight slack is "ok"; under it (down to 0) is "tight"
  dark_drive_tight_min: 30,   // driving a road to avoid this long in the dark (not agreed) is "tight"; more is "too much"
  late_finish_min: 60,        // a day that ends this long after sunset away from an evening base is "tight"
  max_drive_hrs_day: 6,       // compare-itineraries flags a day with more driving than this
  on_the_way_min: 20,         // a stop that adds at most this many minutes to a day's drive is "on the way"; more is a detour
};
const LIMIT_RULES = {         // what each value must be
  slack_ok_hrs: [x => x >= 0, 'a number of hours, 0 or more'],
  dark_drive_tight_min: [x => x >= 0, 'a number of minutes, 0 or more'],
  late_finish_min: [x => x >= 0, 'a number of minutes, 0 or more'],
  max_drive_hrs_day: [x => x > 0, 'a number of hours above 0'],
  on_the_way_min: [x => x >= 0, 'a number of minutes, 0 or more'],
};

// Problems with a planning_limits value, as plain sentences (empty list = fine).
export function planningLimitsProblems(v) {
  if (v === undefined || v === null) return [];
  if (typeof v !== 'object' || Array.isArray(v)) return ['planning_limits must be a map like {slack_ok_hrs: 1.5, max_drive_hrs_day: 6}'];
  const out = [];
  for (const [k, x] of Object.entries(v)) {
    if (!(k in PLANNING_LIMIT_DEFAULTS)) out.push(`planning_limits: "${k}" is not a setting (use: ${Object.keys(PLANNING_LIMIT_DEFAULTS).join(', ')})`);
    else {
      const n = typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x.trim()) ? Number(x) : x;   // the checker's own reader gives text
      if (!(isNum(n) && LIMIT_RULES[k][0](n))) out.push(`planning_limits.${k} must be ${LIMIT_RULES[k][1]}`);
    }
  }
  return out;
}

// The limits in force for a vault: the defaults, changed by planning_limits in trip.md (anything left out keeps its
// default; a value that is not valid is ignored and listed in `problems`).
export function loadPlanningLimits(vault) {
  const limits = { ...PLANNING_LIMIT_DEFAULTS }, changed = [], problems = [];
  let given;
  try { given = tripSetting(tripFrontmatter(vault), 'planning_limits'); }
  catch (e) { problems.push(`planning_limits: ${e.message}`); }
  problems.push(...planningLimitsProblems(given));
  if (given && typeof given === 'object' && !Array.isArray(given)) {
    for (const [k, x] of Object.entries(given)) {
      const n = typeof x === 'string' ? Number(x) : x;
      if (k in limits && isNum(n) && LIMIT_RULES[k][0](n) && n !== limits[k]) { limits[k] = n; changed.push(k); }
    }
  }
  return { limits, changed, problems };
}

// The same, but a problem is an error (for the scripts that must not guess).
export function strictPlanningLimits(vault) {
  const r = loadPlanningLimits(vault);
  if (r.problems.length) throw new Error('trip.md has a problem:\n  - ' + r.problems.join('\n  - '));
  return r;
}

// ---- the stage of the trip (`stage` in trip.md). It tells the skills what the group is doing now.
export const STAGES = ['planning', 'booking', 'travelling', 'after'];
export const DEFAULT_STAGE = 'planning';
export const stageProblems = v => (v === undefined || v === null || v === '' || STAGES.includes(String(v))) ? []
  : [`stage "${v}" is not one of: ${STAGES.join(' | ')}`];

// ---- road cutoffs (`road_cutoffs` in trip.md): areas where nobody drives after a set time, e.g.
// [{area: Jowai, no_drive_after: "16:00", reason: single-track border roads}]. A leg in that area that ends after the time
// is a rule bend (plan-day, review-travel-times, build-itinerary and the checker read it). Empty by default.
const CUTOFF_KEYS = ['area', 'no_drive_after', 'reason'];
export const clockMinutes = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim()); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };
export function roadCutoffsProblems(v) {
  if (v === undefined || v === null || v === '') return [];
  if (!Array.isArray(v)) return ['road_cutoffs must be a list like [{area: Jowai, no_drive_after: "16:00", reason: single-track border roads}]'];
  const out = [];
  v.forEach((c, i) => {
    const at = `road_cutoffs item ${i + 1}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) { out.push(`${at} must be a map like {area: Jowai, no_drive_after: "16:00", reason: ...}`); return; }
    for (const k of Object.keys(c)) if (!CUTOFF_KEYS.includes(k)) out.push(`${at}: "${k}" is not a setting (use: ${CUTOFF_KEYS.join(', ')})`);
    if (typeof c.area !== 'string' || !c.area.trim()) out.push(`${at} needs an area (a town or area name)`);
    if (clockMinutes(c.no_drive_after) === null) out.push(`${at}: no_drive_after must be a time like "16:00" (in quotes), got "${c.no_drive_after ?? ''}"`);
  });
  return out;
}
// The cutoffs in force for a vault (valid entries only; the rest are listed in `problems`).
export function loadRoadCutoffs(vault) {
  let given;
  const problems = [];
  try { given = tripSetting(tripFrontmatter(vault), 'road_cutoffs'); }
  catch (e) { problems.push(`road_cutoffs: ${e.message}`); }
  problems.push(...roadCutoffsProblems(given));
  const cutoffs = (Array.isArray(given) ? given : [])
    .filter(c => c && typeof c === 'object' && typeof c.area === 'string' && c.area.trim() && clockMinutes(c.no_drive_after) !== null)
    .map(c => ({ area: c.area.trim(), no_drive_after: String(c.no_drive_after).trim(), reason: c.reason ? String(c.reason) : '', min: clockMinutes(c.no_drive_after) }));
  return { cutoffs, problems };
}
export function strictRoadCutoffs(vault) {
  const r = loadRoadCutoffs(vault);
  if (r.problems.length) throw new Error('trip.md has a problem:\n  - ' + r.problems.join('\n  - '));
  return r.cutoffs;
}
// The cutoff for an area name (case and spacing ignored), or null.
export const cutoffFor = (cutoffs, area) => (area ? cutoffs.find(c => c.area.toLowerCase() === String(area).trim().toLowerCase()) || null : null);

// ---- the group's wishes (`group_wishes` in trip.md), from the shortlist-places skill: {must: [], nice: [], avoid: []}, each a
// list of short plain-text lines ("see elephants", "a tea estate", "long hikes"). build-itinerary flags a route that misses a
// must-have, compare-itineraries shows which must-haves each option covers, and plan-day reads the avoid list as guidelines.
export const WISH_KEYS = ['must', 'nice', 'avoid'];
export const WISH_MAX_CHARS = 120;   // a wish is a short line, not a paragraph
export const EMPTY_WISHES = { must: [], nice: [], avoid: [] };
// Problems with a group_wishes value, as plain sentences (empty list = fine). `partial` allows a map with only some of the
// three lists (trip-init's answers: a list left out keeps its current value).
export function groupWishesProblems(v, { partial = false } = {}) {
  if (v === undefined || v === null || v === '') return [];
  const shape = 'group_wishes must be a map of three lists, like {must: [see elephants], nice: [a tea estate], avoid: [long hikes]}';
  if (typeof v !== 'object' || Array.isArray(v)) return [shape];
  const out = [];
  for (const k of Object.keys(v)) if (!WISH_KEYS.includes(k)) out.push(`group_wishes: "${k}" is not a list name (use: ${WISH_KEYS.join(', ')})`);
  for (const k of WISH_KEYS) {
    if (!(k in v)) { if (!partial) out.push(`group_wishes has no ${k} list. Add ${k}: [] (empty is fine)`); continue; }
    const list = v[k];
    if (!Array.isArray(list)) { out.push(`group_wishes.${k} must be a list of short lines, like [see elephants]${list === '' || (list && typeof list === 'object' && !Object.keys(list).length) ? ' (or [] when empty)' : ''}`); continue; }
    list.forEach((w, i) => {
      if (typeof w !== 'string' || !w.trim()) out.push(`group_wishes.${k} item ${i + 1} must be a short line of text${w && typeof w === 'object' ? ', not a list or a map' : ''}`);
      else if (w.length > WISH_MAX_CHARS) out.push(`group_wishes.${k} item ${i + 1} is ${w.length} characters long. Keep each wish to one short line (${WISH_MAX_CHARS} at most)`);
    });
  }
  return out;
}
// The wishes in force for a vault ({must, nice, avoid}, empty lists when there are none) and any problems with them.
export function loadGroupWishes(vault) {
  let given;
  const problems = [];
  try { given = tripSetting(tripFrontmatter(vault), 'group_wishes'); }
  catch (e) { problems.push(`group_wishes: ${e.message}`); }
  problems.push(...groupWishesProblems(given));
  const wishes = { must: [], nice: [], avoid: [] };
  if (given && typeof given === 'object' && !Array.isArray(given)) for (const k of WISH_KEYS) if (Array.isArray(given[k])) wishes[k] = given[k].filter(w => typeof w === 'string' && w.trim());
  return { wishes, present: given !== undefined, problems };
}
