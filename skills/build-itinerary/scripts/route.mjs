#!/usr/bin/env node
// Route helper for the build-itinerary skill. Plain Node, no dependencies.
//
//   node route.mjs links [--vault <folder>] [--road hill] [--with-considering]
//   node route.mjs link --from A --to B --km 30 --hrs 0.8-1 --road hill --after-dark avoid --source "..." [--cutoff-area Jowai] [--checked 2026-11-02]
//   node route.mjs town --name Jowai --lat 25.45 --lng 92.20
//   node route.mjs candidates --from A --to B [--daylight 9.5] [--all]
//   node route.mjs check --route "Itinerary/Route - Option A.md" [--sunset 16:30] [--daylight 9.5]
//
// The distance file is Logistics/legs.json (the folder is `folders.transport` in trip.md). It holds facts about roads,
// never decisions: which places, stays and food spots are chosen stays in the notes, and this script reads them each time.
//   { "rough_road": "hill",                       the road type used for rough links
//     "towns": { "Jowai": [25.45, 92.2] },        base towns and other points with no note of their own
//     "links": [ { "from", "to", "km", "drive_hrs": [low, high], "road", "after_dark": "ok" | "avoid",
//                  "cutoff_area", "status": "rough" | "researched", "source", "checked": "YYYY-MM-DD" } ] }
// A link is the same in both directions.
//
// `links` adds a rough link for every pair of selected places, stays (not dropped) and towns: straight-line km × a winding
//   factor for the road type, at the trip's road speeds (review-travel-times/scripts/travel.mjs and road_speeds in trip.md).
//   It updates rough links and never touches a researched one. --with-considering adds the places still being considered.
// `link` writes one researched link (what a map search, the road type and local reports found), replacing what was there.
// `town` saves the coordinates of a town or point that has no note (a base town, an airport).
// `candidates` lists the places that fit a day from A to B (A = B for a day trip), with no fixed reach: the rough or
//   researched A→P + P→B drive (with the stops buffer) is within the day's drive limit (the selected Transport note's
//   max_hrs_per_day, else planning_limits.max_drive_hrs_day), and drive + time_needed_hrs(P) is within the daylight.
//   Each is marked ok (slack_ok_hrs or more to spare) or tight (less: a big day the group has to accept, with the slack);
//   a too-much day is left out with the reason. Each is "on the way" (it adds at most planning_limits.on_the_way_min minutes) or a detour,
//   with the links that still need research.
// `check` runs a quick check of a Route note's Day by day table: per day the km, the drive hours (travel.mjs, with
//   stops), the legs after a road cutoff or after dark on avoid roads, the slack and verdict; for the trip the doubling
//   back (the same road on a second leg, and the km it adds; a spur to a stop and straight back is not counted), the
//   must places covered and missed, the nights with no selected or candidate stay, and the links still to research.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings, checkDay, ROAD_TYPES } from '../../review-travel-times/scripts/travel.mjs';
import { tripSetting, tripFrontmatter, cutoffFor } from '../../../scripts/trip-settings.mjs';

// ---- rough links: how much longer than the straight line a road of each type usually is. Keep in step with SKILL.md.
export const WINDING = { motorway: 1.2, highway: 1.25, rural: 1.3, hill: 1.5, city: 1.4, track: 1.4 };
const DARK_OK_ROADS = ['motorway', 'highway', 'city'];   // a rough link on these is "ok" after dark; the rest "avoid"
export const STATUSES = ['rough', 'researched'];
const STAY_CANDIDATE = ['selected', 'considering', 'backup'];
const PRIORITY_RANK = { must: 0, should: 1, maybe: 2 };

const round1 = x => Math.round(x * 10) / 10;
const ceil1 = x => Math.ceil(x * 10 - 1e-9) / 10;
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const today = () => new Date().toISOString().slice(0, 10);
const lc = s => String(s ?? '').trim().toLowerCase();
const pairKey = (a, b) => [lc(a), lc(b)].sort().join('|');

