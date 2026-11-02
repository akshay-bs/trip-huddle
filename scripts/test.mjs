// Tests for trip-huddle. Run from anywhere:  node scripts/test.mjs
// Covers: the checker on the example vault, trip-init reconfigure leaving the example vault unchanged,
// trip-init making a new vault the checker accepts, the plan-day sun script and example, the after-dark checks
// and migration, the review-travel-times script (road-type time, stops buffer, trip.md settings, verdicts), its
// made-up checked example, the travel_verdict warning, the planning_limits in trip.md (they change the verdicts, reach the
// Itinerary base through trip-init, and are checked), Comparison notes and the made-up comparison, and a deliberately
// broken vault where every problem must be reported. Works on temporary copies, so the repo is never modified. Exits 1 if anything fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sunTimes, slack, tzOffsetMinutes, TIGHT_BELOW_HRS, TOO_MUCH_BELOW_HRS } from '../skills/plan-day/scripts/sun.mjs';
import { loadPlanningLimits, planningLimitsProblems, PLANNING_LIMIT_DEFAULTS } from './trip-settings.mjs';
import { vehicleClass, loadSettings, checkDay, settingsProblems, DEFAULT_SPEEDS, DEFAULT_STOP_BUFFER, DARK_TOO_MUCH_MIN } from '../skills/review-travel-times/scripts/travel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(ROOT, 'scripts/validate.mjs');
const INIT = path.join(ROOT, 'skills/trip-init/scripts/init.mjs');
const ANSWERS = path.join(ROOT, 'skills/trip-init/tests');
const SUN = path.join(ROOT, 'skills/plan-day/scripts/sun.mjs');
const TRAVEL = path.join(ROOT, 'skills/review-travel-times/scripts/travel.mjs');
const CHECKED = path.join(ROOT, 'skills/review-travel-times/references');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-huddle-test-'));

