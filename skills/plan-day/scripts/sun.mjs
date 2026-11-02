#!/usr/bin/env node
// Sunrise, sunset and day-slack helper for the plan-day skill. Plain Node, no dependencies.
//
//   node sun.mjs times --date 2027-06-08 --lat 37.1 --lng -8.67 --tz Europe/Lisbon
//   node sun.mjs times --date 2027-06-08 --lat 37.1 --lng -8.67 --utc-offset 1
//   node sun.mjs times --date 2027-06-08            (no coordinates: falls back to trip.md)
//   node sun.mjs slack --daylight 14.9 --drive 3.5 --activity 5 [--predawn 0] [--vault <folder>]
//
// `times` uses the NOAA solar formulas (Meeus), good to about 1-2 minutes between 60 N and 60 S.
// It prints one JSON object. Times are local, "HH:MM". Without coordinates it reads daylight_hrs and
// sunset from trip.md (in --vault <folder>, or the current folder) and says so in "source".
// `slack` applies the verdict thresholds below. The "ok" threshold is `slack_ok_hrs` from `planning_limits` in trip.md
// (in --vault <folder>, or the current folder; 1.5 when trip.md has none). The Itinerary base cannot read trip.md, so
// trip-init writes the same number into it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANNING_LIMIT_DEFAULTS, strictPlanningLimits } from '../../../scripts/trip-settings.mjs';

// ---- verdict thresholds (hours of slack). Keep in step with Bases/Itinerary.base and plan-day/SKILL.md.
// TIGHT_BELOW_HRS is the default of `slack_ok_hrs` in trip.md's planning_limits; `slack` takes the vault's own value.
export const TIGHT_BELOW_HRS = PLANNING_LIMIT_DEFAULTS.slack_ok_hrs;   // slack under this is "tight"
export const TOO_MUCH_BELOW_HRS = 0;  // slack under this is "too much"

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

// Julian day at 00:00 UTC of a calendar date.
const julianDay0 = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;

// Sun declination (rad) and equation of time (minutes) at a Julian day.
function solarPosition(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const y = Math.tan(rad(eps) / 2) ** 2;
  const eq = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  return { decl, eq };
}

// UTC minutes after 00:00 UTC of the date when the sun is at `zenith` degrees (rising or setting).
// Returns 'up' (never sets) or 'down' (never rises) when there is no crossing.
function crossing(jd0, lat, lng, zenith, rising) {
  let m = 720 - 4 * lng;                                 // start from solar noon
  for (let pass = 0; pass < 3; pass++) {
    const { decl, eq } = solarPosition(jd0 + m / 1440);
    const c = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
    if (c > 1) return 'down';
    if (c < -1) return 'up';
    const ha = deg(Math.acos(c));
    m = 720 - 4 * (lng + (rising ? ha : -ha)) - eq;
  }
  return m;
}

// UTC offset in minutes of an IANA time zone on a date (read at noon UTC of that date).
export function tzOffsetMinutes(tz, y, m, d) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).find(p => p.type === 'timeZoneName')?.value || '';
  if (name === 'GMT' || name === 'UTC') return 0;
  const mm = name.match(/^GMT([+-])(\d{1,2}):?(\d{2})?$/);
  if (!mm) throw new Error(`can't read the UTC offset of time zone "${tz}"`);
  return (mm[1] === '-' ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3] || 0));
}