export function haversineKm([lat1, lng1], [lat2, lng2]) {
  const r = d => d * Math.PI / 180, R = 6371;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---- the vault: notes, folders, trip settings
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const data = {};
  let last = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/);
    if (kv) {
      last = kv[1];
      const v = kv[2].trim().replace(/\s+#.*$/, '');
      data[last] = v === '' ? null : /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(x => unq(x.trim())).filter(Boolean) : unq(v);
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && last) { if (!Array.isArray(data[last])) data[last] = []; data[last].push(unq(item[1].trim())); }
  }
  return data;
}
const unq = s => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
const linkName = v => String(v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();

export function loadVault(vault) {
  const root = path.resolve(vault);
  const fm = tripFrontmatter(root);
  const folders = { location: 'Locations', stay: 'Stays', transport: 'Logistics', day: 'Itinerary', route: 'Itinerary' };
  try { Object.assign(folders, tripSetting(fm, 'folders') || {}); } catch { /* the checker reports a bad folders value */ }
  const notes = [];
  for (const type of ['location', 'stay', 'transport']) {
    const dir = path.join(root, folders[type]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const d = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (d && d.type === type) notes.push({ name: f.replace(/\.md$/, ''), type, d });
    }
  }
  const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
  const setting = k => { try { return tripSetting(fm, k); } catch { return undefined; } };
  return { root, folders, notes, num, trip: { daylight_hrs: num(setting('daylight_hrs')), sunset: setting('sunset'), day_start: setting('day_start'),
    bases: setting('bases') || [], evening_bases: setting('evening_bases') || [] } };
}

// The daily drive limit: the selected Transport note's max_hrs_per_day, else planning_limits.max_drive_hrs_day.
function driveLimit(v, limits) {
  const t = v.notes.filter(n => n.type === 'transport');
  const chosen = t.filter(n => n.d.decision === 'selected');
  const hrs = (chosen.length ? chosen : t).map(n => Number(n.d.max_hrs_per_day)).find(x => x > 0);
  return hrs ? { hrs, from: 'the selected Transport note (max_hrs_per_day)' } : { hrs: limits.max_drive_hrs_day, from: 'planning_limits.max_drive_hrs_day in trip.md' };
}

// ---- the distance file
export const legsPath = v => path.join(v.root, v.folders.transport || 'Logistics', 'legs.json');
export function readLegs(v) {
  const p = legsPath(v);
  if (!fs.existsSync(p)) return { towns: {}, links: [] };
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`can't read ${path.relative(v.root, p)}: ${e.message}`); }
  return { ...j, towns: j.towns || {}, links: Array.isArray(j.links) ? j.links : [] };
}
const ABOUT = 'Road facts between places (trip-huddle build-itinerary). Facts only, never decisions: which places, stays and food spots are chosen lives in the notes. rough = straight-line estimate; researched = checked against a map, the road type and local reports. Change with skills/build-itinerary/scripts/route.mjs.';
function writeLegs(v, legs) {
  const p = legsPath(v);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const { about, rough_road, towns, links, ...rest } = legs;
  fs.writeFileSync(p, JSON.stringify({ about: ABOUT, rough_road, ...rest, towns, links }, null, 2) + '\n');
}
export const findLink = (legs, a, b) => legs.links.find(l => pairKey(l.from, l.to) === pairKey(a, b)) || null;

// Link problems, as plain sentences (the checker uses this too).
export function linkProblems(l) {
  const out = [], at = `${l?.from ?? '?'} – ${l?.to ?? '?'}`;
  if (!l || typeof l !== 'object') return ['a link must be an object'];
  if (!l.from || !l.to) out.push(`${at}: from and to are needed`);
  if (!(isNum(l.km) && l.km >= 0)) out.push(`${at}: km must be a number`);
  const h = l.drive_hrs;
  if (!(Array.isArray(h) && h.length === 2 && h.every(isNum) && h[0] >= 0 && h[1] >= h[0])) out.push(`${at}: drive_hrs must be [low, high] in hours`);
  if (!ROAD_TYPES.includes(l.road)) out.push(`${at}: road must be one of ${ROAD_TYPES.join(', ')}`);
  if (!['ok', 'avoid'].includes(l.after_dark)) out.push(`${at}: after_dark must be ok or avoid`);
  if (!STATUSES.includes(l.status)) out.push(`${at}: status must be rough or researched`);
  if (l.status === 'researched' && !l.source) out.push(`${at}: a researched link needs its source`);
  if (l.checked && !/^\d{4}-\d{2}-\d{2}$/.test(l.checked)) out.push(`${at}: checked must be a date like 2026-11-02`);
  return out;
}

