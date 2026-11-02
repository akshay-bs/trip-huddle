#!/usr/bin/env node
// Travel-time helper for the review-travel-times skill. Plain Node, no dependencies.
//
//   node travel.mjs config [--vault <folder>] [--vehicle car|group]
//   node travel.mjs check --input <day.json> [--vault <folder>] [--vehicle car|group]
//
// `config` prints the settings in force: vehicle class, speeds (km/h), the stops buffer and the planning limits. They come from the
// plan's defaults, changed by `road_speeds`, `stop_buffer` and `planning_limits` in trip.md (in --vault <folder>, or the current folder).
// `check` takes one day's legs (JSON, see references/checked-example-input.json) and prints one JSON object:
// the road-type time for each leg, the estimate kept, the checked range, the stops buffer, the day's drive hours,
// the slack and verdict (the same rule as the Itinerary base, from plan-day/scripts/sun.mjs), the driving that falls
// after sunset on `avoid` legs, the driving after a road cutoff (`road_cutoffs` in trip.md; a leg names its area in
// `cutoff_area`; unagreed it is "too much" from the first minute, agreed it is "tight"), whether the day is over `max_drive_hrs_day`, and a day verdict that takes the worst of them.
//
// Vehicle class: `group` for a van, bus, coach or anything with 6 or more seats, else `car`. It is read from
// `group_vehicle` in trip.md. A flag (--vehicle) or "vehicle" in the input overrides it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slack, toMinutes } from '../../plan-day/scripts/sun.mjs';
import { tripSetting, tripFrontmatter, strictPlanningLimits, strictRoadCutoffs, cutoffFor, PLANNING_LIMIT_DEFAULTS } from '../../../scripts/trip-settings.mjs';
export { tripSetting };

// ---- the approved defaults. Keep in step with docs/PLAN-travel-times.md and review-travel-times/SKILL.md.
export const ROAD_TYPES = ['motorway', 'highway', 'rural', 'hill', 'city', 'track'];
export const CLASSES = ['car', 'group'];
export const DEFAULT_SPEEDS = {   // km/h
  motorway: { car: 70, group: 55 },   // motorway or 4-lane road
  highway: { car: 50, group: 40 },    // 2-lane highway
  rural: { car: 35, group: 28 },
  hill: { car: 30, group: 22 },       // hill or mountain road
  city: { car: 20, group: 15 },
  track: { car: 15, group: 10 },      // rough track
};
export const DEFAULT_STOP_BUFFER = { min_per_hour: 10, min_per_stop: 15 };
// ---- how the day verdict is made (guidelines, not law; the group may bend them). These are the defaults of the
// `planning_limits` in trip.md (slack_ok_hrs, dark_drive_tight_min, late_finish_min, max_drive_hrs_day), which change them.
export const DARK_TOO_MUCH_MIN = PLANNING_LIMIT_DEFAULTS.dark_drive_tight_min;   // driving an `avoid` leg this long after sunset (or before sunrise), unagreed, is "too much"; less is "tight"
export const LATE_ARRIVAL_MIN = PLANNING_LIMIT_DEFAULTS.late_finish_min;         // a day that ends at a base without evenings out is "tight" if it ends this long after sunset