const run = (file, args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const check = vault => run(CHECKER, [], vault);       // the vault is the current folder
const counts = out => ({ errors: +out.match(/ERRORS \((\d+)\)/)?.[1], warnings: +out.match(/WARNINGS \((\d+)\)/)?.[1] });

let failed = 0;
const pass = name => console.log(`PASS  ${name}`);
const fail = (name, why) => { failed++; console.log(`FAIL  ${name}\n      ${String(why).split('\n').join('\n      ')}`); };
const test = (name, fn) => { try { const why = fn(); why ? fail(name, why) : pass(name); } catch (e) { fail(name, e.stack || e); } };

// ---- (a) the example vault is clean
test('checker: example vault has 0 errors', () => {
  const r = check(path.join(ROOT, 'example-vault'));
  return r.code === 0 && counts(r.out).errors === 0 ? '' : r.out;
});

// ---- the old command still works, and --vault works from elsewhere
test('checker: old add-place path and --vault option work', () => {
  const r = run(path.join(ROOT, 'skills/add-place/scripts/validate.mjs'), ['--vault', path.join(ROOT, 'example-vault')], os.tmpdir());
  return r.code === 0 && counts(r.out).errors === 0 ? '' : r.out;
});

test('checker: a folder that is not a vault gets a friendly message', () => {
  const empty = fs.mkdtempSync(path.join(TMP, 'empty-'));
  const r = check(empty);
  return r.code === 2 && r.out.includes('Not a trip-huddle vault') ? '' : r.out;
});

// ---- (b) trip-init on the example vault changes nothing
test('trip-init: reconfigure leaves the example vault unchanged', () => {
  const copy = path.join(TMP, 'example-copy');
  fs.cpSync(path.join(ROOT, 'example-vault'), copy, { recursive: true });
  const r = run(INIT, ['--answers', path.join(ANSWERS, 'example-vault-answers.json'), '--vault', copy, '--reconfigure']);
  return r.code === 0 && r.out.includes('Nothing changed') ? '' : r.out;
});

// ---- (c) a new vault from the Portugal answers
const portugal = path.join(TMP, 'portugal');
test('trip-init: new vault from the Portugal answers is valid', () => {
  const made = run(INIT, ['--answers', path.join(ANSWERS, 'portugal-answers.json'), '--vault', portugal]);
  if (made.code !== 0) return made.out;
  const r = check(portugal);
  if (!(r.code === 0 && counts(r.out).errors === 0)) return r.out;
  const missing = ['Itinerary/Route.md', 'Logistics/Transport.md'].filter(f => !fs.existsSync(path.join(portugal, f)));
  return missing.length ? `not created: ${missing.join(', ')}` : '';
});
test('checker: field-pack fields are checked without any extra setup', () => {
  // The Portugal answers use the self-drive pack, so Location notes get parking_at_site, a closed list.
  const v = path.join(TMP, 'portugal-pack');
  fs.cpSync(portugal, v, { recursive: true });
  const tpl = fs.readFileSync(path.join(v, 'Templates/Location.md'), 'utf8');
  if (!tpl.includes('parking_at_site: free | paid')) return 'expected the self-drive field pack in the Portugal vault';
  fs.mkdirSync(path.join(v, 'Locations'), { recursive: true });
  fs.mkdirSync(path.join(v, 'Sources'), { recursive: true });
  fs.writeFileSync(path.join(v, 'Sources/Src.md'), '---\ntype: source\ntags:\n  - source\n---\n# Src\n[[Spot]]\n');
  fs.writeFileSync(path.join(v, 'Locations/Spot.md'), tpl.replace('parking_at_site:', 'parking_at_site: nowhere')
    .replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"').replace('{{title}}', 'Spot'));
  const r = check(v);
  return /Spot\.md: parking_at_site "nowhere" is not one of/.test(r.out) ? '' : r.out;
});

// ---- folders and decision values from trip.md
test('trip.md: folders and decision_values are honoured, and survive trip-init reconfigure', () => {
  const v = path.join(TMP, 'custom');
  fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
  fs.renameSync(path.join(v, 'Locations'), path.join(v, 'Places'));
  const tripFile = path.join(v, 'trip.md');
  fs.writeFileSync(tripFile, fs.readFileSync(tripFile, 'utf8').replace('field_packs: []', 'field_packs: []\nfolders: {location: Places}\ndecision_values: [considering, selected, backup, dropped, booked]'));
  const r = check(v);
  if (!(r.code === 0 && counts(r.out).errors === 0)) return r.out;
  const re = run(INIT, ['--answers', path.join(ANSWERS, 'example-vault-answers.json'), '--vault', v, '--reconfigure']);
  const after = fs.readFileSync(tripFile, 'utf8');
  return re.code === 0 && after.includes('folders: {location: Places}') && after.includes('booked]') ? '' : re.out + after;
});

// ---- Source notes (what the add-source skill writes), made-up content
const sourceVault = path.join(TMP, 'source-notes');
fs.cpSync(path.join(ROOT, 'example-vault'), sourceVault, { recursive: true });
const sourceTpl = fs.readFileSync(path.join(sourceVault, 'Templates/Source Itinerary.md'), 'utf8');
const locTpl = fs.readFileSync(path.join(sourceVault, 'Templates/Location.md'), 'utf8');
const makeSource = (title, processed, tick) => sourceTpl.replace('{{title}}', title).replace('{{date}}', '2026-01-02')
  .replace('source_from:', 'source_from: Test Agency').replace('source_kind:', 'source_kind: agency')
  .replace('processed: false', `processed: ${processed}`).replace('  - source\n', '  - source\n  - TestAgency\n')
  .replace('## Route summary\n<!--', '## Route summary\nTown A (2N) → Town B (3N)\n<!--')
  .replace('- [ ] [[ ]]', `- [${tick}] [[Test Spot]]`);   // the first placeholder is the places list
fs.writeFileSync(path.join(sourceVault, 'Locations/Test Spot.md'), locTpl.replace('{{title}}', 'Test Spot')
  .replace('location: []', 'location: [25.5, 91.9]').replace('recommended_by: []', 'recommended_by:\n  - "[[Test Agency - Quote]]"'));
fs.writeFileSync(path.join(sourceVault, 'Sources/Test Agency - Quote.md'), makeSource('Test Agency - Quote', 'true', 'x'));
test('checker: a filled, ticked, processed Source note passes', () => {
  const r = check(sourceVault), mine = r.out.split('\n').filter(l => l.includes('Test Agency - Quote') || l.includes('Test Spot'));
  return r.code === 0 && !mine.length ? '' : r.out;
});
test('checker: a processed Source note with an unticked checklist line is flagged', () => {
  fs.writeFileSync(path.join(sourceVault, 'Sources/Test Agency - Quote.md'), makeSource('Test Agency - Quote', 'true', ' '));
  const r = check(sourceVault);
  return r.out.split('\n').some(l => l.includes('Test Agency - Quote.md') && l.includes('not ticked')) ? '' : r.out;
});
test('checker: an unprocessed Source note with an unticked line is fine', () => {
  fs.writeFileSync(path.join(sourceVault, 'Sources/Test Agency - Quote.md'), makeSource('Test Agency - Quote', 'false', ' '));
  const r = check(sourceVault);
  return !r.out.includes('not ticked') && r.code === 0 ? '' : r.out;
});

// ---- plan-day: the sun script (known values from published sunrise tables)
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const near = (name, got, want, tol = 2) => test(`sun: ${name}`, () => Math.abs(mins(got) - mins(want)) <= tol ? '' : `got ${got}, want ${want} (within ${tol} min)`);
{
  const london = sunTimes('2024-06-21', 51.4779, -0.0015, tzOffsetMinutes('Europe/London', 2024, 6, 21));
  near('London, June solstice, sunrise 04:43', london.sunrise, '04:43');
  near('London, June solstice, sunset 21:21', london.sunset, '21:21');
  const sydney = sunTimes('2024-12-21', -33.87, 151.21, tzOffsetMinutes('Australia/Sydney', 2024, 12, 21));
  near('Sydney, December solstice, sunrise 05:41', sydney.sunrise, '05:41');
  near('Sydney, December solstice, sunset 20:05', sydney.sunset, '20:05');
  const lisbon = sunTimes('2027-06-21', 38.72, -9.14, tzOffsetMinutes('Europe/Lisbon', 2027, 6, 21));
  near('Lisbon, June solstice, sunrise 06:12', lisbon.sunrise, '06:12');
  near('Lisbon, June solstice, sunset 21:05', lisbon.sunset, '21:05');
  const quito = sunTimes('2024-03-20', -0.18, -78.47, -300);
  test('sun: near the equator at the equinox the day is about 12 hours', () => Math.abs(quito.daylight_hrs - 12.1) <= 0.2 ? '' : `got ${quito.daylight_hrs}`);
  const wellington = sunTimes('2024-06-21', -41.29, 174.78, tzOffsetMinutes('Pacific/Auckland', 2024, 6, 21));
  test('sun: far east of Greenwich (Wellington, June) gives a short winter day', () =>
    Math.abs(wellington.daylight_hrs - 9.2) <= 0.2 && mins(wellington.sunrise) < mins(wellington.sunset) ? '' : JSON.stringify(wellington));
  test('sun: daylight_hrs matches sunset minus sunrise', () => Math.abs((mins(london.sunset) - mins(london.sunrise)) / 60 - london.daylight_hrs) <= 0.1 ? '' : JSON.stringify(london));
  test('sun: midnight sun and polar night come back as polar, with no times', () => {
    const day = sunTimes('2024-06-21', 69.65, 18.96, 120), night = sunTimes('2024-12-21', 69.65, 18.96, 60);
    return day.polar === 'day' && day.sunrise === null && day.daylight_hrs === 24 && night.polar === 'night' && night.daylight_hrs === 0 ? '' : JSON.stringify([day, night]);
  });
  test('sun: the time zone offset follows daylight saving and half-hour zones', () => {
    const got = [tzOffsetMinutes('Europe/Lisbon', 2027, 6, 9), tzOffsetMinutes('Europe/Lisbon', 2027, 1, 9), tzOffsetMinutes('Asia/Kolkata', 2027, 1, 9)];
    return got.join() === '60,0,330' ? '' : got.join();
  });
  test('sun: bad dates are refused', () => { try { sunTimes('9 June', 1, 1, 0); return 'no error'; } catch { return ''; } });
}
test('sun: the command line prints the weekday, and asks for a time zone instead of guessing', () => {
  const ok = run(SUN, ['times', '--date', '2027-06-09', '--lat', '37.10', '--lng', '-8.67', '--tz', 'Europe/Lisbon']);
  const j = JSON.parse(ok.out);
  const noTz = run(SUN, ['times', '--date', '2027-06-09', '--lat', '37.10', '--lng', '-8.67']);
  return ok.code === 0 && j.weekday === 'Wed' && j.source === 'computed' && noTz.code === 2 && /time zone/.test(noTz.out) ? '' : ok.out + noTz.out;
});
test('sun: with no coordinates it falls back to trip.md and says so', () => {
  const j = JSON.parse(run(SUN, ['times', '--date', '2027-06-09', '--vault', path.join(ROOT, 'example-vault')]).out);
  return j.sunrise === '07:00' && j.sunset === '16:30' && j.daylight_hrs === 9.5 && /trip\.md/.test(j.source) ? '' : JSON.stringify(j);
});
test('slack: verdict thresholds (ok from 1.5, tight from 0, otherwise too much)', () => {
  const v = (drive, activity, predawn = 0) => slack({ daylight: 10, drive, activity, predawn }).verdict;
  const got = [v(4, 4.5), v(4, 5), v(4, 6), v(5, 5), v(5, 5.1), v(5, 5, 3)];
  return got.join() === 'ok,tight,tight,tight,too much,ok' && TIGHT_BELOW_HRS === 1.5 && TOO_MUCH_BELOW_HRS === 0 ? '' : got.join();
});
test('slack: pre-dawn hours are counted separately and do not use up daylight', () => {
  const s = slack({ daylight: 9.5, drive: 4.5, activity: 5.5, predawn: 2 });
  return s.slack_hrs === 1.5 && s.verdict === 'ok' && slack({ daylight: 9.5, drive: 4.5, activity: 5.5 }).verdict === 'too much' ? '' : JSON.stringify(s);
});
test('slack: the Itinerary base uses the same thresholds as the script', () => {
  const base = fs.readFileSync(path.join(ROOT, 'vault-template/Bases/Itinerary.base'), 'utf8');
  return base.includes(`formula.slack_hrs < ${TOO_MUCH_BELOW_HRS}`) && base.includes(`formula.slack_hrs < ${TIGHT_BELOW_HRS}`)
    && base.includes('predawn_hrs') ? '' : 'Itinerary.base verdict formula does not match sun.mjs';
});
test('plan-day: the Day Plan template and Itinerary base are the same in both vaults', () => {
  const same = f => fs.readFileSync(path.join(ROOT, 'vault-template', f), 'utf8') === fs.readFileSync(path.join(ROOT, 'example-vault', f), 'utf8');
  return same('Bases/Itinerary.base') && same('.obsidian/types.json') ? '' : 'Itinerary.base or types.json differ between vault-template and example-vault';
});

// ---- plan-day: the reference example is a valid Day note in a vault made by trip-init (made-up places, stubs below)
const dayVault = path.join(TMP, 'portugal-days');
fs.cpSync(portugal, dayVault, { recursive: true });
{
  const tpl = n => fs.readFileSync(path.join(dayVault, 'Templates', n), 'utf8');
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dayVault, rel)), { recursive: true }); fs.writeFileSync(path.join(dayVault, rel), text); };
  put('Sources/Src.md', '---\ntype: source\ntags:\n  - source\n---\n# Src\n[[Cliff Viewpoint (Example)]] [[Fishing Harbour (Example)]] [[Old Town Walk (Example)]] [[Mountain Fort (Example)]] [[Cork Oak Farm (Example)]]\n');
  for (const n of ['Cliff Viewpoint (Example)', 'Fishing Harbour (Example)', 'Old Town Walk (Example)', 'Mountain Fort (Example)', 'Cork Oak Farm (Example)']) {
    put(`Locations/${n}.md`, tpl('Location.md').replace('{{title}}', n).replace('location: []', 'location: [37.1, -8.7]')
      .replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"').replace(/scheduled_day:.*/, /^(Mountain|Cork)/.test(n) ? 'scheduled_day: "[[Day 05]]"' : 'scheduled_day: "[[Day 04]]"'));
  }
  put('Stays/Example Guesthouse Lagos.md', tpl('Stay.md').replace('{{title}}', 'Example Guesthouse Lagos').replace('location: []', 'location: [37.1, -8.67]')
    .replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"'));
  fs.appendFileSync(path.join(dayVault, 'Sources/Src.md'), '[[Example Guesthouse Lagos]]\n');
  fs.copyFileSync(path.join(ROOT, 'skills/plan-day/references/day-example.md'), path.join(dayVault, 'Itinerary/Day 04.md'));
  fs.copyFileSync(path.join(CHECKED, 'checked-example.md'), path.join(dayVault, 'Itinerary/Day 05.md'));
}
test('plan-day: the reference example Day note passes the checker with no errors or warnings about it', () => {
  const r = check(dayVault), mine = r.out.split('\n').filter(l => /Day 04|Day Plan/.test(l));
  return r.code === 0 && !mine.length ? '' : r.out;
});
test('plan-day: the numbers in the reference example match the sun script and the slack rule', () => {
  const text = fs.readFileSync(path.join(ROOT, 'skills/plan-day/references/day-example.md'), 'utf8');
  const get = k => text.match(new RegExp(`^${k}: "?([^"\\n]*)"?$`, 'm'))[1];
  const sun = sunTimes(get('date'), 37.10, -8.67, tzOffsetMinutes('Europe/Lisbon', 2027, 6, 9));
  const s = slack({ daylight: Number(get('daylight_hrs')), drive: Number(get('drive_hrs')), activity: Number(get('activity_hrs')), predawn: Number(get('predawn_hrs')) });
  const bad = [];
  if (sun.sunrise !== get('sunrise') || sun.sunset !== get('sunset') || sun.daylight_hrs !== Number(get('daylight_hrs'))) bad.push(`sun: ${JSON.stringify(sun)}`);
  if (!text.includes(`Slack ${s.slack_hrs} hrs: **${s.verdict}**`)) bad.push(`slack line should say ${s.slack_hrs} hrs ${s.verdict}`);
  return bad.join('; ');
});
{
  const v = path.join(TMP, 'portugal-days-bad');
  fs.cpSync(dayVault, v, { recursive: true });
  const f = path.join(v, 'Itinerary/Day 04.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('early_start: "05:00"', 'early_start: "07:00"').replace('daylight_hrs: 14.7', 'daylight_hrs: 12.5')
    .replace('drive_hrs: 2.3', 'drive_hrs: 6').replace('sunset: "20:54"', 'sunset: 8pm'));
  const out = check(v).out;
  const has = text => out.split('\n').some(l => l.includes('Day 04.md') && l.includes(text));
  test('checker finds: Day note with a start after sunrise, a bad time, and a day longer than the daylight', () =>
    has('early_start 07:00 is not before sunrise') && has('sunset "8pm" should be a local time') && has('more than the daylight') ? '' : out);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('sunset: 8pm', 'sunset: "20:54"').replace('early_start: "07:00"', 'early_start: "05:00"').replace('drive_hrs: 6', 'drive_hrs: 2.3'));
  test('checker finds: daylight_hrs that does not match sunrise and sunset', () => {
    const o = check(v).out;
    return o.split('\n').some(l => l.includes('Day 04.md') && l.includes('daylight_hrs 12.5 does not match')) ? '' : o;
  });
}