// ---- points: places, stays and towns with coordinates
function coords(v) {
  const a = Array.isArray(v) ? v.map(Number) : null;
  return a && a.length === 2 && a.every(Number.isFinite) ? a : null;
}
export function points(v, legs) {
  // A name finds a note first, then a town, then a note's alias ("Dawki" is the town, not the river's alias).
  const byName = new Map();
  const put = (key, p) => { if (!byName.has(lc(key))) byName.set(lc(key), p); };
  const notes = v.notes.filter(n => n.type !== 'transport').map(n => ({ n, p: { name: n.name, kind: n.type === 'location' ? 'place' : 'stay', at: coords(n.d.location),
    area: n.type === 'location' ? n.d.nearest_base : n.d.base_town, decision: n.d.decision, priority: n.d.priority,
    time_needed_hrs: n.type === 'location' ? v.num(n.d.time_needed_hrs) : null } }));
  for (const { n, p } of notes) put(n.name, p);
  for (const [name, at] of Object.entries(legs.towns || {})) put(name, { name, kind: 'town', at: coords(at), area: name });
  for (const { n, p } of notes) for (const a of Array.isArray(n.d.aliases) ? n.d.aliases : []) put(a, p);
  return byName;
}
function resolve(pts, raw) {
  const s = linkName(raw).trim();
  if (!s) return null;
  return pts.get(lc(s)) || pts.get(lc(s.replace(/\s*\([^)]*\)\s*$/, ''))) || null;
}

// ---- rough links
function roughLink(a, b, road, speeds, cls, cutoffs) {
  const straight = haversineKm(a.at, b.at);
  const km = Math.max(1, Math.round(straight * WINDING[road]));
  const hi = ceil1(km / speeds[road]);
  const area = [a, b].map(p => cutoffFor(cutoffs, p.area)).find(Boolean);
  return { from: a.name, to: b.name, km, drive_hrs: [round1(hi * 0.8), hi], road, after_dark: DARK_OK_ROADS.includes(road) ? 'ok' : 'avoid',
    cutoff_area: area ? area.area : null, status: 'rough',
    source: `straight line ${round1(straight)} km × ${WINDING[road]} for ${road} roads, at ${speeds[road]} km/h (${cls}); not researched`, checked: today() };
}
const sameFacts = (x, y) => ['km', 'road', 'after_dark', 'cutoff_area', 'status'].every(k => (x[k] ?? null) === (y[k] ?? null))
  && JSON.stringify(x.drive_hrs) === JSON.stringify(y.drive_hrs) && x.from === y.from && x.to === y.to;

// A leg between two points: the saved link, else a rough one worked out now (not saved), else missing.
function legBetween(legs, a, b, ctx) {
  const saved = findLink(legs, a.name, b.name);
  if (saved && !linkProblems(saved).length) return { ...saved, status_note: saved.status };
  if (!a.at || !b.at) return null;
  return { ...roughLink(a, b, ctx.road, ctx.speeds, ctx.cls, ctx.cutoffs), status_note: 'rough, not saved' };
}
// The cutoff area of a leg: the link's own, else the area of either end when trip.md has a cutoff for it.
function legArea(link, a, b, cutoffs) {
  const own = cutoffFor(cutoffs, link?.cutoff_area);
  if (own) return own.area;
  const end = [a, b].map(p => cutoffFor(cutoffs, p?.area)).find(Boolean);
  return end ? end.area : null;
}