const RANK = { ok: 0, tight: 1, 'too much': 2 };
const NAMES = Object.keys(RANK);
const round1 = x => Math.round(x * 10) / 10;
const ceil1 = x => Math.ceil(x * 10 - 1e-9) / 10;
const mod = (a, n) => ((a % n) + n) % n;
const hhmm = min => { const r = Math.round(mod(min, 1440)) % 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`; };
const hm = hrs => { const m = Math.round(hrs * 12) * 5; return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };   // nearest 5 minutes
const isNum = x => typeof x === 'number' && Number.isFinite(x);

// ---- settings
// Problems with a road_speeds / stop_buffer value, as plain sentences (empty list = fine). trip-init uses this too.
export function settingsProblems(roadSpeeds, stopBuffer) {
  const out = [];
  const isMap = x => x && typeof x === 'object' && !Array.isArray(x);
  if (roadSpeeds !== undefined && roadSpeeds !== null) {
    if (!isMap(roadSpeeds)) out.push('road_speeds must be a map like {hill: {car: 30, group: 22}}');
    else for (const [type, v] of Object.entries(roadSpeeds)) {
      if (!ROAD_TYPES.includes(type)) { out.push(`road_speeds: "${type}" is not a road type (use: ${ROAD_TYPES.join(', ')})`); continue; }
      if (isNum(v)) { if (!(v > 0)) out.push(`road_speeds.${type} must be above 0`); continue; }
      if (!isMap(v)) { out.push(`road_speeds.${type} must be a number or {car: N, group: N}`); continue; }
      for (const [cls, s] of Object.entries(v)) {
        if (!CLASSES.includes(cls)) out.push(`road_speeds.${type}: "${cls}" is not a vehicle class (use: ${CLASSES.join(', ')})`);
        else if (!(isNum(s) && s > 0)) out.push(`road_speeds.${type}.${cls} must be a speed in km/h above 0`);
      }
    }
  }
  if (stopBuffer !== undefined && stopBuffer !== null) {
    if (!isMap(stopBuffer)) out.push('stop_buffer must be a map like {min_per_hour: 10, min_per_stop: 15}');
    else for (const [k, v] of Object.entries(stopBuffer)) {
      if (!(k in DEFAULT_STOP_BUFFER)) out.push(`stop_buffer: "${k}" is not a setting (use: ${Object.keys(DEFAULT_STOP_BUFFER).join(', ')})`);
      else if (!(isNum(v) && v >= 0)) out.push(`stop_buffer.${k} must be a number of minutes, 0 or more`);
    }
  }
  return out;
}

// car or group, from the words in group_vehicle.
export function vehicleClass(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return { cls: 'car', why: 'no group_vehicle in trip.md, so car speeds are used' };
  const seats = t.match(/\b(\d{1,2})[\s-]*(?:seats?|seater|pax|passengers?)\b/);
  const word = t.match(/\b(van|minivan|minibus|bus|coach|tempo|traveller|traveler|sprinter|campervan|motorhome|people.?carrier)\b/);
  if (word) return { cls: 'group', why: `group_vehicle "${text}" mentions a ${word[1]}` };
  if (seats && Number(seats[1]) >= 6) return { cls: 'group', why: `group_vehicle "${text}" has ${seats[1]} seats` };
  return { cls: 'car', why: `group_vehicle "${text}" reads as a car` };
}

export function loadSettings(vault, vehicleOverride) {
  const fm = tripFrontmatter(vault);   // '' when there is no trip.md: defaults
  const roadSpeeds = tripSetting(fm, 'road_speeds'), stopBuffer = tripSetting(fm, 'stop_buffer');
  const problems = settingsProblems(roadSpeeds, stopBuffer);
  if (problems.length) throw new Error('trip.md has a problem:\n  - ' + problems.join('\n  - '));
  const speeds = JSON.parse(JSON.stringify(DEFAULT_SPEEDS));
  for (const [type, v] of Object.entries(roadSpeeds || {})) {
    if (isNum(v)) for (const c of CLASSES) speeds[type][c] = v;
    else Object.assign(speeds[type], v);
  }
  const buffer = { ...DEFAULT_STOP_BUFFER, ...(stopBuffer || {}) };
  const planning = strictPlanningLimits(vault);
  const roadCutoffs = strictRoadCutoffs(vault);
  let vehicle;
  if (vehicleOverride) {
    if (!CLASSES.includes(vehicleOverride)) throw new Error(`vehicle must be car or group, got "${vehicleOverride}"`);
    vehicle = { cls: vehicleOverride, why: 'chosen for this check, not read from trip.md' };
  } else vehicle = vehicleClass(tripSetting(fm, 'group_vehicle'));
  return {
    vehicle_class: vehicle.cls, vehicle_why: vehicle.why,
    speeds_kmh: Object.fromEntries(ROAD_TYPES.map(t => [t, speeds[t][vehicle.cls]])),
    stop_buffer: buffer,
    limits: planning.limits,
    road_cutoffs: roadCutoffs.map(({ min, ...c }) => c),
    changed_in_trip_md: { road_speeds: roadSpeeds ? Object.keys(roadSpeeds) : [], stop_buffer: stopBuffer ? Object.keys(stopBuffer) : [], planning_limits: planning.changed },
  };
}

// ---- one leg
const range = x => {   // number or [lo, hi] -> {lo, hi}, or null
  if (x === undefined || x === null || x === '') return null;
  const [lo, hi] = Array.isArray(x) ? x : [x, x];
  if (!(isNum(lo) && isNum(hi) && lo >= 0 && hi >= lo)) throw new Error(`an estimate must be hours like 1.5 or [1.2, 1.8], got ${JSON.stringify(x)}`);
  return { lo, hi };
};
const rangeText = (lo, hi) => {
  const f = n => String(n).replace(/\.0$/, '');
  return lo === hi ? `~${f(hi)} hrs` : `${f(lo)}–${f(hi)} hrs`;
};

function legEstimates(leg, speeds) {
  const label = `${leg.from || '?'} to ${leg.to || '?'}`;
  const segs = Array.isArray(leg.segments) && leg.segments.length ? leg.segments : [{ km: leg.km, road: leg.road }];
  let km = 0, hrs = 0;
  for (const s of segs) {
    if (!(isNum(s.km) && s.km >= 0)) throw new Error(`leg ${label}: km must be a number`);
    if (!ROAD_TYPES.includes(s.road)) throw new Error(`leg ${label}: road must be one of ${ROAD_TYPES.join(', ')}, got "${s.road}"`);
    km += s.km; hrs += s.km / speeds[s.road];
  }
  const est = { road: { lo: hrs, hi: hrs }, map: range(leg.map_hrs), reports: range(leg.reports_hrs) };
  const have = Object.entries(est).filter(([, v]) => v);
  let keep = leg.keep;
  if (keep !== undefined) {
    if (!est[keep]) throw new Error(`leg ${label}: keep is "${keep}", but there is no such estimate`);
    if (!leg.keep_reason) throw new Error(`leg ${label}: say why in keep_reason when you keep an estimate that is not the slowest`);
  } else keep = have.reduce((a, b) => (b[1].hi > a[1].hi ? b : a))[0];   // the slowest; ties go to the first (road, map, reports)
  const kept = est[keep];
  const low = Math.min(...have.map(([, v]) => v.lo), kept.hi);
  const lo = Math.round(low * 10) / 10, hi = ceil1(kept.hi);
  const mapHi = est.map ? est.map.hi : null;
  return {
    from: leg.from, to: leg.to, km,
    road: segs.length === 1 ? segs[0].road : 'mixed',
    road_hrs: Math.round(hrs * 100) / 100, road_hm: hm(hrs),
    map_hrs: est.map ? [est.map.lo, est.map.hi] : null, map_hm: est.map ? hm(est.map.hi) : null,
    reports_hrs: est.reports ? [est.reports.lo, est.reports.hi] : null,
    kept_source: keep, kept_hrs: Math.round(kept.hi * 100) / 100,
    keep_reason: leg.keep_reason || (est[keep] && have.length > 1 ? `the slowest of ${have.map(([k]) => k).join(', ')}` : 'the only estimate'),
    range: { low: Math.min(lo, hi), high: hi, text: rangeText(Math.min(lo, hi), hi) },
    slower_than_map_min: mapHi === null ? null : Math.round((hi - mapHi) * 60),
  };
}

// ---- one day
export function checkDay(input, settings) {
  if (!input || !Array.isArray(input.legs) || !input.legs.length) throw new Error('the input needs a "legs" list');
  const { speeds_kmh, stop_buffer: buf } = settings;
  const cutoffs = (settings.road_cutoffs || []).map(c => ({ ...c, min: toMinutes(c.no_drive_after) }));
  const lim = { ...PLANNING_LIMIT_DEFAULTS, ...(settings.limits || {}) };   // planning_limits from trip.md
  const legs = input.legs.map(l => ({ src: l, ...legEstimates(l, speeds_kmh) }));
  const extraStops = input.legs.reduce((n, l) => n + (isNum(l.extra_stops) ? l.extra_stops : 0), 0);
  const stops = legs.length - 1 + extraStops;
  const driveLegs = round1(legs.reduce((s, l) => s + l.range.high, 0));
  const bufferHrs = round1((buf.min_per_hour * driveLegs + buf.min_per_stop * stops) / 60);
  const driveHrs = round1(driveLegs + bufferHrs);

  const sunset = input.sunset ? toMinutes(input.sunset) : null, sunrise = input.sunrise ? toMinutes(input.sunrise) : null;
  const daylight = Number(input.daylight_hrs);
  const darkOverlap = (a, b) => (sunrise === null ? 0 : Math.max(0, Math.min(b, sunrise) - a)) + (sunset === null ? 0 : Math.max(0, b - Math.max(a, sunset)));

  // The day on a clock: drive (with the break time per driving hour), then the stay at the place and the stop handling.
  const timeline = shift => {
    let t = toMinutes(input.start) - shift;
    return legs.map((l, i) => {
      const depart = t, last = i === legs.length - 1;
      const drive = l.range.high * (60 + buf.min_per_hour) + (isNum(l.src.extra_stops) ? l.src.extra_stops : 0) * buf.min_per_stop;
      const arrive = depart + drive;
      t = arrive + (last ? 0 : (isNum(l.src.stay_hrs) ? l.src.stay_hrs : 0) * 60 + buf.min_per_stop);
      const dark = String(l.src.after_dark || '').toLowerCase() === 'avoid' ? Math.round(darkOverlap(depart, arrive)) : 0;
      const agreed = l.src.bent ? (isNum(l.src.agreed_dark_min) ? l.src.agreed_dark_min : Infinity) : 0;
      // A road cutoff: the minutes of this leg driven after the area's no_drive_after time (the leg ends after it).
      const cut = cutoffFor(cutoffs, l.src.cutoff_area);
      const late = cut ? Math.round(Math.max(0, arrive - Math.max(depart, cut.min))) : 0;
      const agreedLate = l.src.bent ? (isNum(l.src.agreed_cutoff_min) ? l.src.agreed_cutoff_min : Infinity) : 0;
      return { depart, arrive, dark, agreed, uncovered: Math.max(0, dark - agreed), cut, late, lateUncovered: Math.max(0, late - agreedLate) };
    });
  };
  const rankOf = min => (min > lim.dark_drive_tight_min ? 2 : min > 0 ? 1 : 0);
  // A road cutoff is firmer than darkness: any unagreed minute after it is "too much" (no tight band).
  const darkRank = tl => Math.max(0, ...tl.map(x => Math.max(rankOf(x.uncovered), x.lateUncovered > 0 ? 2 : 0)));
  if (!input.start) throw new Error('the input needs "start" (the time the first drive begins, like "08:30")');
  const tl = timeline(0);
  legs.forEach((l, i) => Object.assign(l, {
    depart: hhmm(tl[i].depart), arrive: hhmm(tl[i].arrive), after_dark: l.src.after_dark || null,
    dark_driving_min: tl[i].dark, bent: !!l.src.bent, agreed_dark_min: isNum(l.src.agreed_dark_min) ? l.src.agreed_dark_min : null,
    worse_than_agreed: !!l.src.bent && isNum(l.src.agreed_dark_min) && tl[i].dark > l.src.agreed_dark_min,
    cutoff_area: tl[i].cut ? tl[i].cut.area : (l.src.cutoff_area || null), no_drive_after: tl[i].cut ? tl[i].cut.no_drive_after : null,
    after_cutoff_min: tl[i].late,
  }));

  const reasons = [];
  const verdicts = [];
  const add = (v, text) => { verdicts.push(v); reasons.push({ verdict: v, text }); };

  // 1. Daylight left over (the same rule as the Itinerary base)
  let sl = null;
  if (Number.isFinite(daylight) && daylight > 0) {
    const act = Number(input.activity_hrs) || 0, pre = Number(input.predawn_hrs) || 0;
    sl = slack({ daylight, drive: driveHrs, activity: act, predawn: pre, okHrs: lim.slack_ok_hrs });
    if (sl.verdict !== 'ok') add(sl.verdict, `${driveHrs} hrs of driving including stops, plus ${act} hrs at the places, leaves ${sl.slack_hrs} hrs of ${daylight} hrs of daylight`);
  }
  // 2. Driving an `avoid` leg after sunset or before sunrise, beyond what the group agreed to
  for (const [i, x] of tl.entries()) {
    if (!x.uncovered) continue;
    const l = legs[i];
    add(x.uncovered > lim.dark_drive_tight_min ? 'too much' : 'tight',
      `${l.from} to ${l.to} is a road to avoid in the dark, and the checked times put ${x.uncovered} min of it ${sunset !== null && tl[i].arrive > sunset ? 'after sunset' : 'before sunrise'}${l.bent ? ' on top of what was agreed' : ''}`);
  }
  // 2b. Driving in a road-cutoff area after its time (trip.md road_cutoffs). Unagreed, even one minute is "too much";
  // a break the group recorded as a rule bend is "tight (1 rule bend)", like the other bends.
  for (const [i, x] of tl.entries()) {
    const l = legs[i], where = x.cut ? `${l.from} to ${l.to} is in the ${x.cut.area} area, where nobody drives after ${x.cut.no_drive_after}${x.cut.reason ? ` (${x.cut.reason})` : ''}` : '';
    if (x.lateUncovered) add('too much', `${where}, and the checked times put ${x.lateUncovered} min of it after that${l.bent ? ' on top of what was agreed' : ''}`);
    else if (x.late) add('tight', `${where}; the checked times put ${x.late} min of it after that, as the group agreed (1 rule bend)`);
  }
  // 3. A day that ends late somewhere without evenings out
  const homeAt = tl[tl.length - 1].arrive;
  const lateBy = sunset === null ? 0 : Math.round(homeAt - sunset);
  if (input.evening_base_end === false && lateBy > lim.late_finish_min) add('tight', `the day ends ${lateBy} min after sunset at a base without evenings out`);
  // 4. A road that is closed
  for (const l of legs) if (l.src.blocked) add('too much', `${l.from} to ${l.to}: ${l.src.blocked}`);

  const verdict = verdicts.length ? NAMES[Math.max(...verdicts.map(v => RANK[v]))] : 'ok';
  let leaveEarlier = null;
  if (darkRank(tl) > 0) {
    for (let m = 15; m <= 240; m += 15) if (darkRank(timeline(m)) === 0) { leaveEarlier = { minutes: m, start: hhmm(toMinutes(input.start) - m) }; break; }
  }
  const predawnDrive = sunrise === null ? 0 : tl.reduce((s, x) => s + Math.max(0, Math.min(x.arrive, sunrise) - x.depart), 0) / 60;

  return {
    legs: legs.map(({ src, ...rest }) => rest),
    day: {
      date: input.date || null, start: input.start, sunrise: input.sunrise || null, sunset: input.sunset || null,
      drive_legs_hrs: driveLegs, stops, buffer_hrs: bufferHrs, drive_hrs: driveHrs,
      max_drive_hrs_day: lim.max_drive_hrs_day, over_max_drive: driveHrs > lim.max_drive_hrs_day,
      drive_text: `${driveHrs} hrs (${driveLegs} of driving + ${bufferHrs} for stops)`,
      predawn_drive_hrs: round1(predawnDrive),
      slack: sl, ends_at: hhmm(homeAt), ends_min_after_sunset: sunset === null ? null : lateBy,
      leave_earlier: leaveEarlier,
      verdict, reasons,
    },
  };
}

// ---- command line
function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const vault = opt('--vault') || process.cwd();
  if (cmd === 'config') return loadSettings(vault, opt('--vehicle'));
  if (cmd === 'check') {
    const file = opt('--input');
    if (!file) throw new Error('missing --input <file.json>');
    let input;
    try { input = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { throw new Error(`can't read ${file}: ${e.message}`); }
    const settings = loadSettings(vault, opt('--vehicle') || input.vehicle);
    return { settings: { vehicle_class: settings.vehicle_class, vehicle_why: settings.vehicle_why, speeds_kmh: settings.speeds_kmh, stop_buffer: settings.stop_buffer, limits: settings.limits, road_cutoffs: settings.road_cutoffs }, ...checkDay(input, settings) };
  }
  throw new Error('usage: travel.mjs config [--vault <folder>] [--vehicle car|group]\n       travel.mjs check --input <day.json> [--vault <folder>] [--vehicle car|group]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (e) { console.error(`travel.mjs: ${e.message}`); process.exit(2); }
}