// ---- after dark: value lists, the Day note warning, and the migration
const exLoc = 'Locations/Arwah Cave.md';
const warnLine = (out, file, text) => out.split('\n').some(l => l.includes(file) && l.includes(text));
{
  const v = path.join(TMP, 'after-dark-values');
  fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
  const f = path.join(v, exLoc), orig = fs.readFileSync(f, 'utf8');
  const withValues = (bt, ad) => fs.writeFileSync(f, orig.replace(/^best_time_of_day: \[.*\]$/m, bt).replace('after_dark:\n', ad));
  withValues('best_time_of_day: [sunrise, evening, night, any]', 'after_dark: good\n');
  let r = check(v);
  test('after dark: valid best_time_of_day list and after_dark value pass', () => r.code === 0 && !warnLine(r.out, 'Arwah Cave', 'not one of') ? '' : r.out);
  withValues('best_time_of_day: [dusk]', 'after_dark: dangerous\n');
  r = check(v);
  test('after dark: a best_time_of_day item outside the list is flagged', () => warnLine(r.out, 'Arwah Cave', 'best_time_of_day "dusk" is not one of') ? '' : r.out);
  test('after dark: an after_dark value outside good | fine | avoid is flagged', () => warnLine(r.out, 'Arwah Cave', 'after_dark "dangerous" is not one of: good | fine | avoid') ? '' : r.out);
  withValues('best_time_of_day: Morning', 'after_dark:\n');
  r = check(v);
  test('after dark: best_time_of_day as plain text (not a list) is flagged', () => warnLine(r.out, 'Arwah Cave', 'best_time_of_day should be a list') ? '' : r.out);
}
{
  // Day note warning. Start from the reference Day note (rule_bends 1, one bend written down) in the Portugal vault.
  const dayFile = 'Itinerary/Day 04.md', walk = 'Locations/Old Town Walk (Example).md';
  const make = (name, { place, leg, bends, schedule }) => {
    const v = path.join(TMP, 'dark-' + name);
    fs.cpSync(dayVault, v, { recursive: true });
    const d = path.join(v, dayFile), l = path.join(v, walk);
    let text = fs.readFileSync(d, 'utf8');
    if (schedule) text = text.replace(...schedule);
    if (leg) text = text.replace('| Fishing Harbour | Lagos | ~25 | 0.6–0.75 hrs | ok |', '| Fishing Harbour | Lagos | ~25 | 0.6–0.75 hrs | avoid |');
    if (bends !== undefined) text = text.replace('rule_bends: 1', `rule_bends: ${bends}`);
    if (bends === 0) text = text.replace(/\n- \*\*Driving the coast road[^\n]*/, '\n- None.');
    fs.writeFileSync(d, text);
    if (place) fs.writeFileSync(l, fs.readFileSync(l, 'utf8').replace('after_dark:\n', `after_dark: ${place}\n`));
    return check(v).out;
  };
  const night = ['| 19:30 | Dinner in the old town | |', '| 21:30 | Night walk: [[Old Town Walk (Example)]] | |'];
  const drive = ['| 19:30 | Dinner in the old town | |', '| 21:15 | Drive back to Lagos from the harbour | |'];
  const placeWarn = out => warnLine(out, 'Day 04.md', 'Old Town Walk (Example)') && warnLine(out, 'Day 04.md', 'after_dark: avoid');
  const legWarn = out => warnLine(out, 'Day 04.md', 'Fishing Harbour to Lagos is marked After dark: avoid');
  test('after dark: the reference Day note (a recorded bend, ok legs after sunset) has no after-dark warning', () => {
    const out = make('ref', {}); return warnLine(out, 'Day 04.md', 'after sunset') ? out : '';
  });
  test('after dark: warning fires for an avoid place scheduled after sunset when rule_bends is 0', () => {
    const out = make('place0', { place: 'avoid', bends: 0, schedule: night }); return placeWarn(out) ? '' : out;
  });
  test('after dark: the same day is silent when rule_bends is 1 and the bend is written down', () => {
    const out = make('place1', { place: 'avoid', schedule: night }); return warnLine(out, 'Day 04.md', 'after sunset') ? out : '';
  });
  test('after dark: an after_dark: good place after sunset is not flagged', () => {
    const out = make('good', { place: 'good', bends: 0, schedule: night }); return warnLine(out, 'Day 04.md', 'after sunset') ? out : '';
  });
  test('after dark: a drive on an avoid leg after sunset warns when rule_bends is 0, and is silent when it is 1', () => {
    const a = make('leg0', { leg: true, bends: 0, schedule: drive }), b = make('leg1', { leg: true, schedule: drive });
    return legWarn(a) && !warnLine(b, 'Day 04.md', 'after sunset') ? '' : a + b;
  });
  test('after dark: an avoid leg that is only driven by day does not warn', () => {
    const out = make('legday', { leg: true, bends: 0 }); return warnLine(out, 'Day 04.md', 'after sunset') ? out : '';
  });
  test('after dark: rule_bends that does not match the written bends is flagged', () => {
    const out = make('count', { bends: 2 }); return warnLine(out, 'Day 04.md', 'rule_bends is 2 but') ? '' : out;
  });
  test('after dark: an After dark cell other than ok or avoid is flagged', () => {
    const v = path.join(TMP, 'dark-cell');
    fs.cpSync(dayVault, v, { recursive: true });
    const d = path.join(v, dayFile);
    fs.writeFileSync(d, fs.readFileSync(d, 'utf8').replace('| 0.6–0.75 hrs | ok |', '| 0.6–0.75 hrs | maybe |'));
    return warnLine(check(v).out, 'Day 04.md', 'After dark "maybe" should be ok or avoid') ? '' : 'not flagged';
  });
  test('trip.md: evening_bases that are not in bases are flagged', () => {
    const v = path.join(TMP, 'dark-evening');
    fs.cpSync(dayVault, v, { recursive: true });
    const tf = path.join(v, 'trip.md');
    fs.writeFileSync(tf, fs.readFileSync(tf, 'utf8').replace(/^evening_bases:.*$/m, 'evening_bases: [Atlantis]'));
    return warnLine(check(v).out, 'trip.md', 'evening_bases has towns that are not in bases: Atlantis') ? '' : 'not flagged';
  });
}
// ---- review-travel-times: the script (known inputs and outputs), trip.md settings, verdicts
{
  const near1 = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
  const car = loadSettings(path.join(ROOT, 'example-vault'));          // the example has no vehicle: car speeds
  const van = loadSettings(portugal);                                  // "hired 7-seat van", motorway overridden to 90 / 80
  const leg = (km, road, extra = {}) => ({ from: 'A', to: 'B', km, road, after_dark: 'ok', ...extra });
  const day = (legs, extra = {}, settings = van) => checkDay({ start: '08:00', sunset: '20:00', sunrise: '06:00', daylight_hrs: 14, activity_hrs: 0, legs, ...extra }, settings);

  test('travel: the default speeds and stops buffer are the approved ones', () => {
    const want = { motorway: [70, 55], highway: [50, 40], rural: [35, 28], hill: [30, 22], city: [20, 15], track: [15, 10] };
    const bad = Object.entries(want).filter(([t, [c, g]]) => DEFAULT_SPEEDS[t].car !== c || DEFAULT_SPEEDS[t].group !== g).map(([t]) => t);
    return !bad.length && Object.keys(DEFAULT_SPEEDS).length === 6 && DEFAULT_STOP_BUFFER.min_per_hour === 10 && DEFAULT_STOP_BUFFER.min_per_stop === 15 ? '' : `differs: ${bad}`;
  });
  test('travel: the vehicle class comes from group_vehicle (van, bus, coach, 6+ seats = group; otherwise car)', () => {
    const want = { 'hired 7-seat van': 'group', 'Tempo Traveller with driver': 'group', '9-seater minibus': 'group', 'coach': 'group', '7 seater SUV': 'group',
      'own car': 'car', 'hired 5-seat car': 'car', 'SUV with driver': 'car', 'trains and taxis': 'car', '': 'car', 'business class flights': 'car' };
    const bad = Object.entries(want).filter(([t, c]) => vehicleClass(t).cls !== c).map(([t]) => `"${t}" gave ${vehicleClass(t).cls}`);
    return bad.join('; ');
  });
  test('travel: config reads the vehicle and trip.md overrides, and the other speeds keep their defaults', () => {
    const cli = JSON.parse(run(TRAVEL, ['config', '--vault', portugal]).out);
    return car.vehicle_class === 'car' && car.speeds_kmh.hill === 30 && van.vehicle_class === 'group' && van.speeds_kmh.motorway === 80 && van.speeds_kmh.hill === 22
      && cli.speeds_kmh.motorway === 80 && cli.changed_in_trip_md.road_speeds.join() === 'motorway' && /van/.test(cli.vehicle_why) ? '' : JSON.stringify([car, van, cli]);
  });
  test('travel: --vehicle overrides the class', () => {
    const j = JSON.parse(run(TRAVEL, ['config', '--vault', portugal, '--vehicle', 'car']).out);
    const bad = run(TRAVEL, ['config', '--vault', portugal, '--vehicle', 'boat']);
    return j.vehicle_class === 'car' && j.speeds_kmh.hill === 30 && bad.code === 2 ? '' : j.vehicle_class + bad.out;
  });

  test('travel: road-type time for both vehicle classes (km / speed), and mixed stretches add up', () => {
    const l = (s, legs) => day(legs, {}, s).legs[0];
    const g = l(van, [leg(44, 'hill')]), c = l(car, [leg(30, 'hill')]);
    const mixed = l(van, [{ from: 'A', to: 'B', after_dark: 'ok', segments: [{ km: 15, road: 'rural' }, { km: 30, road: 'hill' }] }]);
    const mw = l(van, [leg(160, 'motorway')]);
    return g.road_hrs === 2 && c.road_hrs === 1 && near1(mixed.road_hrs, 15 / 28 + 30 / 22) && mixed.km === 45 && mixed.road === 'mixed'
      && mw.road_hrs === 2 && l(car, [leg(70, 'motorway')]).road_hrs === 1 ? '' : JSON.stringify([g, c, mixed, mw]);
  });
  test('travel: the slowest of the three estimates is kept, and the range runs from the fastest to it', () => {
    const slowRoad = day([leg(44, 'hill', { map_hrs: 1.2 })]).legs[0];                       // road 2 h, map 1.2 h
    const slowMap = day([leg(22, 'hill', { map_hrs: 1.6 })]).legs[0];                        // road 1 h, map 1.6 h
    const slowReport = day([leg(44, 'hill', { map_hrs: [1.5, 1.8], reports_hrs: 3 })]).legs[0];
    return slowRoad.kept_source === 'road' && slowRoad.range.text === '1.2–2 hrs' && slowRoad.slower_than_map_min === 48
      && slowMap.kept_source === 'map' && slowMap.range.text === '1–1.6 hrs'
      && slowReport.kept_source === 'reports' && slowReport.range.high === 3 && slowReport.range.low === 1.5
      && day([leg(22, 'hill')]).legs[0].range.text === '~1 hrs' ? '' : JSON.stringify([slowRoad, slowMap, slowReport]);
  });
  test('travel: keeping an estimate other than the slowest needs a reason, and a bad road type is refused', () => {
    let noReason = '', badRoad = '';
    try { day([leg(44, 'hill', { map_hrs: 1.2, keep: 'map' })]); noReason = 'no error'; } catch (e) { noReason = /keep_reason/.test(e.message) ? '' : e.message; }
    try { day([leg(44, 'goat-path')]); badRoad = 'no error'; } catch (e) { badRoad = /road must be one of/.test(e.message) ? '' : e.message; }
    const ok = day([leg(44, 'hill', { map_hrs: 1.2, keep: 'map', keep_reason: 'the map route is the faster, signed road' })]).legs[0];
    return noReason || badRoad || (ok.kept_source === 'map' && ok.range.high === 1.2 ? '' : JSON.stringify(ok));
  });
  test('travel: the stops buffer is 10 min per driving hour plus 15 min per stop, and drive hours include it', () => {
    // legs of 1.9, 0.6 and 1.2 hrs (the made-up checked example): 3.7 hrs of driving, 2 stops
    const d = day([leg(0, 'hill', { map_hrs: 1.9 }), leg(0, 'hill', { map_hrs: 0.6 }), leg(0, 'hill', { map_hrs: 1.2 })]).day;
    const one = day([leg(22, 'hill', { extra_stops: 1 })]).day;      // a one-leg day with a lunch stop in the middle
    return d.drive_legs_hrs === 3.7 && d.stops === 2 && d.buffer_hrs === 1.1 && d.drive_hrs === 4.8
      && one.stops === 1 && one.buffer_hrs === 0.4 && one.drive_hrs === 1.4 ? '' : JSON.stringify([d, one]);
  });
  test('travel: stop_buffer and road_speeds in trip.md change the result (flow and block forms), and bad ones are refused', () => {
    const v = path.join(TMP, 'travel-settings');
    fs.cpSync(portugal, v, { recursive: true });
    const f = path.join(v, 'trip.md'), orig = fs.readFileSync(f, 'utf8');
    const legs = [leg(0, 'hill', { map_hrs: 1.9 }), leg(0, 'hill', { map_hrs: 0.6 }), leg(0, 'hill', { map_hrs: 1.2 })];
    fs.writeFileSync(f, orig.replace(/^road_speeds:.*$/m, 'road_speeds:\n  hill:\n    group: 18\n  city: 12\nstop_buffer:\n  min_per_hour: 20\n  min_per_stop: 30'));
    const s = loadSettings(v), d = day(legs, {}, s).day, g = day([leg(36, 'hill'), leg(24, 'city')], {}, s).legs;
    fs.writeFileSync(f, orig.replace(/^road_speeds:.*$/m, 'road_speeds: {hill: {car: 25}}\nstop_buffer: {min_per_stop: 0}'));
    const s2 = loadSettings(v, 'car');
    fs.writeFileSync(f, orig.replace(/^road_speeds:.*$/m, 'road_speeds: {hil: {car: 25}}'));
    const bad = run(TRAVEL, ['config', '--vault', v]);
    fs.writeFileSync(f, orig.replace(/^road_speeds:.*$/m, 'stop_buffer: {min_per_hour: -5}'));
    const bad2 = run(TRAVEL, ['config', '--vault', v]);
    return s.speeds_kmh.hill === 18 && s.speeds_kmh.city === 12 && s.speeds_kmh.rural === 28 && s.stop_buffer.min_per_hour === 20
      && d.buffer_hrs === 2.2 && d.drive_hrs === 5.9 && g[0].road_hrs === 2 && g[1].road_hrs === 2
      && s2.speeds_kmh.hill === 25 && s2.speeds_kmh.rural === 35 && s2.stop_buffer.min_per_stop === 0 && s2.stop_buffer.min_per_hour === 10
      && bad.code === 2 && /"hil" is not a road type/.test(bad.out) && bad2.code === 2 && /min_per_hour/.test(bad2.out) ? '' : JSON.stringify([s, d, s2]) + bad.out + bad2.out;
  });
  test('travel: settingsProblems accepts the defaults and a plain number, and names what is wrong', () => {
    const bad = settingsProblems({ hill: { lorry: 20 }, track: 0 }, { min_per_week: 1 });
    return !settingsProblems(undefined, undefined).length && !settingsProblems({ hill: 25, motorway: { car: 90 } }, { min_per_stop: 20 }).length
      && bad.length === 3 && bad.some(p => /lorry/.test(p)) && bad.some(p => /track/.test(p)) && bad.some(p => /min_per_week/.test(p)) ? '' : bad.join('; ');
  });

  // The day verdict. A group van on a hill road: 44 km = 2 h on the road; with 10 min per driving hour the drive takes 140 min.
  const dark = (start, extra = {}, legExtra = {}) => day([leg(44, 'hill', { after_dark: 'avoid', ...legExtra })], { start, sunset: '20:00', ...extra });
  test('verdict: no dark driving and plenty of daylight is ok', () => dark('09:00').day.verdict === 'ok' && dark('09:00').day.reasons.length === 0 ? '' : JSON.stringify(dark('09:00').day));
  test('verdict: an avoid leg driven up to 30 min after sunset is tight; more is too much; an ok leg after dark is fine', () => {
    const a = dark('18:00'), b = dark('18:30'), c = day([leg(44, 'hill', { after_dark: 'ok' })], { start: '18:30', sunset: '20:00' });
    return a.legs[0].dark_driving_min === 20 && a.day.verdict === 'tight' && b.legs[0].dark_driving_min === 50 && b.day.verdict === 'too much'
      && DARK_TOO_MUCH_MIN === 30 && c.legs[0].dark_driving_min === 0 && c.day.verdict === 'ok' ? '' : JSON.stringify([a.day, b.day, c.day]);
  });
  test('verdict: an agreed bend is not a new problem, but time beyond what was agreed is reported', () => {
    const within = dark('18:30', {}, { bent: true, agreed_dark_min: 60 }), worse = dark('18:30', {}, { bent: true, agreed_dark_min: 30 });
    const unknown = dark('18:30', {}, { bent: true });
    return within.day.verdict === 'ok' && !within.legs[0].worse_than_agreed && worse.legs[0].worse_than_agreed && worse.day.verdict === 'tight'
      && /on top of what was agreed/.test(worse.day.reasons[0].text) && unknown.day.verdict === 'ok' ? '' : JSON.stringify([within.day, worse.day, unknown.day]);
  });
  test('verdict: the output says how much earlier to leave to get out of the dark', () => {
    const b = dark('18:30'), fine = dark('09:00');
    return b.day.leave_earlier?.minutes === 60 && b.day.leave_earlier.start === '17:30' && fine.day.leave_earlier === null ? '' : JSON.stringify(b.day.leave_earlier);
  });
  test('verdict: before sunrise counts as dark too', () => {
    const r = dark('05:00', { sunrise: '06:00' });   // 05:00 to 07:20, an hour of it before sunrise
    return r.legs[0].dark_driving_min === 60 && r.day.verdict === 'too much' && r.day.predawn_drive_hrs === 1 ? '' : JSON.stringify(r.day);
  });
  test('verdict: slack decides when there is no dark driving (same rule as plan-day), and the worse of the checks wins', () => {
    const tight = day([leg(44, 'hill')], { start: '08:00', daylight_hrs: 7, activity_hrs: 4 });      // 2 hrs of driving + 0.3 for stops + 4 = 6.3 hrs, slack 0.7
    const much = day([leg(44, 'hill')], { start: '08:00', daylight_hrs: 6, activity_hrs: 4 });
    const both = day([leg(44, 'hill', { after_dark: 'avoid' })], { start: '18:00', daylight_hrs: 6, activity_hrs: 4 });
    const s = slack({ daylight: 7, drive: tight.day.drive_hrs, activity: 4 });
    return tight.day.verdict === 'tight' && tight.day.slack.verdict === s.verdict && tight.day.slack.slack_hrs === s.slack_hrs && much.day.verdict === 'too much'
      && both.day.verdict === 'too much' && both.day.reasons.length === 2 ? '' : JSON.stringify([tight.day, much.day, both.day]);
  });
  test('verdict: a day that ends over an hour after sunset away from an evening base is tight; a closed road is too much', () => {
    const late = (end, bases) => day([leg(44, 'hill')], { start: '16:30', sunset: '17:30', evening_base_end: bases, daylight_hrs: 14 });
    const closed = day([leg(44, 'hill', { blocked: 'landslide, road closed' })]);
    return late(0, false).day.verdict === 'tight' && late(0, true).day.verdict === 'ok' && late(0, undefined).day.verdict === 'ok'
      && closed.day.verdict === 'too much' && /landslide/.test(closed.day.reasons[0].text) ? '' : JSON.stringify([late(0, false).day, closed.day]);
  });
  test('travel: the command line reads an input file and prints JSON; a bad file gives a plain error', () => {
    const f = path.join(TMP, 'day-input.json');
    fs.writeFileSync(f, JSON.stringify({ start: '08:00', sunset: '20:00', daylight_hrs: 14, activity_hrs: 2, legs: [leg(44, 'hill', { map_hrs: 1.5 })] }));
    const ok = run(TRAVEL, ['check', '--input', f, '--vault', portugal]), bad = run(TRAVEL, ['check', '--input', path.join(TMP, 'nope.json'), '--vault', portugal]);
    const j = JSON.parse(ok.out);
    return ok.code === 0 && j.settings.vehicle_class === 'group' && j.legs[0].range.text === '1.5–2 hrs' && j.day.verdict === 'ok' && bad.code === 2 && /can't read/.test(bad.out) ? '' : ok.out + bad.out;
  });

  // The made-up checked Day note (Portugal): valid in a vault made by trip-init, and its numbers come from the script.
  test('review-travel-times: the checked example Day note passes the checker with no errors or warnings about it', () => {
    const r = check(dayVault), mine = r.out.split('\n').filter(l => /Day 05|Cork Oak|Day Plan/.test(l));
    return r.code === 0 && !mine.length ? '' : r.out;
  });
  test('review-travel-times: the numbers in the checked example match the script, the sun script and the slack rule', () => {
    const text = fs.readFileSync(path.join(CHECKED, 'checked-example.md'), 'utf8');
    const input = JSON.parse(fs.readFileSync(path.join(CHECKED, 'checked-example-input.json'), 'utf8'));
    const out = JSON.parse(run(TRAVEL, ['check', '--input', path.join(CHECKED, 'checked-example-input.json'), '--vault', portugal]).out);
    const get = k => text.match(new RegExp(`^${k}: "?([^"\\n]*)"?$`, 'm'))[1];
    const sun = sunTimes(get('date'), 37.10, -8.67, tzOffsetMinutes('Europe/Lisbon', 2027, 6, 10));
    const bad = [];
    if (sun.sunrise !== input.sunrise || sun.sunset !== input.sunset || sun.daylight_hrs !== input.daylight_hrs) bad.push(`sun: ${JSON.stringify(sun)}`);
    for (const k of ['sunrise', 'sunset']) if (get(k) !== input[k]) bad.push(`${k} differs from the input`);
    if (Number(get('daylight_hrs')) !== input.daylight_hrs || Number(get('activity_hrs')) !== input.activity_hrs) bad.push('daylight or activity differs from the input');
    if (Number(get('drive_hrs')) !== out.day.drive_hrs) bad.push(`drive_hrs should be ${out.day.drive_hrs}`);
    if (get('travel_verdict') !== out.day.verdict) bad.push(`travel_verdict should be ${out.day.verdict}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(get('travel_checked'))) bad.push('travel_checked should be a date');
    for (const l of out.legs) if (!text.includes(`| ${l.from} | ${l.to} | ~${l.km} | ${l.range.text} |`)) bad.push(`Legs row for ${l.from} to ${l.to} should say ${l.range.text} and ~${l.km} km`);
    if (!text.includes(`Drive ${out.day.drive_hrs} (${out.day.drive_legs_hrs} of driving and ${out.day.buffer_hrs} for stops) + activity ${input.activity_hrs} = ${out.day.slack.daytime_load_hrs} hrs in daylight. Slack ${out.day.slack.slack_hrs} hrs: **${out.day.slack.verdict}**`)) bad.push('the Daylight and slack line does not match the script');
    if (!text.includes(`Stops add ${out.day.buffer_hrs} hrs`)) bad.push('the basis line should give the stops buffer');
    const slow = out.legs.find(l => l.slower_than_map_min >= 15);
    if (!slow || !text.includes(`| ${slow.from} | ${slow.to} |`) || !/Slower than the map shows/.test(text)) bad.push('one leg should be slower than the map and say so');
    if (out.legs.some(l => l.depart > out.day.ends_at)) bad.push('timeline order');
    return bad.join('; ');
  });
}
{
  // The checker's travel_verdict rules, on the made-up Day 05 (slack 5.4, verdict ok)
  const make = (name, edit) => {
    const v = path.join(TMP, 'travel-' + name);
    fs.cpSync(dayVault, v, { recursive: true });
    const f = path.join(v, 'Itinerary/Day 05.md');
    fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8')));
    return check(v).out;
  };
  const longDay = t => t.replace('drive_hrs: 4.8', 'drive_hrs: 6.5').replace('activity_hrs: 4.5', 'activity_hrs: 8');   // slack 0.2 hrs: tight
  const tooMuch = t => t.replace('drive_hrs: 4.8', 'drive_hrs: 9').replace('activity_hrs: 4.5', 'activity_hrs: 9');  // slack -3.3: too much
  const stale = out => warnLine(out, 'Day 05.md', 'travel_verdict is "ok", but the day\'s slack');
  test('checker: travel_verdict ok on a day whose slack is tight is flagged as out of date', () => {
    const o = make('tight', longDay); return stale(o) && warnLine(o, 'Day 05.md', 'gives "tight"') ? '' : o;
  });
  test('checker: travel_verdict ok on a day whose slack is too much is flagged', () => {
    const o = make('toomuch', tooMuch); return warnLine(o, 'Day 05.md', 'gives "too much"') ? '' : o;
  });
  test('checker: travel_verdict that is as bad as, or worse than, the slack verdict is not flagged', () => {
    const same = make('same', t => longDay(t).replace('travel_verdict: ok', 'travel_verdict: tight'));
    const worse = make('worse', t => t.replace('travel_verdict: ok', 'travel_verdict: too much'));
    const much = make('muchmuch', t => tooMuch(t).replace('travel_verdict: ok', 'travel_verdict: too much'));
    return [same, worse, much].some(o => warnLine(o, 'Day 05.md', 'travel_verdict is')) ? same + worse + much : '';
  });
  test('checker: a day with no travel check (both properties empty) is not flagged', () => {
    const o = make('none', t => longDay(t).replace('travel_verdict: ok', 'travel_verdict:').replace('travel_checked: 2026-11-02', 'travel_checked:'));
    return warnLine(o, 'Day 05.md', 'travel_') ? o : '';
  });
  test('checker: a verdict without a check date, and a check date without a verdict, are flagged', () => {
    const a = make('nodate', t => t.replace('travel_checked: 2026-11-02', 'travel_checked:')), b = make('noverdict', t => t.replace('travel_verdict: ok', 'travel_verdict:'));
    return warnLine(a, 'Day 05.md', 'travel_verdict is set but travel_checked is empty') && warnLine(b, 'Day 05.md', 'travel_checked is set but travel_verdict is empty') ? '' : a + b;
  });
  test('checker: travel_verdict must be ok, tight or too much, and travel_checked a date', () => {
    const a = make('badverdict', t => t.replace('travel_verdict: ok', 'travel_verdict: fine')), b = make('baddate', t => t.replace('travel_checked: 2026-11-02', 'travel_checked: yesterday'));
    return warnLine(a, 'Day 05.md', 'travel_verdict "fine" is not one of: ok | tight | too much') && b.split('ERRORS')[1].split('WARNINGS')[0].includes('travel_checked must be a date') ? '' : a + b;
  });
  test('checker: the reference plan-day note (travel properties empty) is not flagged for them', () => {
    const o = check(dayVault).out; return warnLine(o, 'Day 04.md', 'travel_') ? o : '';
  });
}
{
  // trip-init and the travel settings
  const answers = JSON.parse(fs.readFileSync(path.join(ANSWERS, 'portugal-answers.json'), 'utf8'));
  const tryInit = (name, edit, extraArgs = []) => {
    const a = path.join(TMP, name + '.json');
    fs.writeFileSync(a, JSON.stringify(edit({ ...answers })));
    return { a, v: path.join(TMP, name) };
  };
  test('trip-init: road_speeds and stop_buffer in the answers are written to trip.md, and a bad road type is refused', () => {
    const ok = tryInit('travel-ok', x => ({ ...x, stop_buffer: { min_per_hour: 12, min_per_stop: 20 }, road_speeds: { hill: { group: 18 }, motorway: { car: 90, group: 80 } } }));
    const made = run(INIT, ['--answers', ok.a, '--vault', ok.v]);
    const t = fs.readFileSync(path.join(ok.v, 'trip.md'), 'utf8');
    const s = loadSettings(ok.v);
    const bad = tryInit('travel-bad', x => ({ ...x, road_speeds: { hil: { car: 20 } }, stop_buffer: { min_per_hour: 'ten' } }));
    const refused = run(INIT, ['--answers', bad.a, '--vault', bad.v]);
    return made.code === 0 && t.includes('road_speeds: {hill: {group: 18}, motorway: {car: 90, group: 80}}') && t.includes('stop_buffer: {min_per_hour: 12, min_per_stop: 20}')
      && s.speeds_kmh.hill === 18 && s.stop_buffer.min_per_stop === 20 && counts(check(ok.v).out).errors === 0
      && refused.code === 1 && /"hil" is not a road type/.test(refused.out) && /min_per_hour/.test(refused.out) && !fs.existsSync(path.join(bad.v, 'trip.md')) ? '' : made.out + refused.out + t;
  });
  test('trip-init: reconfigure keeps road_speeds and stop_buffer when the answers leave them out, and replaces them when given', () => {
    const v = path.join(TMP, 'travel-keep');
    fs.cpSync(portugal, v, { recursive: true });
    const f = path.join(v, 'trip.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^(road_speeds:.*)$/m, '$1\nstop_buffer: {min_per_stop: 25}'));
    const none = path.join(TMP, 'travel-keep-none.json');
    const { road_speeds, ...rest } = answers;
    fs.writeFileSync(none, JSON.stringify(rest));
    const kept = run(INIT, ['--answers', none, '--vault', v, '--reconfigure']);
    const t = fs.readFileSync(f, 'utf8');
    const given = tryInit('travel-new', x => ({ ...x, road_speeds: { city: { car: 18 } } }));
    const re = run(INIT, ['--answers', given.a, '--vault', v, '--reconfigure']);
    const t2 = fs.readFileSync(f, 'utf8');
    return kept.code === 0 && /road_speeds: \{motorway: \{car: 90, group: 80\}\}/.test(t) && t.includes('stop_buffer: {min_per_stop: 25}')
      && re.code === 0 && t2.includes('road_speeds: {city: {car: 18}}') && !t2.includes('motorway: {car: 90') && t2.includes('stop_buffer: {min_per_stop: 25}') ? '' : kept.out + t + re.out + t2;
  });
  test('trip-init: a new vault gets the Day Plan template with the travel properties, in the same order as the checked example', () => {
    const keys = text => (text.match(/^---\n([\s\S]*?)\n---/)[1].match(/^[a-z_]+(?=:)/gm) || []).join();
    const tpl = fs.readFileSync(path.join(portugal, 'Templates/Day Plan.md'), 'utf8');
    return /rule_bends,travel_checked,travel_verdict,tags/.test(keys(tpl)) && keys(tpl) === keys(fs.readFileSync(path.join(CHECKED, 'checked-example.md'), 'utf8')) ? '' : keys(tpl);
  });
}
// ---- planning_limits in trip.md: defaults, overrides that change the verdicts, trip-init, the checker
{
  const withLimits = (name, line) => {   // a copy of the Portugal vault whose trip.md has this planning_limits line ('' = none)
    const v = path.join(TMP, 'limits-' + name);
    fs.cpSync(portugal, v, { recursive: true });
    const f = path.join(v, 'trip.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^planning_limits:.*\n/m, line ? line + '\n' : ''));
    return v;
  };
  const leg = (km, road, extra = {}) => ({ from: 'A', to: 'B', km, road, after_dark: 'ok', ...extra });
  const chk = (v, legs, extra = {}) => checkDay({ start: '08:00', sunset: '20:00', sunrise: '06:00', daylight_hrs: 14, activity_hrs: 0, legs, ...extra }, loadSettings(v)).day;
  const fine = withLimits('default', '');   // no planning_limits at all: the defaults

  test('limits: the defaults are 1.5 hrs of slack, 30 min of dark driving, 60 min late, 6 hrs of driving a day', () => {
    const none = loadPlanningLimits(fine), starter = loadPlanningLimits(path.join(ROOT, 'vault-template'));
    return JSON.stringify(PLANNING_LIMIT_DEFAULTS) === '{"slack_ok_hrs":1.5,"dark_drive_tight_min":30,"late_finish_min":60,"max_drive_hrs_day":6}'
      && JSON.stringify(none.limits) === JSON.stringify(PLANNING_LIMIT_DEFAULTS) && none.changed.length === 0 && !none.problems.length
      && JSON.stringify(starter.limits) === JSON.stringify(PLANNING_LIMIT_DEFAULTS) && !starter.problems.length ? '' : JSON.stringify([none, starter]);
  });
  test('limits: trip.md values are read in flow and block form, and anything left out keeps its default', () => {
    const flow = loadPlanningLimits(withLimits('flow', 'planning_limits: {slack_ok_hrs: 2, max_drive_hrs_day: 7.5}'));
    const block = loadPlanningLimits(withLimits('block', 'planning_limits:\n  late_finish_min: 90\n  dark_drive_tight_min: 15'));
    return flow.limits.slack_ok_hrs === 2 && flow.limits.max_drive_hrs_day === 7.5 && flow.limits.late_finish_min === 60 && flow.changed.join() === 'slack_ok_hrs,max_drive_hrs_day'
      && block.limits.late_finish_min === 90 && block.limits.dark_drive_tight_min === 15 && block.limits.slack_ok_hrs === 1.5 ? '' : JSON.stringify([flow, block]);
  });
  test('limits: planningLimitsProblems names what is wrong', () => {
    const bad = planningLimitsProblems({ slack_ok_hrs: 'lots', max_drive_hrs_day: 0, speed: 3, late_finish_min: -5 });
    return !planningLimitsProblems(undefined).length && !planningLimitsProblems({ slack_ok_hrs: 0, max_drive_hrs_day: 8 }).length && !planningLimitsProblems({ slack_ok_hrs: '2' }).length
      && bad.length === 4 && bad.some(p => /slack_ok_hrs must be/.test(p)) && bad.some(p => /"speed" is not a setting/.test(p)) ? '' : bad.join('; ');
  });
  test('limits: slack_ok_hrs changes the plan-day slack verdict (sun.mjs, in code and on the command line)', () => {
    const at = (okHrs) => slack({ daylight: 10, drive: 4, activity: 4.5, okHrs }).verdict;    // slack 1.5
    const cli = (v) => JSON.parse(run(SUN, ['slack', '--daylight', '10', '--drive', '4', '--activity', '4.5', '--vault', v]).out);
    const strict = withLimits('slack2', 'planning_limits: {slack_ok_hrs: 2}');
    const lax = withLimits('slack1', 'planning_limits: {slack_ok_hrs: 1}');
    const bad = run(SUN, ['slack', '--daylight', '10', '--drive', '4', '--activity', '4.5', '--vault', withLimits('slackbad', 'planning_limits: {slack_ok_hrs: lots}')]);
    return at(1.5) === 'ok' && at(2) === 'tight' && at(1) === 'ok' && cli(fine).verdict === 'ok' && cli(strict).verdict === 'tight' && cli(strict).slack_ok_hrs === 2
      && cli(lax).verdict === 'ok' && cli(fine).limit_source === 'default' && /trip\.md/.test(cli(strict).limit_source)
      && bad.code === 2 && /slack_ok_hrs/.test(bad.out) ? '' : JSON.stringify([cli(fine), cli(strict)]) + bad.out;
  });
  test('limits: slack_ok_hrs changes the travel verdict for a day with no dark driving', () => {
    const run1 = v => chk(v, [leg(44, 'hill')], { daylight_hrs: 7, activity_hrs: 4 });      // 2 hrs of driving + 0.3 for stops + 4: slack 0.7
    const a = run1(fine), b = run1(withLimits('slack-low', 'planning_limits: {slack_ok_hrs: 0.5}'));
    const c = chk(withLimits('slack-high', 'planning_limits: {slack_ok_hrs: 20}'), [leg(44, 'hill')]);   // plenty of daylight, but 20 hrs is asked for
    return a.verdict === 'tight' && b.verdict === 'ok' && c.verdict === 'tight' && c.slack.slack_ok_hrs === 20 ? '' : JSON.stringify([a, b, c]);
  });
  test('limits: dark_drive_tight_min moves the line between tight and too much for unagreed dark driving', () => {
    const dark = (v, start) => chk(v, [leg(44, 'hill', { after_dark: 'avoid' })], { start, sunset: '20:00' });   // 140 min on the road
    const wide = withLimits('dark60', 'planning_limits: {dark_drive_tight_min: 60}'), narrow = withLimits('dark10', 'planning_limits: {dark_drive_tight_min: 10}');
    return dark(fine, '18:30').verdict === 'too much' && dark(wide, '18:30').verdict === 'tight' && dark(fine, '18:00').verdict === 'tight' && dark(narrow, '18:00').verdict === 'too much'
      && dark(wide, '18:30').leave_earlier?.minutes === 60 ? '' : JSON.stringify([dark(fine, '18:30'), dark(wide, '18:30')]);
  });
  test('limits: late_finish_min moves the line for a day that ends late at a base without evenings out', () => {
    const late = v => chk(v, [leg(44, 'hill')], { start: '16:30', sunset: '17:30', evening_base_end: false, daylight_hrs: 14 });   // ends 80 min after sunset
    return late(fine).verdict === 'tight' && late(withLimits('late120', 'planning_limits: {late_finish_min: 120}')).verdict === 'ok'
      && late(withLimits('late30', 'planning_limits: {late_finish_min: 30}')).verdict === 'tight' ? '' : JSON.stringify(late(fine));
  });
  test('limits: max_drive_hrs_day flags a day over it (the day is not rewritten, only flagged)', () => {
    const day = v => chk(v, [leg(44, 'hill'), leg(44, 'hill'), leg(44, 'hill')]);       // 6 hrs of driving + stops
    const a = day(fine), b = day(withLimits('max9', 'planning_limits: {max_drive_hrs_day: 9}'));
    return a.over_max_drive === true && a.max_drive_hrs_day === 6 && a.drive_hrs > 6 && b.over_max_drive === false && b.max_drive_hrs_day === 9 ? '' : JSON.stringify([a, b]);
  });
  test('limits: travel.mjs config prints the limits and which ones trip.md changed', () => {
    const j = JSON.parse(run(TRAVEL, ['config', '--vault', withLimits('cfg', 'planning_limits: {late_finish_min: 90}')]).out);
    const bad = run(TRAVEL, ['config', '--vault', withLimits('cfgbad', 'planning_limits: {late_finish_mins: 90}')]);
    return j.limits.late_finish_min === 90 && j.limits.slack_ok_hrs === 1.5 && j.changed_in_trip_md.planning_limits.join() === 'late_finish_min'
      && bad.code === 2 && /"late_finish_mins" is not a setting/.test(bad.out) ? '' : JSON.stringify(j) + bad.out;
  });
  test('limits: the checker uses slack_ok_hrs for the travel_verdict warning, and reports a bad planning_limits value', () => {
    const base = fs.readFileSync(path.join(dayVault, 'Itinerary/Day 05.md'), 'utf8');            // slack 5.4, travel_verdict ok
    const mk = (name, line) => { const v = withLimits(name, line); fs.cpSync(path.join(dayVault, 'Itinerary'), path.join(v, 'Itinerary'), { recursive: true }); fs.cpSync(path.join(dayVault, 'Locations'), path.join(v, 'Locations'), { recursive: true });
      fs.cpSync(path.join(dayVault, 'Stays'), path.join(v, 'Stays'), { recursive: true }); fs.cpSync(path.join(dayVault, 'Sources'), path.join(v, 'Sources'), { recursive: true }); return check(v).out; };
    const none = mk('chk-default', ''), five = mk('chk-5', 'planning_limits: {slack_ok_hrs: 5}'), six = mk('chk-6', 'planning_limits: {slack_ok_hrs: 6}');
    const bad = mk('chk-bad', 'planning_limits: {slack_ok_hrs: lots, speed: 3}');
    return base.includes('travel_verdict: ok') && !warnLine(none, 'Day 05.md', 'travel_verdict is') && !warnLine(five, 'Day 05.md', 'travel_verdict is')
      && warnLine(six, 'Day 05.md', 'travel_verdict is "ok", but the day\'s slack (5.4 hrs) gives "tight"')
      && warnLine(bad, 'trip.md', 'planning_limits.slack_ok_hrs must be') && warnLine(bad, 'trip.md', '"speed" is not a setting') ? '' : none + five + six + bad;
  });

  // trip-init
  const exAnswers = JSON.parse(fs.readFileSync(path.join(ANSWERS, 'example-vault-answers.json'), 'utf8'));
  const reconf = (v, edit) => {
    const a = path.join(TMP, 'limits-answers-' + path.basename(v) + '.json'), x = JSON.parse(JSON.stringify(exAnswers));
    edit(x); fs.writeFileSync(a, JSON.stringify(x));
    return run(INIT, ['--answers', a, '--vault', v, '--reconfigure']);
  };
  const rd = (v, f) => fs.readFileSync(path.join(v, f), 'utf8');
  test('trip-init: a new vault gets planning_limits in trip.md and the default threshold in the Itinerary base', () => {
    const t = rd(portugal, 'trip.md'), b = rd(portugal, 'Bases/Itinerary.base');
    return t.includes('planning_limits: {slack_ok_hrs: 1.5, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 6}')
      && b === rd(path.join(ROOT, 'vault-template'), 'Bases/Itinerary.base') && b.includes('formula.slack_hrs < 1.5, "tight"') ? '' : t;
  });
  test('trip-init: a changed slack_ok_hrs is written to trip.md and into the Itinerary base, and changing it back restores the example exactly', () => {
    const v = path.join(TMP, 'limits-reconf');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const r1 = reconf(v, x => { x.planning_limits = { slack_ok_hrs: 2 }; });
    const t1 = rd(v, 'trip.md'), b1 = rd(v, 'Bases/Itinerary.base');
    const r2 = reconf(v, x => { delete x.planning_limits; });                                     // answers leave it out: the vault's value is kept
    const t2 = rd(v, 'trip.md');
    const r3 = reconf(v, x => { x.planning_limits = { max_drive_hrs_day: 8 }; });                 // one other limit: slack_ok_hrs stays 2
    const t3 = rd(v, 'trip.md');
    const r4 = reconf(v, x => { x.planning_limits = { slack_ok_hrs: 1.5, max_drive_hrs_day: 6 }; });
    const same = ['trip.md', 'Bases/Itinerary.base'].every(f => rd(v, f) === rd(path.join(ROOT, 'example-vault'), f));
    return r1.code === 0 && t1.includes('planning_limits: {slack_ok_hrs: 2, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 6}')
      && b1.includes('if(formula.slack_hrs < 0, "too much", if(formula.slack_hrs < 2, "tight", "ok"))') && /Bases\/Itinerary\.base/.test(r1.out)
      && t2.includes('slack_ok_hrs: 2,') && r2.out.includes('Nothing changed')
      && t3.includes('planning_limits: {slack_ok_hrs: 2, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 8}') && r3.code === 0
      && r4.code === 0 && same ? '' : [r1.out, t1, b1, r2.out, t2, r3.out, t3, r4.out].join('\n');
  });
  test('trip-init: a limit that is not a number, or not a setting, is refused and the vault is left alone', () => {
    const v = path.join(TMP, 'limits-refuse');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const before = rd(v, 'trip.md');
    const r = reconf(v, x => { x.planning_limits = { slack_ok_hrs: 'lots', speed: 3 }; });
    return r.code === 1 && /slack_ok_hrs must be/.test(r.out) && /"speed" is not a setting/.test(r.out) && rd(v, 'trip.md') === before ? '' : r.out;
  });
}

// ---- compare-itineraries: the Comparison note checks, and the made-up comparison
{
  const REF = path.join(ROOT, 'skills/compare-itineraries/references');
  const cmpName = 'Sources/Comparison - Agency quote vs Own draft.md';
  const cmpVault = path.join(TMP, 'compare');
  fs.cpSync(dayVault, cmpVault, { recursive: true });
  fs.copyFileSync(path.join(REF, 'example-context/Example Agency - Coast and Plains quote.md'), path.join(cmpVault, 'Sources/Example Agency - Coast and Plains quote.md'));
  fs.copyFileSync(path.join(REF, 'example-context/Route - Option B.md'), path.join(cmpVault, 'Itinerary/Route - Option B.md'));
  fs.copyFileSync(path.join(REF, 'comparison-example.md'), path.join(cmpVault, cmpName));
  const mine = out => out.split('\n').filter(l => /Comparison - Agency|Coast and Plains|Route - Option B/.test(l));
  const variant = (name, edit) => {
    const v = path.join(TMP, 'compare-' + name);
    fs.cpSync(cmpVault, v, { recursive: true });
    const f = path.join(v, cmpName);
    fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8')));
    return check(v);
  };
  const errorsOf = out => out.split('ERRORS')[1].split('WARNINGS')[0];
  const OPT_B = '  - "[[Route - Option B]]"\n';

  test('compare: the made-up comparison and its two options pass the checker with no errors or warnings about them', () => {
    const r = check(cmpVault);
    return r.code === 0 && !mine(r.out).length ? '' : r.out;
  });
  test('compare: a Comparison note belongs in Sources/ (the default folder), and the template is the same in both vaults', () => {
    const same = fs.readFileSync(path.join(ROOT, 'vault-template/Templates/Comparison.md'), 'utf8') === fs.readFileSync(path.join(ROOT, 'example-vault/Templates/Comparison.md'), 'utf8');
    const v = path.join(TMP, 'compare-folder');
    fs.cpSync(cmpVault, v, { recursive: true });
    fs.renameSync(path.join(v, cmpName), path.join(v, 'Itinerary/Comparison - Agency quote vs Own draft.md'));
    const r = check(v);
    return same && warnLine(r.out, 'Comparison - Agency', 'a "comparison" note must live in Sources/') ? '' : `template same: ${same}\n` + r.out;
  });
  test('compare: fewer than two options is an error', () => {
    const r = variant('one', t => t.replace(OPT_B, ''));
    return r.code === 1 && errorsOf(r.out).includes('options needs 2 or more links') ? '' : r.out;
  });
  test('compare: an option that is not a Source or Route note is flagged, and a repeated option too', () => {
    const a = variant('badopt', t => t.replace(OPT_B, '  - "[[Mountain Fort (Example)]]"\n').replace('recommended: "[[Route - Option B]]"', 'recommended:'));
    const b = variant('twice', t => t.replace(OPT_B, '  - "[[Example Agency - Coast and Plains quote]]"\n').replace('recommended: "[[Route - Option B]]"', 'recommended:'));
    return warnLine(a.out, 'Comparison - Agency', 'option [[Mountain Fort (Example)]] is not a Source or Route note') && warnLine(b.out, 'Comparison - Agency', 'lists the same note twice') ? '' : a.out + b.out;
  });
  test('compare: a status other than draft or decided is flagged', () => {
    const r = variant('status', t => t.replace('status: draft', 'status: pending'));
    return warnLine(r.out, 'Comparison - Agency', 'status "pending" is not one of: draft | decided') ? '' : r.out;
  });
  test('compare: decided_option must be one of the options, and is a warning when the status is not decided', () => {
    const notOne = variant('decided-bad', t => t.replace('status: draft\ndecided_option:', 'status: decided\ndecided_option: "[[Old Town Walk (Example)]]"'));
    const draft = variant('decided-draft', t => t.replace('decided_option:', 'decided_option: "[[Route - Option B]]"'));
    const empty = variant('decided-empty', t => t.replace('status: draft', 'status: decided'));
    const good = variant('decided-ok', t => t.replace('status: draft\ndecided_option:', 'status: decided\ndecided_option: "[[Route - Option B]]"'));
    return notOne.code === 1 && errorsOf(notOne.out).includes('decided_option [[Old Town Walk (Example)]] is not one of the options')
      && draft.code === 0 && warnLine(draft.out, 'Comparison - Agency', 'decided_option is set but status is "draft"')
      && empty.code === 0 && warnLine(empty.out, 'Comparison - Agency', 'status is decided but decided_option is empty')
      && good.code === 0 && !mine(good.out).length ? '' : [notOne.out, draft.out, empty.out, good.out].join('\n');
  });
  test('compare: recommended must be one of the options', () => {
    const r = variant('rec', t => t.replace('recommended: "[[Route - Option B]]"', 'recommended: "[[Old Town Walk (Example)]]"'));
    return warnLine(r.out, 'Comparison - Agency', 'recommended [[Old Town Walk (Example)]] is not one of the options') ? '' : r.out;
  });
  test('compare: tags must include comparison, and a template placeholder left in is an error', () => {
    const a = variant('tag', t => t.replace('  - comparison', '  - option')), b = variant('placeholder', t => t.replace('# Comparison - Agency quote vs Own draft', '# {{title}}'));
    return errorsOf(a.out).includes('tags must include "comparison"') && errorsOf(b.out).includes('{{title}}') ? '' : a.out + b.out;
  });

  test('compare: the made-up comparison\'s driving figures and prices match the travel script and the quote', () => {
    const text = fs.readFileSync(path.join(REF, 'comparison-example.md'), 'utf8');
    const a = JSON.parse(run(TRAVEL, ['check', '--input', path.join(REF, 'comparison-example-input.json'), '--vault', portugal]).out);
    const b = JSON.parse(run(TRAVEL, ['check', '--input', path.join(CHECKED, 'checked-example-input.json'), '--vault', portugal]).out);
    const quote = fs.readFileSync(path.join(REF, 'example-context/Example Agency - Coast and Plains quote.md'), 'utf8');
    const total = Number(quote.match(/^- Total (\d+) EUR/m)[1]), units = Number(fs.readFileSync(path.join(portugal, 'trip.md'), 'utf8').match(/^cost_split_units: (\d+)/m)[1]);
    const perUnit = total / units, draft = 1550;
    const darkMin = Math.round(a.legs.reduce((n, l) => n + l.dark_driving_min, 0) / 10) * 10;
    const bad = [];
    if (!(a.day.verdict === 'too much' && a.day.over_max_drive && a.day.ends_min_after_sunset > 0)) bad.push('the agency day should be too much, over the driving limit, and end after sunset');
    if (!(b.day.verdict === 'ok' && !b.day.over_max_drive)) bad.push('our draft\'s busiest day should be ok and under the driving limit');
    if (!text.includes(`Busiest day about ${Math.round(a.day.drive_hrs)} hrs (est.)`)) bad.push(`agency driving should say about ${Math.round(a.day.drive_hrs)} hrs`);
    if (!text.includes(`Busiest day about ${Math.round(b.day.drive_hrs)} hrs (est.)`)) bad.push(`draft driving should say about ${Math.round(b.day.drive_hrs)} hrs`);
    if (!text.includes(`about ${darkMin} minutes of hill road after sunset`)) bad.push(`dark driving should say about ${darkMin} minutes`);
    if (!text.includes(`€${perUnit.toLocaleString('en-US')} (quoted)`)) bad.push(`cost per couple should be €${perUnit.toLocaleString('en-US')}`);
    if (!text.includes(`about €${perUnit - draft} cheaper per couple`)) bad.push(`the gap should be €${perUnit - draft}`);
    return bad.join('; ');
  });
  test('compare: skills that have a SKILL.md are named after their folder', () => {
    const dirs = fs.readdirSync(path.join(ROOT, 'skills')).filter(d => fs.existsSync(path.join(ROOT, 'skills', d, 'SKILL.md')));
    const bad = dirs.filter(d => !new RegExp(`^---\\nname: ${d}\\n`).test(fs.readFileSync(path.join(ROOT, 'skills', d, 'SKILL.md'), 'utf8')));
    return dirs.includes('compare-itineraries') && !bad.length ? '' : `wrong or missing name in: ${bad.join(', ')}`;
  });
}
test('plugin: both manifests have the same version, and it is 0.8.0', () => {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8')).version;
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).plugins[0].version;
  return a === b && a === '0.8.0' ? '' : `plugin.json ${a}, marketplace.json ${b}`;
});
test('vaults: the Day Plan template, trip.md notes and Home pointer agree between vault-template and example-vault', () => {
  const rd = (v, f) => fs.readFileSync(path.join(ROOT, v, f), 'utf8');
  // the three per-trip lines (slots S1 to S3) may differ; everything else in the template must be identical
  const mask = t => t.replace(/^daylight_hrs:.*$/m, 'daylight_hrs: X').replace(/^\| \d{2}:\d{2} \| Breakfast.*$/m, 'START').replace(/^\| \d{2}:\d{2} \| Sunset.*$/m, 'SUNSET');
  const bullet = t => t.split('\n').find(l => l.startsWith('- Optional, for the `review-travel-times` skill')) || '';
  const limitsBullet = t => t.split('\n').find(l => l.startsWith('- `planning_limits` are')) || '';
  const bad = [];
  if (mask(rd('vault-template', 'Templates/Day Plan.md')) !== mask(rd('example-vault', 'Templates/Day Plan.md'))) bad.push('Day Plan template');
  if (!bullet(rd('vault-template', 'trip.md')) || bullet(rd('vault-template', 'trip.md')) !== bullet(rd('example-vault', 'trip.md'))) bad.push('trip.md travel bullet');
  if (!limitsBullet(rd('vault-template', 'trip.md')) || limitsBullet(rd('vault-template', 'trip.md')) !== limitsBullet(rd('example-vault', 'trip.md'))) bad.push('trip.md planning_limits bullet');
  const limitsLine = t => t.split('\n').find(l => l.startsWith('planning_limits:')) || '';
  if (!limitsLine(rd('vault-template', 'trip.md')) || limitsLine(rd('vault-template', 'trip.md')) !== limitsLine(rd('example-vault', 'trip.md'))) bad.push('trip.md planning_limits line');
  if (rd('vault-template', 'Templates/Comparison.md') !== rd('example-vault', 'Templates/Comparison.md')) bad.push('Comparison template');
  for (const v of ['vault-template', 'example-vault']) if (!rd(v, '00 Home.md').includes('review-travel-times')) bad.push(`${v} Home pointer`);
  for (const v of ['vault-template', 'example-vault']) if (!rd(v, '00 Home.md').includes('compare-itineraries')) bad.push(`${v} Home pointer to compare-itineraries`);
  return bad.length ? `differs or missing: ${bad.join(', ')}` : '';
});

{
  // Migration: make a vault that looks like it was made before 0.6.0, then migrate it.
  const MIGRATE = path.join(ROOT, 'skills/add-place/scripts/migrate-after-dark.mjs');
  const old = path.join(TMP, 'pre-0.6');
  fs.cpSync(path.join(ROOT, 'example-vault'), old, { recursive: true });
  const rw = (rel, fn) => { const p = path.join(old, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  rw('Templates/Location.md', s => s.replace('best_time_of_day: []\nafter_dark:\nafter_dark_note:\n', 'best_time_of_day:\n')
    .replace(/^(best_time_of_day|after_dark|after_dark_note): .*\|.*\n/gm, ''));
  rw('.obsidian/types.json', s => s.replace('"best_time_of_day": "multitext"', '"best_time_of_day": "text"').replace(/\s*"after_dark(_note)?": "text",/g, '').replace(/\s*"rule_bends": "number",/, ''));
  rw('trip.md', s => s.replace('evening_bases: []\n', ''));
  for (const f of fs.readdirSync(path.join(old, 'Locations'))) {
    rw(`Locations/${f}`, s => s.replace(/best_time_of_day: \[.*\]\nafter_dark:\nafter_dark_note:\n/, 'best_time_of_day: Late morning to early afternoon\n'));
  }
  rw(exLoc, s => s.replace('best_time_of_day: Late morning to early afternoon', 'best_time_of_day: Morning, evening'));
  rw('Locations/Kynrem Falls.md', s => s.replace('best_time_of_day: Late morning to early afternoon', 'best_time_of_day:\n  - sunrise'));
  const snapshot = () => {
    const out = {};
    (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : out[path.relative(old, p)] = fs.readFileSync(p, 'utf8'); } })(old);
    return JSON.stringify(out);
  };
  const migrate = (...a) => run(MIGRATE, a, old);
  const before = snapshot();
  test('migrate-after-dark: --dry-run changes nothing', () => {
    const r = migrate('--dry-run');
    return r.code === 0 && snapshot() === before && /would change/.test(r.out) ? '' : r.out;
  });
  const first = migrate();
  const after = JSON.parse(snapshot());
  test('migrate-after-dark: adds the fields in template order, and brings the template, types and trip.md to what vault-template has', () => {
    const cur = rel => fs.readFileSync(path.join(ROOT, 'example-vault', rel), 'utf8');
    const bad = [];
    if (first.code !== 0) bad.push(first.out);
    for (const rel of ['Templates/Location.md', '.obsidian/types.json', 'trip.md']) if (after[rel] !== cur(rel)) bad.push(`${rel} is not what the starter vault has`);
    if (!/best_time_of_day:\n {2}- morning\n {2}- evening\nafter_dark:\nafter_dark_note:\nopening_hours:/.test(after[exLoc])) bad.push('Arwah Cave: expected [morning, evening] then the two new fields');
    if (!/best_time_of_day:\n {2}- sunrise\nafter_dark:\nafter_dark_note:\n/.test(after['Locations/Kynrem Falls.md'])) bad.push('Kynrem Falls: a list should be kept as it is');
    return bad.join('\n');
  });
  test('migrate-after-dark: text that is not a value is not guessed at, and is kept under Tips', () => {
    const n = after['Locations/Elephant Falls.md'];
    return /best_time_of_day: \[\]\nafter_dark:\nafter_dark_note:\n/.test(n) && /## Tips\n[\s\S]*- Best time, as first written: Late morning to early afternoon\n/.test(n) ? '' : n;
  });
  test('migrate-after-dark: the migrated vault has no value warnings, and a second run changes nothing', () => {
    const r = check(old), again = migrate(), snap = snapshot();
    return r.code === 0 && !/not one of|should be a list/.test(r.out) && again.code === 0 && /Nothing to do/.test(again.out)
      && snap === JSON.stringify(after) ? '' : r.out + again.out;
  });
}

// ---- (d) a broken vault: every problem must be reported
const broken = path.join(TMP, 'broken');
fs.cpSync(path.join(ROOT, 'example-vault'), broken, { recursive: true });
const edit = (rel, from, to) => {
  const p = path.join(broken, rel), t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) throw new Error(`test setup: "${from}" not found in ${rel}`);
  fs.writeFileSync(p, t.replace(from, to));
};
const loc = 'Locations/Arwah Cave.md';
const wrongTypeNote = 'Locations/Elephant Falls.md';
const unknownTypeNote = 'Locations/Janailar Falls.md';
const listNote = 'Locations/Kynrem Falls.md';
const boxNote = 'Locations/Labon Falls.md';
const propNote = 'Locations/Moopun Falls.md';
const numberNote = 'Locations/Prut Falls.md';
edit(wrongTypeNote, 'type: location', 'type: stay');
edit(unknownTypeNote, 'type: location', 'type: banana');
edit(listNote, /difficulty: .*/.exec(fs.readFileSync(path.join(broken, listNote), 'utf8'))[0], 'difficulty: impossible');
edit(boxNote, /^location:(\n  - .*)+\n/m.exec(fs.readFileSync(path.join(broken, boxNote), 'utf8'))[0], 'location: [48.8584, 2.2945]\n');
edit(propNote, 'tags:', 'mystery_field: hello\ntags:');
edit(numberNote, /entry_fee:.*/.exec(fs.readFileSync(path.join(broken, numberNote), 'utf8'))[0], 'entry_fee: lots');
fs.writeFileSync(path.join(broken, 'Stray note.md'), '');
// A Day note filed in Locations/ (wrong folder), and a Day note in the right place with a bad number.
const dayTpl = fs.readFileSync(path.join(broken, 'Templates/Day Plan.md'), 'utf8');
fs.writeFileSync(path.join(broken, 'Locations/Day 01.md'), dayTpl.replace('{{title}}', 'Day 01'));
fs.mkdirSync(path.join(broken, 'Itinerary'), { recursive: true });
fs.writeFileSync(path.join(broken, 'Itinerary/Day 02.md'), dayTpl.replace('{{title}}', 'Day 02').replace('drive_hrs:', 'drive_hrs: many'));
// A Food note with a decision value that is not allowed, and a Route note whose nights do not add up.
fs.mkdirSync(path.join(broken, 'Food'), { recursive: true });
fs.writeFileSync(path.join(broken, 'Food/Cafe.md'), fs.readFileSync(path.join(broken, 'Templates/Food Spot.md'), 'utf8')
  .replace('{{title}}', 'Cafe').replace('decision: considering', 'decision: maybe'));
fs.writeFileSync(path.join(broken, 'Itinerary/Route.md'), fs.readFileSync(path.join(broken, 'Templates/Route.md'), 'utf8')
  .replace('{{title}}', 'Route').replace('bases: []', 'bases: [A, B]').replace('nights_per_base: []', 'nights_per_base: [2]'));

const brokenRun = check(broken);
const expectIn = (name, file, text, level) => test(`checker finds: ${name}`, () => {
  const section = brokenRun.out.split('WARNINGS (')[level === 'error' ? 0 : 1];
  return section.split('\n').some(l => l.includes(file) && l.includes(text)) ? '' : `no ${level} line with "${file}" and "${text}"`;
});
test('checker: broken vault exits non-zero', () => brokenRun.code === 1 ? '' : `exit code ${brokenRun.code}`);
expectIn('wrong type (a place filed as a stay)', wrongTypeNote, 'must live in Stays/', 'error');
expectIn('unknown type', unknownTypeNote, 'type "banana" has no template', 'error');
expectIn('value outside a closed list', listNote, 'difficulty "impossible" is not one of', 'warning');
expectIn('coordinates outside map_box', boxNote, 'outside the trip map_box', 'error');
expectIn('unknown property', propNote, 'mystery_field', 'warning');
expectIn('non-number in a number property', numberNote, 'entry_fee must be a plain number', 'error');
expectIn('stray file in the root', 'Stray note.md', 'EMPTY note in the vault root', 'error');
expectIn('Day note in the wrong folder', 'Locations/Day 01.md', 'must live in Itinerary/', 'error');
expectIn('bad number in a Day note', 'Itinerary/Day 02.md', 'drive_hrs must be a plain number', 'error');
expectIn('bad decision value in a Food note', 'Food/Cafe.md', 'decision "maybe" is not one of', 'error');
expectIn('Route nights that do not match the bases', 'Itinerary/Route.md', 'nights_per_base', 'warning');

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