// ---- commands
function context(vault, vehicle) {
  const v = loadVault(vault);
  const settings = loadSettings(v.root, vehicle);
  const legs = readLegs(v);
  const road = legs.rough_road && ROAD_TYPES.includes(legs.rough_road) ? legs.rough_road : 'rural';
  return { v, settings, legs, road, speeds: settings.speeds_kmh, cls: settings.vehicle_class, cutoffs: settings.road_cutoffs, pts: points(v, legs) };
}

export function links(vault, { road, withConsidering = false } = {}) {
  const ctx = context(vault);
  if (road) { if (!ROAD_TYPES.includes(road)) throw new Error(`--road must be one of ${ROAD_TYPES.join(', ')}`); ctx.road = road; }
  const { v, legs } = ctx;
  const want = new Set(withConsidering ? ['selected', 'considering'] : ['selected']);
  const all = [...new Set(ctx.pts.values())];
  const chosen = all.filter(p => (p.kind === 'place' && want.has(p.decision)) || (p.kind === 'stay' && STAY_CANDIDATE.includes(p.decision)) || p.kind === 'town');
  const missing = chosen.filter(p => !p.at).map(p => p.name);
  for (const b of v.trip.bases) if (!resolve(ctx.pts, b)) missing.push(`${b} (a base town in trip.md: save it with "route.mjs town")`);
  const usable = chosen.filter(p => p.at);
  let added = 0, updated = 0, unchanged = 0, kept = 0;
  for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) {
    const a = usable[i], b = usable[j];
    const now = findLink(legs, a.name, b.name);
    if (now && now.status === 'researched') { kept++; continue; }   // never overwrite a researched link
    const fresh = roughLink(a, b, ctx.road, ctx.speeds, ctx.cls, ctx.cutoffs);
    if (!now) { legs.links.push(fresh); added++; }
    else if (sameFacts(now, fresh)) unchanged++;
    else { Object.keys(now).forEach(k => delete now[k]); Object.assign(now, fresh); updated++; }
  }
  legs.rough_road = ctx.road;
  if (added || updated || !fs.existsSync(legsPath(v))) writeLegs(v, legs);
  return { file: path.relative(v.root, legsPath(v)), rough_road: ctx.road, points: usable.length, added, updated, unchanged, researched_kept: kept,
    no_coordinates: missing, links_total: legs.links.length };
}

export function setLink(vault, o) {
  const ctx = context(vault);
  const hrs = String(o.hrs ?? '').split(/[-–,]/).map(Number);
  const link = { from: o.from, to: o.to, km: Number(o.km), drive_hrs: hrs.length === 1 ? [hrs[0], hrs[0]] : hrs, road: o.road,
    after_dark: o.after_dark, cutoff_area: o.cutoff_area || null, status: 'researched', source: o.source, checked: o.checked || today() };
  const bad = linkProblems(link);
  if (bad.length) throw new Error(bad.join('; '));
  const old = findLink(ctx.legs, o.from, o.to);
  if (old) ctx.legs.links.splice(ctx.legs.links.indexOf(old), 1, link); else ctx.legs.links.push(link);
  ctx.legs.rough_road ||= ctx.road;
  writeLegs(ctx.v, ctx.legs);
  return { file: path.relative(ctx.v.root, legsPath(ctx.v)), link, replaced: old ? old.status : null };
}

export function setTown(vault, { name, lat, lng }) {
  const ctx = context(vault);
  const at = [Number(lat), Number(lng)];
  if (!name || !at.every(Number.isFinite)) throw new Error('town needs --name, --lat and --lng');
  ctx.legs.towns[name] = at;
  ctx.legs.rough_road ||= ctx.road;
  writeLegs(ctx.v, ctx.legs);
  return { file: path.relative(ctx.v.root, legsPath(ctx.v)), town: name, at };
}

