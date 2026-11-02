// Shared reader for trip.md settings, and the planning limits. Plain Node, no dependencies.
// Used by scripts/validate.mjs, the plan-day sun script, the review-travel-times script and trip-init,
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
function parseBlock(lines) {   // indented "key: value" lines -> nested object
  const root = {}, stack = [{ indent: -1, obj: root }];
  for (const line of lines) {
    const m = line.match(/^(\s+)([\w-]+):\s*(.*?)\s*$/);
    if (!m) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= m[1].length) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (m[3] === '') { parent[m[2]] = {}; stack.push({ indent: m[1].length, obj: parent[m[2]] }); }
    else parent[m[2]] = parseFlow(m[3]);
  }
  return root;
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
};
const LIMIT_RULES = {         // what each value must be
  slack_ok_hrs: [x => x >= 0, 'a number of hours, 0 or more'],
  dark_drive_tight_min: [x => x >= 0, 'a number of minutes, 0 or more'],
  late_finish_min: [x => x >= 0, 'a number of minutes, 0 or more'],
  max_drive_hrs_day: [x => x > 0, 'a number of hours above 0'],
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