const hhmm = min => { const r = Math.round(mod(min, 1440)) % 1440; return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`; };
export const toMinutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t)); if (!m) throw new Error(`"${t}" is not a time like 06:30`); return Number(m[1]) * 60 + Number(m[2]); };

// Sunrise, sunset and civil twilight for a date and place. `offsetMin` is the local UTC offset in minutes.
export function sunTimes(date, lat, lng, offsetMin) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dm) throw new Error(`date must look like 2027-06-08, got "${date}"`);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new Error(`coordinates out of range: ${lat}, ${lng}`);
  const jd0 = julianDay0(+dm[1], +dm[2], +dm[3]);   // 00:00 UTC of the date
  const at = (zenith, rising) => crossing(jd0, lat, lng, zenith, rising);
  const rise = at(90.833, true), set = at(90.833, false);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3])).getUTCDay()];
  const out = { date, weekday, lat, lng, utc_offset_min: offsetMin };
  if (typeof rise !== 'number' || typeof set !== 'number') {
    out.polar = rise === 'up' || set === 'up' ? 'day' : 'night';
    out.sunrise = null; out.sunset = null; out.first_light = null; out.last_light = null;
    out.daylight_hrs = out.polar === 'day' ? 24 : 0;
    return out;
  }
  const dawn = at(96, true), dusk = at(96, false);
  const local = m => m + offsetMin;
  out.sunrise = hhmm(local(rise)); out.sunset = hhmm(local(set));
  out.first_light = typeof dawn === 'number' ? hhmm(local(dawn)) : null;
  out.last_light = typeof dusk === 'number' ? hhmm(local(dusk)) : null;
  out.daylight_hrs = Math.round(mod(set - rise, 1440) / 6) / 10;
  return out;
}

// Slack = daylight - (drive + activity - predawn). Pre-dawn hours are counted separately, not against daylight.
export function slack({ daylight, drive, activity, predawn = 0, okHrs = TIGHT_BELOW_HRS }) {
  const nums = { daylight, drive, activity, predawn, okHrs };
  for (const [k, v] of Object.entries(nums)) if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number, 0 or more`);
  if (predawn > drive + activity) throw new Error('predawn hours cannot be more than drive + activity hours');
  const load = drive + activity - predawn;
  const s = Math.round((daylight - load) * 10) / 10;   // one decimal, as in the Itinerary base
  const verdict = s < TOO_MUCH_BELOW_HRS ? 'too much' : s < okHrs ? 'tight' : 'ok';
  return { daylight_hrs: daylight, daytime_load_hrs: Math.round(load * 10) / 10, predawn_hrs: predawn, slack_hrs: s, slack_ok_hrs: okHrs, verdict };
}

// ---- command line
function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const num = (n, dflt) => { const v = opt(n); if (v === undefined) return dflt; const x = Number(v); if (!Number.isFinite(x)) throw new Error(`${n} must be a number, got "${v}"`); return x; };
  if (cmd === 'slack') {
    const need = n => { const x = num(n); if (x === undefined) throw new Error(`missing ${n}`); return x; };
    const { limits, changed } = strictPlanningLimits(opt('--vault') || process.cwd());
    return { ...slack({ daylight: need('--daylight'), drive: need('--drive'), activity: need('--activity'), predawn: num('--predawn', 0), okHrs: limits.slack_ok_hrs }),
      limit_source: changed.includes('slack_ok_hrs') ? 'planning_limits in trip.md' : 'default' };
  }
  if (cmd === 'times') {
    const date = opt('--date');
    if (!date) throw new Error('missing --date YYYY-MM-DD');
    const lat = num('--lat'), lng = num('--lng');
    if (lat === undefined || lng === undefined) return fromTripMd(date, opt('--vault') || process.cwd());
    const [y, m, d] = date.split('-').map(Number);
    let off;
    if (opt('--tz')) off = tzOffsetMinutes(opt('--tz'), y, m, d);
    else if (num('--utc-offset') !== undefined) off = Math.round(num('--utc-offset') * 60);
    else throw new Error('give the local time zone: --tz Area/City (for example Europe/Lisbon) or --utc-offset 5.5');
    return { ...sunTimes(date, lat, lng, off), tz: opt('--tz') || null, source: 'computed' };
  }
  throw new Error('usage: sun.mjs times --date YYYY-MM-DD --lat N --lng N (--tz Area/City | --utc-offset H)\n       sun.mjs slack --daylight H --drive H --activity H [--predawn H] [--vault <folder>]');
}

// No coordinates: the trip's own season defaults. Not date-specific, so it says so.
function fromTripMd(date, vault) {
  const f = path.join(path.resolve(vault), 'trip.md');
  let fm = '';
  try { fm = fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || ''; } catch { /* handled below */ }
  const get = k => (fm.match(new RegExp(`^${k}:\\s*"?([^"\\n#]*?)"?\\s*(?:#.*)?$`, 'm')) || [])[1];
  const daylight = Number(get('daylight_hrs')), sunset = get('sunset');
  if (!Number.isFinite(daylight) || daylight <= 0 || !/^\d{1,2}:\d{2}$/.test(sunset || '')) {
    throw new Error(`no coordinates given, and ${f} has no usable daylight_hrs and sunset to fall back on`);
  }
  const sunsetMin = toMinutes(sunset);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T00:00:00Z').getUTCDay()];
  return { date, weekday, sunrise: hhmm(sunsetMin - daylight * 60), sunset: hhmm(sunsetMin), first_light: null, last_light: null,
    daylight_hrs: daylight, source: 'trip.md season defaults (no coordinates): not specific to this date or place' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (e) { console.error(`sun.mjs: ${e.message}`); process.exit(2); }
}