export function candidates(vault, { from, to, daylight, all = false }) {
  const ctx = context(vault);
  const A = resolve(ctx.pts, from), B = resolve(ctx.pts, to);
  for (const [n, p] of [[from, A], [to, B]]) {
    if (!p) throw new Error(`"${n}" is not a place, stay or town the script knows. Save a town with: route.mjs town --name "${n}" --lat .. --lng ..`);
    if (!p.at) throw new Error(`"${p.name}" has no coordinates`);
  }
  const lim = ctx.settings.limits, buf = ctx.settings.stop_buffer, limit = driveLimit(ctx.v, lim);
  const day = Number.isFinite(Number(daylight)) && daylight !== undefined ? Number(daylight) : ctx.v.trip.daylight_hrs ?? 10;
  const usable = round1(day - lim.slack_ok_hrs);
  const same = A === B;
  const ab = same ? null : legBetween(ctx.legs, A, B, ctx);
  const abHrs = same ? 0 : ab.drive_hrs[1];
  const research = l => (l && l.status === 'researched' ? [] : [`${l ? l.from : '?'} – ${l ? l.to : '?'}`]);
  const out = [], left = [];
  for (const p of new Set(ctx.pts.values())) {
    if (p.kind !== 'place' || p === A || p === B || !p.at || p.decision === 'dropped') continue;
    const ap = legBetween(ctx.legs, A, p, ctx), pb = legBetween(ctx.legs, p, B, ctx);
    const drive = ap.drive_hrs[1] + pb.drive_hrs[1];
    const withStops = round1(drive + (buf.min_per_hour * drive + buf.min_per_stop) / 60);
    const t = p.time_needed_hrs ?? 1;
    const total = round1(withStops + t);
    const detour = Math.round((drive - abHrs) * 60);
    const row = {
      place: p.name, decision: p.decision, priority: p.priority || null, time_needed_hrs: p.time_needed_hrs,
      time_needed_assumed: p.time_needed_hrs === null ? '1 hr assumed: the note has no time_needed_hrs' : undefined,
      drive_hrs: withStops, total_hrs: total, adds_min: same ? null : detour,
      kind: same ? 'day trip' : detour <= lim.on_the_way_min ? 'on the way' : 'detour',
      km: ap.km + pb.km, after_dark_avoid: [ap, pb].some(l => l.after_dark === 'avoid'),
      cutoff_area: legArea(ap, A, p, ctx.cutoffs) || legArea(pb, p, B, ctx.cutoffs),
      links_to_research: [...research(ap), ...research(pb), ...(same ? [] : research(ab))],
    };
    // The day's verdict, by the slack rule: ok (slack_ok_hrs or more left), tight (0 to under it), too much (below 0).
    const slackHrs = round1(day - total);
    const why = [];
    if (withStops > limit.hrs) why.push(`${withStops} hrs of driving is over the ${limit.hrs} hr limit`);
    if (slackHrs < 0) why.push(`${total} hrs is more than the ${day} hrs of daylight (too much)`);
    if (why.length) { left.push({ ...row, fit: 'too much', slack_hrs: slackHrs, why_not: why.join('; ') }); continue; }
    out.push(total > usable
      ? { ...row, fit: 'tight', slack_hrs: slackHrs, why_tight: `${total} hrs leaves ${slackHrs} hrs of the ${day} hrs of daylight, under the ${lim.slack_ok_hrs} hrs of slack an ok day has: a big day the group has to accept` }
      : { ...row, fit: 'ok', slack_hrs: slackHrs });
  }
  const order = (a, b) => (a.fit === b.fit ? 0 : a.fit === 'ok' ? -1 : b.fit === 'ok' ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'on the way' ? -1 : b.kind === 'on the way' ? 1 : 0)
    || (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || (a.adds_min ?? a.drive_hrs) - (b.adds_min ?? b.drive_hrs);
  out.sort(order); left.sort(order);
  return {
    from: A.name, to: B.name, day_trip: same,
    rule: 'A→P + time at P + P→B: the drive (with stops) within the drive limit, and the whole within the daylight: ok with slack_ok_hrs or more to spare, tight with less (a big day the group must accept), too much (left out) over the daylight. No fixed reach.',
    limits: { drive_limit_hrs: limit.hrs, drive_limit_from: limit.from, daylight_hrs: day, daylight_from: daylight !== undefined ? '--daylight' : 'trip.md daylight_hrs (season default)',
      slack_ok_hrs: lim.slack_ok_hrs, usable_hrs: usable, on_the_way_min: lim.on_the_way_min, stop_buffer: buf, vehicle_class: ctx.cls },
    direct: same ? null : { km: ab.km, drive_hrs: ab.drive_hrs, status: ab.status_note },
    candidates: out, left_out: all ? left : left.length,
  };
}

// ---- the Route note's Day by day table
export function dayByDay(text) {
  const body = text.replace(/^---[\s\S]*?\n---\r?\n?/, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = body.match(/^## Day by day[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return null;
  const rows = m[1].split(/\r?\n/).filter(l => /^\s*\|/.test(l))
    .map(l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|(?![^[]*\]\])/).map(c => c.trim()))
    .filter(r => !r.every(c => /^:?-+:?$/.test(c)));
  const head = (rows.shift() || []).map(c => c.toLowerCase());
  const col = n => head.findIndex(h => h.startsWith(n));
  const [cDay, cStart, cStops, cEnd, cNight] = ['day', 'start', 'main stops', 'end', 'night'].map(col);
  return rows.map(r => ({ day: r[cDay] ?? '', start: r[cStart] ?? '', stops: r[cStops] ?? '', end: r[cEnd] ?? '', night: r[cNight] ?? '' }))
    .filter(r => [r.start, r.stops, r.end, r.night].some(c => c && !/^[-–—]$/.test(c)));
}
const NO_NIGHT = /^(|[-–—]+|none|fly home|home|departure)$/i;
const splitStops = s => String(s || '').split(/\s*(?:→|->|,|;)\s*/).map(x => x.trim()).filter(x => x && !/^[-–—]$/.test(x));

export function check(vault, { route, sunset, daylight, vehicle } = {}) {
  const ctx = context(vault, vehicle);
  const { v, settings } = ctx;
  const file = path.resolve(v.root, route);
  if (!fs.existsSync(file)) throw new Error(`no such Route note: ${route}`);
  const text = fs.readFileSync(file, 'utf8');
  const days = dayByDay(text);
  if (!days || !days.length) throw new Error(`${route} has no filled "Day by day" table`);
  const limit = driveLimit(v, settings.limits);
  const runSettings = { ...settings, limits: { ...settings.limits, max_drive_hrs_day: limit.hrs } };
  const sunsetT = sunset || v.trip.sunset || '18:00';
  const day = daylight !== undefined ? Number(daylight) : v.trip.daylight_hrs ?? 10;
  const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const sr = toMin(sunsetT) - Math.round(day * 60);
  const sunrise = `${String(Math.floor(sr / 60)).padStart(2, '0')}:${String(sr % 60).padStart(2, '0')}`;
  const evening = (v.trip.evening_bases || []).map(lc);

  const unknown = new Set(), research = new Map(), driven = new Map(), repeats = new Map();
  const out = [];
  for (const [i, row] of days.entries()) {
    const time = row.start.match(/\b(\d{1,2}):(\d{2})\b/);
    const startAt = time ? `${time[1].padStart(2, '0')}:${time[2]}` : (v.trip.day_start || '08:00');
    const startName = row.start.replace(/\b\d{1,2}:\d{2}\b/, '').replace(/^[\s,;·–-]+|[\s,;·–-]+$/g, '');
    const names = [startName, ...splitStops(row.stops), row.end].filter(Boolean);
    const pts = names.map(n => { const p = resolve(ctx.pts, n); if (!p) unknown.add(linkName(n)); return p ? p : { name: linkName(n), at: null }; });
    const path_ = pts.filter((p, k) => k === 0 || lc(p.name) !== lc(pts[k - 1].name));
    const legs = [], missing = [];
    let backtrack = 0;
    for (let k = 1; k < path_.length; k++) {
      const a = path_[k - 1], b = path_[k];
      const l = a.at && b.at ? legBetween(ctx.legs, a, b, ctx) : (findLink(ctx.legs, a.name, b.name) || null);
      if (!l) { missing.push(`${a.name} – ${b.name}`); continue; }
      if (l.status !== 'researched') research.set(pairKey(a.name, b.name), `${a.name} – ${b.name}`);
      // doubling back: this road was already driven (on an earlier leg), unless this leg goes straight back from a stop
      const key = pairKey(a.name, b.name), prev = legs[legs.length - 1];
      const spur = prev && pairKey(prev.from, prev.to) === key && a.kind === 'place';
      if (driven.has(key) && !spur) {
        backtrack += l.km;
        const r = repeats.get(key) || { road: `${a.name} – ${b.name}`, km: l.km, times: driven.get(key).length, days: [...new Set(driven.get(key))] };
        r.times++; if (!r.days.includes(i + 1)) r.days.push(i + 1); repeats.set(key, r);
      }
      driven.set(key, [...(driven.get(key) || []), i + 1]);
      const last = k === path_.length - 1;
      legs.push({ from: a.name, to: b.name, km: l.km, road: l.road, map_hrs: l.drive_hrs, after_dark: l.after_dark,
        stay_hrs: !last && b.kind === 'place' ? (b.time_needed_hrs ?? 1) : 0, cutoff_area: legArea(l, a, b, ctx.cutoffs), status: l.status_note || l.status });
    }
    const places = path_.filter((p, k) => p.kind === 'place' && k > 0 && k < path_.length - 1);
    const activity = round1(places.reduce((s, p) => s + (p.time_needed_hrs ?? 1), 0));
    const nightRaw = linkName(row.night);
    const nightPt = NO_NIGHT.test(nightRaw) ? null : resolve(ctx.pts, nightRaw);
    const nightTown = NO_NIGHT.test(nightRaw) ? null : (nightPt && nightPt.kind === 'stay' ? nightPt.area : nightRaw);
    let res = null;
    if (legs.length) {
      res = checkDay({ start: startAt, sunrise, sunset: sunsetT, daylight_hrs: day, activity_hrs: activity,
        evening_base_end: nightTown && evening.length ? evening.includes(lc(nightTown)) : undefined,
        legs: legs.map(({ status, ...l }) => ({ from: l.from, to: l.to, after_dark: l.after_dark, stay_hrs: l.stay_hrs, cutoff_area: l.cutoff_area, map_hrs: l.map_hrs, segments: [{ km: l.km, road: l.road }] })) }, runSettings);
    }
    out.push({
      day: Number(row.day) || i + 1, start: `${startAt}, ${startName}`, stops: places.map(p => p.name), end: row.end ? linkName(row.end) : null, night: nightTown,
      km: legs.reduce((s, l) => s + l.km, 0), backtrack_km: backtrack,
      drive_hrs: res ? res.day.drive_hrs : 0, drive_text: res ? res.day.drive_text : 'no driving', over_max_drive: res ? res.day.over_max_drive : false,
      activity_hrs: activity, ends_at: res ? res.day.ends_at : null, slack: res ? res.day.slack : null,
      verdict: res ? res.day.verdict : 'ok', reasons: res ? res.day.reasons : [], leave_earlier: res ? res.day.leave_earlier : null,
      legs: (res ? res.legs : []).map((l, k) => ({ from: l.from, to: l.to, km: l.km, range: l.range.text, depart: l.depart, arrive: l.arrive, after_dark: l.after_dark,
        dark_driving_min: l.dark_driving_min, cutoff_area: l.cutoff_area, after_cutoff_min: l.after_cutoff_min, link: legs[k].status })),
      missing_links: missing,
    });
  }

  // must places, nights and stays
  const allPts = [...new Set(ctx.pts.values())];
  const must = allPts.filter(p => p.kind === 'place' && p.decision === 'selected' && p.priority === 'must');
  const where = name => out.filter(d => d.stops.includes(name)).map(d => d.day);
  const nights = out.filter(d => d.night).map(d => {
    const stays = allPts.filter(p => p.kind === 'stay' && lc(p.area) === lc(d.night) && STAY_CANDIDATE.includes(p.decision));
    const sel = stays.filter(s => s.decision === 'selected');
    return { day: d.day, town: d.night, stay: sel.length ? sel.map(s => s.name) : null, candidates: sel.length ? [] : stays.map(s => s.name) };
  });
  const counts = { ok: 0, tight: 0, 'too much': 0 };
  out.forEach(d => counts[d.verdict]++);
  const fm = frontmatter(text) || {};
  return {
    route: path.relative(v.root, file), status: fm.status || null,
    settings: { vehicle_class: settings.vehicle_class, drive_limit_hrs: limit.hrs, drive_limit_from: limit.from, sunset: sunsetT, sunrise, daylight_hrs: day,
      sun_from: sunset || daylight !== undefined ? 'given on the command line' : 'trip.md season defaults (sunset, daylight_hrs), not worked out per date',
      road_cutoffs: settings.road_cutoffs, limits: settings.limits },
    days: out,
    trip: {
      days: out.length, nights: nights.length, km: out.reduce((s, d) => s + d.km, 0), drive_hrs: round1(out.reduce((s, d) => s + d.drive_hrs, 0)),
      longest_day: out.reduce((a, d) => (d.drive_hrs > (a?.drive_hrs ?? -1) ? d : a), null)?.day ?? null,
      verdicts: counts, days_over_drive_limit: out.filter(d => d.over_max_drive).map(d => d.day),
      cutoff_breaks: out.flatMap(d => d.legs.filter(l => l.after_cutoff_min > 0).map(l => ({ day: d.day, leg: `${l.from} – ${l.to}`, area: l.cutoff_area, minutes: l.after_cutoff_min }))),
      after_dark: out.flatMap(d => d.legs.filter(l => l.dark_driving_min > 0).map(l => ({ day: d.day, leg: `${l.from} – ${l.to}`, minutes: l.dark_driving_min }))),
      doubling_back: { km: [...repeats.values()].reduce((s, r) => s + r.km * (r.times - 1), 0), roads: [...repeats.values()] },
      must_places: { covered: must.filter(p => where(p.name).length).map(p => ({ place: p.name, days: where(p.name) })), missed: must.filter(p => !where(p.name).length).map(p => p.name) },
      nights_without_stay: nights.filter(n => !n.stay && !n.candidates.length).map(n => ({ day: n.day, town: n.town })),
      stays: nights,
      links_to_research: [...research.values()],
      unknown_points: [...unknown],
    },
  };
}

// ---- command line
function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const vault = opt('--vault') || process.cwd();
  if (cmd === 'links') return links(vault, { road: opt('--road'), withConsidering: rest.includes('--with-considering') });
  if (cmd === 'link') return setLink(vault, { from: opt('--from'), to: opt('--to'), km: opt('--km'), hrs: opt('--hrs'), road: opt('--road'),
    after_dark: opt('--after-dark'), cutoff_area: opt('--cutoff-area'), source: opt('--source'), checked: opt('--checked') });
  if (cmd === 'town') return setTown(vault, { name: opt('--name'), lat: opt('--lat'), lng: opt('--lng') });
  if (cmd === 'candidates') {
    if (!opt('--from') || !opt('--to')) throw new Error('candidates needs --from and --to (the same town for a day trip)');
    return candidates(vault, { from: opt('--from'), to: opt('--to'), daylight: opt('--daylight'), all: rest.includes('--all') });
  }
  if (cmd === 'check') {
    if (!opt('--route')) throw new Error('check needs --route <Route note>');
    return check(vault, { route: opt('--route'), sunset: opt('--sunset'), daylight: opt('--daylight'), vehicle: opt('--vehicle') });
  }
  throw new Error('usage: route.mjs links | link | town | candidates --from A --to B | check --route <note>  [--vault <folder>] (see the top of this file)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (e) { console.error(`route.mjs: ${e.message}`); process.exit(2); }
}
