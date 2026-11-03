// Tests for trip-huddle. Run from anywhere:  node scripts/test.mjs
// Covers: the checker on the example vault, trip-init reconfigure leaving the example vault unchanged,
// trip-init making a new vault the checker accepts, the plan-day sun script and example, the after-dark checks
// and migration, the review-travel-times script (road-type time, stops buffer, trip.md settings, verdicts), its
// made-up checked example, the travel_verdict warning, the planning_limits in trip.md (they change the verdicts, reach the
// Itinerary base through trip-init, and are checked), Comparison notes and the made-up comparison, Food notes (the template, the Base, the folder, the example notes and the upgrade of an older vault),
// the booking list (templates, the Bookings base, the example, the checker's booking warnings, trip-init --add-bookings and migrate-bookings),
// build-itinerary (the route script's links, candidates and check on the made-up loops, road cutoffs, the Route Day by day checks, the
// Trip itinerary and Operator brief, trip-init's road_cutoffs and --add-itinerary, migrate-itinerary), and a deliberately
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

  test('limits: the defaults are 1.5 hrs of slack, 30 min of dark driving, 60 min late, 6 hrs of driving a day, 20 min on the way', () => {
    const none = loadPlanningLimits(fine), starter = loadPlanningLimits(path.join(ROOT, 'vault-template'));
    return JSON.stringify(PLANNING_LIMIT_DEFAULTS) === '{"slack_ok_hrs":1.5,"dark_drive_tight_min":30,"late_finish_min":60,"max_drive_hrs_day":6,"on_the_way_min":20}'
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
    return t.includes('planning_limits: {slack_ok_hrs: 1.5, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 6, on_the_way_min: 20}') && t.includes('\nroad_cutoffs: []\n')
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
    return r1.code === 0 && t1.includes('planning_limits: {slack_ok_hrs: 2, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 6, on_the_way_min: 20}')
      && b1.includes('if(formula.slack_hrs < 0, "too much", if(formula.slack_hrs < 2, "tight", "ok"))') && /Bases\/Itinerary\.base/.test(r1.out)
      && t2.includes('slack_ok_hrs: 2,') && r2.out.includes('Nothing changed')
      && t3.includes('planning_limits: {slack_ok_hrs: 2, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 8, on_the_way_min: 20}') && r3.code === 0
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
// ---- group-decisions: Decision notes, locks, the stage in trip.md
{
  const rd = (v, f) => fs.readFileSync(path.join(ROOT, v, f), 'utf8');
  const DEC = ['Decision - Stay in Sohra', 'Decision - Dawki boat ride', 'Decision - How we get around'];
  const mineD = out => out.split('\n').filter(l => /Decisions\//.test(l));
  const errorsOf = out => out.split('ERRORS')[1].split('WARNINGS')[0];
  // A copy of the example in which one Decision note (and, through `more`, anything else) can be changed.
  const dvariant = (tag, name, edit, more = () => {}) => {
    const v = path.join(TMP, 'dec-' + tag);
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const f = path.join(v, 'Decisions', name + '.md');
    fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8')));
    more(v);
    return check(v);
  };
  const setIn = (v, rel, from, to) => {
    const f = path.join(v, rel), t = fs.readFileSync(f, 'utf8');
    if (!t.includes(from)) throw new Error(`test setup: "${from}" not in ${rel}`);
    fs.writeFileSync(f, t.replace(from, to));
  };
  const LOCKED = 'Decision - How we get around';
  const SOHRA = 'Decision - Stay in Sohra';
  const lockSohra = t => t.replace('status: open', 'status: locked').replace('decided_option:', 'decided_option: "[[Sohra Plaza]]"')
    .replace('decision_reason:', 'decision_reason: the group chose it').replace('locked_by:', 'locked_by: stay booked');
  const select = (file, from = 'decision: considering', to = 'decision: selected') => v => setIn(v, file, from, to);

  test('decisions: the example\'s Decision notes pass the checker with no errors or warnings about them', () => {
    const r = check(path.join(ROOT, 'example-vault'));
    const missing = DEC.filter(n => !fs.existsSync(path.join(ROOT, 'example-vault/Decisions', n + '.md')));
    return r.code === 0 && !mineD(r.out).length && !missing.length ? '' : missing.join() + r.out;
  });
  test('decisions: the example has an open, a decided and a locked decision, and no dates', () => {
    const texts = DEC.map(n => rd('example-vault', `Decisions/${n}.md`));
    const st = texts.map(t => t.match(/^status: (\w+)/m)[1]).sort().join();
    const emptyDates = texts.every(t => /^decided_on:\s*$/m.test(t) && /^deadline:\s*$/m.test(t));
    const dateLike = /\b\d{4}-\d{2}-\d{2}\b/.test(texts.join('\n').replace(/YYYY-MM-DD/g, ''));
    return st === 'decided,locked,open' && emptyDates && !dateLike ? '' : `${st} emptyDates=${emptyDates} dateLike=${dateLike}`;
  });
  test('decisions: the template, the Base, the types and the home page sections are in both vaults', () => {
    const bad = [];
    for (const f of ['Templates/Decision.md', 'Bases/Decisions.base', '.obsidian/types.json']) if (rd('vault-template', f) !== rd('example-vault', f)) bad.push(f);
    for (const v of ['vault-template', 'example-vault']) {
      const home = rd(v, '00 Home.md');
      if (!home.includes('![[Decisions.base#Open]]') || !home.includes('![[Decisions.base#Locked]]')) bad.push(`${v} Home embeds`);
      const base = rd(v, 'Bases/Decisions.base');
      for (const view of ['Open', 'Decided', 'Locked']) if (!new RegExp(`name: ${view}\\n[\\s\\S]*?status == "${view.toLowerCase()}"`).test(base)) bad.push(`${v} ${view} view`);
      if (!/name: Open[\s\S]*?property: deadline\n\s+direction: ASC/.test(base)) bad.push('Open view is not sorted by deadline');
      for (const t of ['question', 'locks', 'locked_by', 'affects', 'deadline']) if (!JSON.parse(rd(v, '.obsidian/types.json')).types[t]) bad.push(`${v} type ${t}`);
      if (!fs.existsSync(path.join(ROOT, v, v === 'vault-template' ? 'Decisions/.gitkeep' : 'Decisions'))) bad.push(`${v} Decisions folder`);
      if (!rd(v, 'trip.md').includes('\nstage: planning\n')) bad.push(`${v} trip.md stage`);
    }
    return bad.join('; ');
  });
  test('decisions: a Decision note belongs in Decisions/', () => {
    const v = path.join(TMP, 'dec-folder');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    fs.renameSync(path.join(v, 'Decisions', LOCKED + '.md'), path.join(v, 'Locations', LOCKED + '.md'));
    return warnLine(errorsOf(check(v).out), LOCKED, 'a "decision" note must live in Decisions/') ? '' : 'no folder error';
  });

  // errors
  test('decisions: a status other than open, decided or locked is an error', () => {
    const r = dvariant('status', LOCKED, t => t.replace('status: locked', 'status: final'));
    return r.code === 1 && warnLine(errorsOf(r.out), LOCKED, 'status "final" must be one of: open | decided | locked') ? '' : r.out;
  });
  test('decisions: decided_option must be one of the options', () => {
    const r = dvariant('opt', LOCKED, t => t.replace('decided_option: Hired van with a driver', 'decided_option: A hot air balloon'));
    return r.code === 1 && warnLine(errorsOf(r.out), LOCKED, 'decided_option "A hot air balloon" is not one of the options') ? '' : r.out;
  });
  test('decisions: decided_option works as a link as well as plain text', () => {
    const r = dvariant('link', SOHRA, lockSohra, select('Stays/Sohra Plaza.md'));
    return r.code === 0 && !mineD(r.out).length ? '' : r.out;
  });
  test('decisions: decided_option is not allowed while the decision is open', () => {
    const r = dvariant('openopt', SOHRA, t => t.replace('decided_option:', 'decided_option: "[[Sohra Plaza]]"'));
    return r.code === 1 && warnLine(errorsOf(r.out), SOHRA, 'decided_option is set but status is open') ? '' : r.out;
  });
  test('decisions: decided or locked with no decided_option is an error', () => {
    const a = dvariant('nochoice-d', SOHRA, t => t.replace('status: open', 'status: decided'));
    const b = dvariant('nochoice-l', LOCKED, t => t.replace('decided_option: Hired van with a driver', 'decided_option:'));
    return warnLine(errorsOf(a.out), SOHRA, 'status is decided but decided_option is empty') && warnLine(errorsOf(b.out), LOCKED, 'status is locked but decided_option is empty') ? '' : a.out + b.out;
  });
  test('decisions: locked needs locked_by (an error) and locks (a warning)', () => {
    const a = dvariant('nolockedby', LOCKED, t => t.replace('locked_by: van booked', 'locked_by:'));
    const b = dvariant('nolocks', LOCKED, t => t.replace('locks:\n  - vehicle', 'locks: []'));
    return a.code === 1 && warnLine(errorsOf(a.out), LOCKED, 'locked_by is empty') && b.code === 0 && warnLine(b.out, LOCKED, 'locks is empty') ? '' : a.out + b.out;
  });
  test('decisions: a locks value outside the list, a repeated option, no question and no reason are warnings', () => {
    const r = dvariant('warns', LOCKED, t => t.replace('  - vehicle', '  - weather').replace('  - Self-drive', '  - Self-drive\n  - Self-drive')
      .replace('question: How do we get around for the whole trip?', 'question:').replace(/decision_reason: .*/, 'decision_reason:'));
    return r.code === 0 && warnLine(r.out, LOCKED, 'locks "weather" is not one of: dates | arrival | departure | route | stay | place | vehicle | activity | budget')
      && warnLine(r.out, LOCKED, 'options lists the same choice twice') && warnLine(r.out, LOCKED, 'question is empty') && warnLine(r.out, LOCKED, 'no decision_reason') ? '' : r.out;
  });
  test('decisions: tags must include decision, and a template placeholder left in is an error', () => {
    const a = dvariant('tags', LOCKED, t => t.replace('  - decision\n---', '  - other\n---'));
    const b = dvariant('placeholder', LOCKED, t => t.replace('# Decision - How we get around', '# {{title}}'));
    return warnLine(errorsOf(a.out), LOCKED, 'tags must include "decision"') && warnLine(errorsOf(b.out), LOCKED, 'template placeholder') ? '' : a.out + b.out;
  });

  // conflicts with a locked decision (warnings)
  test('decisions: a locked stay that is not selected is flagged, and is fine once the stay is selected', () => {
    const bad = dvariant('stay-bad', SOHRA, lockSohra);
    const ok = dvariant('stay-ok', SOHRA, lockSohra, select('Stays/Sohra Plaza.md'));
    return bad.code === 0 && warnLine(bad.out, SOHRA, 'locked on [[Sohra Plaza]], but that stay is "considering", not selected') && !mineD(ok.out).length ? '' : bad.out + ok.out;
  });
  test('decisions: a locked place that is not selected is flagged', () => {
    const r = dvariant('place', SOHRA, t => lockSohra(t).replace('options:\n', 'options:\n  - "[[Umngot River (Dawki)]]"\n')
      .replace('decided_option: "[[Sohra Plaza]]"', 'decided_option: "[[Umngot River (Dawki)]]"'));
    return warnLine(r.out, SOHRA, 'locked on [[Umngot River (Dawki)]], but that place is "considering", not selected') ? '' : r.out;
  });
  test('decisions: a locked route must be agreed or booked', () => {
    const lockRoute = t => t.replace('status: open', 'status: locked').replace('options:\n', 'options:\n  - "[[Route - Main]]"\n').replace('decided_option:', 'decided_option: "[[Route - Main]]"')
      .replace('decision_reason:', 'decision_reason: agreed').replace('locked_by:', 'locked_by: route booked').replace('  - stay', '  - route');
    const mk = (tag, status) => dvariant(tag, SOHRA, lockRoute, v => {
      fs.mkdirSync(path.join(v, 'Itinerary'), { recursive: true });
      fs.writeFileSync(path.join(v, 'Itinerary/Route - Main.md'), rd('example-vault', 'Templates/Route.md').replace('{{title}}', 'Route - Main').replace('status: draft', 'status: ' + status));
    });
    const draft = mk('route-draft', 'draft'), agreed = mk('route-agreed', 'agreed'), booked = mk('route-booked', 'booked');
    return warnLine(draft.out, SOHRA, 'locked on the route [[Route - Main]], but that Route note is "draft"') && !mineD(agreed.out).length && !mineD(booked.out).length ? '' : draft.out + agreed.out + booked.out;
  });
  test('decisions: a dropped note in affects of a locked decision is flagged, but not for one that is only decided', () => {
    const prep = v => {
      select('Stays/Sohra Plaza.md')(v);
      setIn(v, 'Stays/Polo Cherrapunjee Resort.md', 'decision: considering', 'decision: dropped');
      setIn(v, 'Stays/Polo Cherrapunjee Resort.md', 'decision_reason:', 'decision_reason: too far');
    };
    const locked = dvariant('dropped-l', SOHRA, lockSohra, prep);
    const decided = dvariant('dropped-d', SOHRA, t => lockSohra(t).replace('status: locked', 'status: decided').replace('locked_by: stay booked', 'locked_by:'), prep);
    return warnLine(locked.out, SOHRA, 'affects [[Polo Cherrapunjee Resort]], which the group dropped') && !warnLine(decided.out, SOHRA, 'dropped') ? '' : locked.out + decided.out;
  });
  test('decisions: locked dates while dates_fixed is false is flagged, and is fine when dates_fixed is true or absent', () => {
    const lockDates = t => t.replace('  - vehicle', '  - dates');
    const bad = dvariant('dates-bad', LOCKED, lockDates);
    const ok = dvariant('dates-ok', LOCKED, lockDates, v => setIn(v, 'trip.md', 'dates_fixed: false', 'dates_fixed: true'));
    const none = dvariant('dates-none', LOCKED, lockDates, v => setIn(v, 'trip.md', 'dates_fixed: false\n', ''));
    return warnLine(bad.out, LOCKED, 'locks the dates, but dates_fixed is false') && !mineD(ok.out).length && !mineD(none.out).length ? '' : bad.out + ok.out + none.out;
  });

  // the stage in trip.md
  test('stage: every stage word passes, a bad one is a warning, and a vault with no stage line is fine', () => {
    const one = (tag, to) => { const v = path.join(TMP, 'stage-' + tag); fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true }); setIn(v, 'trip.md', 'stage: planning\n', to); return check(v); };
    const words = ['planning', 'booking', 'travelling', 'after'].map(w => one(w, `stage: ${w}\n`));
    const bad = one('bad', 'stage: holiday\n'), none = one('none', '');
    return words.every(r => r.code === 0 && !/stage "/.test(r.out)) && bad.code === 0 && warnLine(bad.out, 'trip.md', 'stage "holiday" is not one of: planning | booking | travelling | after')
      && none.code === 0 && counts(none.out).warnings === counts(check(path.join(ROOT, 'example-vault')).out).warnings ? '' : bad.out + none.out;   // the example's own warnings (Food notes with no coordinates) are the baseline
  });
  test('trip-init: a new vault gets stage planning and the Decision files, and passes the checker', () => {
    const t = fs.readFileSync(path.join(portugal, 'trip.md'), 'utf8');
    const r = check(portugal);
    return /\nstage: planning\n/.test(t) && fs.existsSync(path.join(portugal, 'Decisions')) && fs.existsSync(path.join(portugal, 'Templates/Decision.md'))
      && fs.existsSync(path.join(portugal, 'Bases/Decisions.base')) && r.code === 0 && counts(r.out).errors === 0 ? '' : t + r.out;
  });
  test('trip-init: the stage is written from the answers, kept on reconfigure when left out, and a bad one is refused', () => {
    const v = path.join(TMP, 'stage-init');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const answers = (name, extra) => {
      const f = path.join(TMP, name + '.json');
      fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(ANSWERS, 'example-vault-answers.json'), 'utf8')), ...extra }));
      return f;
    };
    const stageOf = dir => fs.readFileSync(path.join(dir, 'trip.md'), 'utf8').match(/^stage: (.*)$/m)?.[1];
    const a = run(INIT, ['--answers', answers('st-booking', { stage: 'booking' }), '--vault', v, '--reconfigure']);
    const afterA = stageOf(v);
    const b = run(INIT, ['--answers', answers('st-none', {}), '--vault', v, '--reconfigure']);   // left out: kept
    const afterB = stageOf(v);
    const before = fs.readFileSync(path.join(v, 'trip.md'), 'utf8');
    const bad = run(INIT, ['--answers', answers('st-bad', { stage: 'holiday' }), '--vault', v, '--reconfigure']);
    const refusedKept = fs.readFileSync(path.join(v, 'trip.md'), 'utf8') === before;
    const c = run(INIT, ['--answers', answers('st-back', { stage: 'planning' }), '--vault', v, '--reconfigure']);
    const same = run(INIT, ['--answers', path.join(ANSWERS, 'example-vault-answers.json'), '--vault', v, '--reconfigure']);
    const old = path.join(TMP, 'stage-old');   // an older trip.md with no stage line gets planning
    fs.cpSync(path.join(ROOT, 'example-vault'), old, { recursive: true });
    setIn(old, 'trip.md', 'stage: planning\n', '');
    const o = run(INIT, ['--answers', path.join(ANSWERS, 'example-vault-answers.json'), '--vault', old, '--reconfigure']);
    return a.code === 0 && afterA === 'booking' && b.code === 0 && afterB === 'booking' && bad.code === 1 && /stage "holiday" is not one of/.test(bad.out) && refusedKept
      && c.code === 0 && stageOf(v) === 'planning' && same.out.includes('Nothing changed') && o.code === 0 && stageOf(old) === 'planning' ? ''
      : JSON.stringify({ afterA, afterB, refusedKept, old: stageOf(old) }) + a.out + bad.out + o.out;
  });
  test('trip-init: reconfigure leaves the Decision notes alone', () => {
    const v = path.join(TMP, 'stage-notes');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const snap = () => DEC.map(n => fs.readFileSync(path.join(v, 'Decisions', n + '.md'), 'utf8')).join('\n');
    const before = snap();
    const f = path.join(TMP, 'st-notes.json');
    fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(ANSWERS, 'example-vault-answers.json'), 'utf8')), stage: 'travelling' }));
    const r = run(INIT, ['--answers', f, '--vault', v, '--reconfigure']);
    return r.code === 0 && snap() === before ? '' : r.out;
  });

  // the skills and the roadmap
  test('group-decisions: the skill names the stages and the lock table, and the other skills read locked decisions', () => {
    const sk = n => fs.readFileSync(path.join(ROOT, 'skills', n, 'SKILL.md'), 'utf8');
    const bad = [];
    const g = sk('group-decisions');
    for (const w of ['planning', 'booking', 'travelling', 'after', 'flights booked', 'dates, arrival, departure', 'never choose', 'Budget snapshot', 'cost_split_units', 'Unlock']) if (!new RegExp(w, 'i').test(g)) bad.push(`group-decisions: ${w}`);
    for (const n of ['plan-day', 'review-travel-times', 'compare-itineraries', 'add-place', 'add-source']) {
      const t = sk(n);
      if (!/Decisions\//.test(t) || !/status: locked|`status: locked`/.test(t)) bad.push(`${n} does not read locked decisions`);
    }
    for (const n of ['plan-day', 'review-travel-times', 'compare-itineraries', 'add-place', 'add-source']) if (!/unlock/.test(sk(n))) bad.push(`${n} does not mention unlocking`);
    if (!/stage/.test(sk('trip-init'))) bad.push('trip-init does not mention stage');
    if (!/Locked decisions are rules/.test(rd('vault-template', '.claude/CLAUDE.md'))) bad.push('vault CLAUDE.md rule');
    return bad.join('; ');
  });
  test('group-decisions: the roadmap marks it done and lists the booking phase; the plan says built', () => {
    const r = rd('.', 'docs/ROADMAP.md');
    const bad = [];
    if (!/\[x\] \(v0\.10\.0\) \*\*`group-decisions`\*\*/.test(r)) bad.push('not marked done');
    if (!/## Phase: booking and beyond/.test(r)) bad.push('no booking phase');
    for (const w of ['Booking task list', 'Booking deadlines', 'Travelling', 'After travel', 'settle-up per family', 'would we go again']) if (!r.includes(w)) bad.push(w);
    if (!/^Status: built \(v0\.10\.0\)/m.test(rd('.', 'docs/PLAN-group-decisions.md'))) bad.push('plan status line');
    return bad.join('; ');
  });
}

// ---- build-itinerary (v0.12.0): the route script, the distance file, road cutoffs, Route Day by day, the Trip itinerary and
// Operator brief, trip-init and the upgrade of an older vault
{
  const ROUTE = path.join(ROOT, 'skills/build-itinerary/scripts/route.mjs');
  const BREF = path.join(ROOT, 'skills/build-itinerary/references');
  const rd = (v, f) => fs.readFileSync(path.join(v, f), 'utf8');
  const routeJson = (v, ...a) => { const r = run(ROUTE, [...a, '--vault', v]); if (r.code !== 0) throw new Error(r.out); return JSON.parse(r.out); };
  // The made-up example: a copy of the example vault with the choices, the road cutoff and the files in example-setup.json.
  const setup = JSON.parse(fs.readFileSync(path.join(BREF, 'example-setup.json'), 'utf8'));
  const makeBv = name => {
    const v = path.join(TMP, name);
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    let t = rd(v, 'trip.md');
    for (const [k, line] of Object.entries(setup.trip_md)) t = t.replace(new RegExp(`^${k}:.*$`, 'm'), line);
    fs.writeFileSync(path.join(v, 'trip.md'), t);
    for (const [n, pr] of Object.entries(setup.select)) {
      const f = path.join(v, 'Locations', n + '.md');
      fs.writeFileSync(f, rd(v, `Locations/${n}.md`).replace('decision: considering', 'decision: selected').replace(/^priority:.*$/m, `priority: ${pr}`));
    }
    for (const [from, to] of Object.entries(setup.files)) { fs.mkdirSync(path.dirname(path.join(v, to)), { recursive: true }); fs.copyFileSync(path.join(BREF, from), path.join(v, to)); }
    return v;
  };
  const bv = makeBv('build');
  const A = routeJson(bv, 'check', '--route', 'Itinerary/Route - Option A.md');
  const B = routeJson(bv, 'check', '--route', 'Itinerary/Route - Option B.md');

  test('build-itinerary: the example (two Route options and legs.json) passes the checker with no warnings about them', () => {
    const r = check(bv);
    return r.code === 0 && !r.out.split('\n').some(l => /Route - Option|legs\.json|trip\.md/.test(l)) ? '' : r.out;
  });
  test('build-itinerary: the check finds the cutoff break and the doubling back in the standard loop, and neither in the reverse', () => {
    const bad = [];
    const cutA = A.trip.cutoff_breaks;
    if (!(cutA.length && cutA.every(c => c.day === 6 && c.area === 'Jowai' && c.minutes > 0))) bad.push(`A cutoff breaks: ${JSON.stringify(cutA)}`);
    if (!(A.trip.doubling_back.km === 64 && A.trip.doubling_back.roads.some(r => /Jowai/.test(r.road) && /Shillong/.test(r.road)))) bad.push(`A doubling back: ${JSON.stringify(A.trip.doubling_back)}`);
    if (A.days[5].verdict !== 'too much' || !A.days[5].over_max_drive || A.days[5].backtrack_km !== 64) bad.push('A Day 6 should be too much, over the drive limit, with 64 km driven twice');
    if (B.trip.cutoff_breaks.length || B.trip.doubling_back.km !== 0 || B.trip.after_dark.length) bad.push(`B: ${JSON.stringify([B.trip.cutoff_breaks, B.trip.doubling_back, B.trip.after_dark])}`);
    if (B.days.some(d => d.verdict === 'too much') || B.trip.days_over_drive_limit.length) bad.push('B should have no too-much day');
    for (const [n, x] of [['A', A], ['B', B]]) {
      if (x.trip.must_places.missed.length || x.trip.must_places.covered.length !== 4) bad.push(`${n} must places: ${JSON.stringify(x.trip.must_places)}`);
      if (x.trip.days !== 7 || x.trip.nights !== 6) bad.push(`${n}: 7 days and 6 nights`);
      if (x.trip.unknown_points.length || x.trip.links_to_research.length) bad.push(`${n}: every point and link is known`);
    }
    if (!(B.trip.km < A.trip.km)) bad.push('the reverse should be shorter');
    if (!B.trip.nights_without_stay.some(n => n.town === 'Jowai') || !A.trip.stays.some(n => n.town === 'Sohra' && n.candidates.includes('Sohra Plaza'))) bad.push('nights and stays');
    return bad.join('\n');
  });
  test('build-itinerary: the Route notes\' lists say what the check found', () => {
    const a = fs.readFileSync(path.join(BREF, 'example-context/Route - Option A.md'), 'utf8'), b = fs.readFileSync(path.join(BREF, 'example-context/Route - Option B.md'), 'utf8');
    const bad = [];
    const km = x => `about ${Math.round(x.trip.km / 10) * 10} km`;
    if (!a.includes(`same ${A.trip.doubling_back.km} km between Shillong and Jowai twice`)) bad.push('A should name the 64 km driven twice');
    if (!/\*\*Day 6 does not work\.\*\*/.test(a) || !/4 pm cutoff/.test(a)) bad.push('A should flag Day 6 and the cutoff');
    if (!a.includes(`About ${Math.round(A.trip.km / 10) * 10} km`) || !b.includes(km(B))) bad.push(`total km: A ${A.trip.km}, B ${B.trip.km}`);
    if (!/No road is driven twice/.test(b) || !/no driving near Jowai after 4 pm/.test(b)) bad.push('B should say no road twice and no driving after the cutoff');
    for (const t of [a, b]) for (const h of ['## Day by day', '## What it makes possible', '## Red flags', '## What it costs']) if (!t.includes(h)) bad.push(`missing ${h}`);
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(a + b)) bad.push('the Meghalaya example must hold no dates');
    return bad.join('\n');
  });
  test('build-itinerary: candidates finds Krang Suri on the way for a Jowai to Dawki day, with no fixed reach', () => {
    const c = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Dawki');
    const ks = c.candidates.find(x => x.place === 'Krang Suri Falls');
    const short = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Dawki', '--daylight', '6');      // a shorter day reaches less far
    const trip = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Jowai', '--all');                 // a day trip from Jowai, season daylight
    const longer = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Jowai', '--daylight', '10.5');  // the real daylight of a date
    const all = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Dawki', '--all');
    const kc = all.left_out.find(x => x.place === 'Krem Chympe Falls');
    const bad = [];
    if (!(ks && ks.kind === 'on the way' && ks.adds_min <= c.limits.on_the_way_min && ks.links_to_research.join() === 'Jowai – Dawki')) bad.push(`Krang Suri: ${JSON.stringify(ks)}`);
    const ksShort = short.candidates.find(x => x.place === 'Krang Suri Falls');
    if (!(ksShort && ksShort.fit === 'tight' && ksShort.slack_hrs < short.limits.slack_ok_hrs && /big day/.test(ksShort.why_tight))) bad.push('with 6 hrs of daylight Krang Suri should be tight');
    const tiny = routeJson(bv, 'candidates', '--from', 'Jowai', '--to', 'Dawki', '--daylight', '4');
    if (tiny.candidates.some(x => x.place === 'Krang Suri Falls')) bad.push('with 4 hrs of daylight Krang Suri is too much and left out');
    if (ks?.fit !== 'ok' || c.candidates.some(x => x.fit === 'tight' && c.candidates.indexOf(x) < c.candidates.findLastIndex(y => y.fit === 'ok'))) bad.push('ok candidates come first, and Krang Suri is ok on 9.5 hrs');
    if (c.candidates.some(x => x.place === 'Krem Chympe Falls') || !kc || kc.fit !== 'too much' || !/daylight/.test(kc.why_not)) bad.push('Krem Chympe (5 hrs there) is too much for a Jowai to Dawki day');
    // 5 hrs at the falls makes a day trip from Jowai a tight candidate on the season's 9.5 hrs (Option B's Day 3), ok on a 10.5-hr day
    const kcTrip = trip.candidates.find(x => x.place === 'Krem Chympe Falls');
    if (!(kcTrip && kcTrip.kind === 'day trip' && kcTrip.fit === 'tight' && kcTrip.slack_hrs === B.days[2].slack.slack_hrs) || trip.left_out.some(x => x.place === 'Krem Chympe Falls')
      || longer.candidates.find(x => x.place === 'Krem Chympe Falls')?.fit !== 'ok') bad.push(`Krem Chympe as a day trip from Jowai: tight on 9.5 hrs, ok on 10.5: ${JSON.stringify(kcTrip)}`);
    if (B.days[2].verdict !== 'tight') bad.push('Option B Day 3 (Krem Chympe from Jowai) should be tight');
    if (/reach/.test(JSON.stringify(c.limits)) || c.limits.usable_hrs !== 8 || c.limits.drive_limit_hrs !== 6) bad.push(`limits: ${JSON.stringify(c.limits)}`);
    return bad.join('\n');
  });
  test('build-itinerary: on_the_way_min and the selected Transport note\'s limit change the candidates', () => {
    const v = makeBv('build-limits');
    fs.writeFileSync(path.join(v, 'trip.md'), rd(v, 'trip.md').replace('on_the_way_min: 20', 'on_the_way_min: 5'));
    const narrow = routeJson(v, 'candidates', '--from', 'Jowai', '--to', 'Dawki').candidates.find(x => x.place === 'Krang Suri Falls');
    fs.writeFileSync(path.join(v, 'Logistics/Transport.md'), rd(v, 'Templates/Transport.md').replace('{{title}}', 'Transport').replace('decision: considering', 'decision: selected').replace('max_hrs_per_day:', 'max_hrs_per_day: 2'));
    const c = routeJson(v, 'candidates', '--from', 'Jowai', '--to', 'Dawki');
    return narrow?.kind === 'detour' && c.limits.drive_limit_hrs === 2 && /Transport/.test(c.limits.drive_limit_from) && !c.candidates.some(x => x.place === 'Krang Suri Falls') ? '' : JSON.stringify([narrow, c.limits]);
  });
  const linkKeys = l => Object.keys(l).join();
  test('build-itinerary: links adds rough links for every pair, never overwrites a researched one, and a second run changes nothing', () => {
    const v = makeBv('build-links');
    const before = JSON.parse(rd(v, 'Logistics/legs.json')).links;
    const one = routeJson(v, 'links');
    const after = JSON.parse(rd(v, 'Logistics/legs.json'));
    const again = routeJson(v, 'links');
    const researched = after.links.filter(l => l.status === 'researched');
    const rough = after.links.filter(l => l.status === 'rough');
    // move a place: its rough links change, its researched links do not
    const f = path.join(v, 'Locations/Krang Suri Falls.md');
    fs.writeFileSync(f, rd(v, 'Locations/Krang Suri Falls.md').replace(/^location:\n {2}- .*\n {2}- .*\n/m, 'location:\n  - 25.30\n  - 92.13\n'));
    const moved = routeJson(v, 'links'), last = JSON.parse(rd(v, 'Logistics/legs.json'));
    const bad = [];
    if (JSON.stringify(researched) !== JSON.stringify(before)) bad.push('a researched link changed');
    if (!(one.added > 0 && one.researched_kept === before.length && rough.length === one.added)) bad.push(`first run: ${JSON.stringify(one)}`);
    if (again.added || again.updated) bad.push(`second run: ${JSON.stringify(again)}`);
    if (!(moved.updated > 0 && JSON.stringify(last.links.filter(l => l.status === 'researched')) === JSON.stringify(before))) bad.push(`after a move: ${JSON.stringify(moved)}`);
    const kc = rough.find(l => [l.from, l.to].includes('Krem Chympe Falls') && [l.from, l.to].includes('Krang Suri Falls'));
    if (!(kc && kc.cutoff_area === 'Jowai' && kc.road === 'hill' && kc.after_dark === 'avoid' && /straight line/.test(kc.source))) bad.push(`a rough link in the cutoff area: ${JSON.stringify(kc)}`);
    if (rough.some(l => linkKeys(l) !== 'from,to,km,drive_hrs,road,after_dark,cutoff_area,status,source,checked')) bad.push('rough link fields');
    return bad.join('\n');
  });
  test('build-itinerary: link writes a researched link and replaces a rough one; town saves a town; bad input is refused', () => {
    const v = makeBv('build-link');
    routeJson(v, 'links');
    const r = routeJson(v, 'link', '--from', 'Krem Chympe Falls', '--to', 'Krang Suri Falls', '--km', '70', '--hrs', '2-2.5', '--road', 'hill', '--after-dark', 'avoid', '--cutoff-area', 'Jowai', '--source', 'test');
    const t = routeJson(v, 'town', '--name', 'Amlarem', '--lat', '25.29', '--lng', '92.10');
    const j = JSON.parse(rd(v, 'Logistics/legs.json'));
    const l = j.links.filter(x => [x.from, x.to].includes('Krem Chympe Falls') && [x.from, x.to].includes('Krang Suri Falls'));
    const badRoad = run(ROUTE, ['link', '--from', 'A', '--to', 'B', '--km', '3', '--hrs', '1', '--road', 'goat', '--after-dark', 'ok', '--source', 'x', '--vault', v]);
    const noSource = run(ROUTE, ['link', '--from', 'A', '--to', 'B', '--km', '3', '--hrs', '1', '--road', 'hill', '--after-dark', 'ok', '--vault', v]);
    return r.replaced === 'rough' && l.length === 1 && l[0].status === 'researched' && l[0].drive_hrs.join() === '2,2.5' && t.town === 'Amlarem' && j.towns.Amlarem.join() === '25.29,92.1'
      && badRoad.code === 2 && /road must be/.test(badRoad.out) && noSource.code === 2 && /source/.test(noSource.out) && check(v).code === 0 ? '' : JSON.stringify([r, l]) + badRoad.out + noSource.out;
  });
  test('checker: legs.json that cannot be read, a bad link and a repeated road are warned about', () => {
    const v = makeBv('build-legs-bad');
    const f = path.join(v, 'Logistics/legs.json'), j = JSON.parse(rd(v, 'Logistics/legs.json'));
    j.links.push({ ...j.links[0], status: 'guessed', road: 'goat' }, { ...j.links[1], from: j.links[1].to, to: j.links[1].from });
    fs.writeFileSync(f, JSON.stringify(j));
    const a = check(v).out;
    fs.writeFileSync(f, '{ not json');
    const b = check(v).out;
    return warnLine(a, 'legs.json', 'status must be rough or researched') && warnLine(a, 'legs.json', 'road must be one of') && warnLine(a, 'legs.json', 'the same road is listed twice')
      && warnLine(b, 'legs.json', "can't be read") ? '' : a + b;
  });
  test('checker: a Route Day by day table must have nights + 1 rows and the same nights per town as bases', () => {
    const v = makeBv('build-route-bad');
    const f = path.join(v, 'Itinerary/Route - Option B.md');
    const orig = rd(v, 'Itinerary/Route - Option B.md');
    fs.writeFileSync(f, orig.replace(/^\| 6 \| 08:00, Sohra .*\n/m, ''));
    const rows = check(v).out;
    fs.writeFileSync(f, orig.replace('nights_per_base: [1, 2, 1, 1, 1]', 'nights_per_base: [2, 1, 1, 1, 1]'));
    const nights = check(v).out;
    const starter = check(portugal).out;   // its Route.md is the empty starter
    return warnLine(rows, 'Route - Option B', 'Day by day has 6 row(s), but 6 nights need 7') && warnLine(rows, 'Route - Option B', 'do not match bases and nights_per_base')
      && warnLine(nights, 'Route - Option B', 'the nights in Day by day (Pobitora 1, Jowai 2, Dawki 1, Sohra 1, Shillong 1) do not match bases and nights_per_base (Pobitora 2, Jowai 1')
      && !warnLine(starter, 'Route.md', 'Day by day') ? '' : rows + nights;
  });
  test('checker: road_cutoffs entries must have an area and a time; good ones pass', () => {
    const v = makeBv('build-cutoffs-bad');
    fs.writeFileSync(path.join(v, 'trip.md'), rd(v, 'trip.md').replace(/^road_cutoffs:.*$/m, 'road_cutoffs: [{area: Jowai, no_drive_after: 4pm}, {no_drive_after: "16:00", when: dusk}]'));
    const o = check(v).out;
    return warnLine(o, 'trip.md', 'no_drive_after must be a time like "16:00"') && warnLine(o, 'trip.md', 'needs an area') && warnLine(o, 'trip.md', '"when" is not a setting')
      && !warnLine(check(bv).out, 'trip.md', 'road_cutoffs') ? '' : o;
  });
  {
    // A Day note with a leg in the Jowai area. The Schedule's drive back is before or after the 16:00 cutoff.
    const dayNote = (v, time, bends = 0) => {
      const tpl = rd(v, 'Templates/Day Plan.md').replace('{{title}}', 'Day 03').replace('locations: []', 'locations:\n  - "[[Krem Chympe Falls]]"')
        .replace('rule_bends: 0', `rule_bends: ${bends}`)
        .replace('|      |    |    |                       |            |            |', '| Jowai | [[Krem Chympe Falls]] | ~48 | 1.25–1.5 hrs | avoid | Rough last 7 km |\n| [[Krem Chympe Falls]] | Jowai | ~48 | 1.25–1.5 hrs | avoid | |')
        .replace('|  |  |  |\n| 16:30 | Sunset |  |', `| 08:45 | **[[Krem Chympe Falls]]** | |\n| ${time} | Drive back to Jowai | |\n| 16:30 | Sunset |  |`);
      const text = bends ? tpl.replace('## Choices that bend the rules\n<!--', '## Choices that bend the rules\n- **Driving back from the falls after 4 pm.** Why: the group wants the full day. Cost: 30 min on the border road after the cutoff.\n<!--').replace(/\n- None\.\n/, '\n') : tpl;
      fs.writeFileSync(path.join(v, 'Itinerary/Day 03.md'), text);
      return check(v).out;
    };
    const v = makeBv('build-day-cutoff');
    const late = dayNote(v, '16:30'), early = dayNote(v, '14:00'), bent = dayNote(v, '16:30', 1);
    const noCut = makeBv('build-day-nocut');
    fs.writeFileSync(path.join(noCut, 'trip.md'), rd(noCut, 'trip.md').replace(/^road_cutoffs:.*$/m, 'road_cutoffs: []'));
    const none = dayNote(noCut, '16:30');
    const msg = 'the leg Krem Chympe Falls to Jowai is in the Jowai area, where nobody drives after 16:00';
    test('checker: a Day note leg in a cutoff area driven after its time warns when rule_bends is 0, and says it makes the day too much', () => warnLine(late, 'Day 03.md', msg) && warnLine(late, 'Day 03.md', 'rule_bends is 0') && warnLine(late, 'Day 03.md', 'makes the day too much, even a minute over') ? '' : late);
    test('checker: the same leg before the cutoff, or with the bend written down, or with no cutoffs in trip.md, does not warn', () =>
      [early, bent, none].some(o => warnLine(o, 'Day 03.md', 'nobody drives after')) || warnLine(bent, 'Day 03.md', 'rule_bends is 1 but') ? early + bent + none : '');
  }
  test('travel: a leg in a cutoff area after its time is too much from the first minute; an agreed bend makes it tight; leave_earlier gets out of it', () => {
    const s = loadSettings(bv);
    const leg = extra => ({ from: 'Krem Chympe Falls', to: 'Jowai', km: 48, road: 'rural', after_dark: 'ok', cutoff_area: 'Jowai', ...extra });
    const day = (start, extra = {}) => checkDay({ start, sunset: '18:00', sunrise: '06:00', daylight_hrs: 12, activity_hrs: 0, legs: [leg(extra)] }, s);
    const dayDark = start => checkDay({ start, sunset: '19:20', sunrise: '06:00', daylight_hrs: 13.3, activity_hrs: 0, legs: [leg({ cutoff_area: null, after_dark: 'avoid' })] }, s);   // 48 km rural: about 100 min on the road, the last 18 of them after sunset
    const fine = day('13:00'), oneMin = day('14:30'), much = day('15:30'), agreed = day('15:30', { bent: true, agreed_cutoff_min: 120 }), beyond = day('15:30', { bent: true, agreed_cutoff_min: 10 }), other = checkDay({ start: '15:30', sunset: '18:00', daylight_hrs: 12, activity_hrs: 0, legs: [leg({ cutoff_area: 'Elsewhere' })] }, s);
    const ok = s.road_cutoffs.length === 1 && s.road_cutoffs[0].no_drive_after === '16:00'
      && fine.day.verdict === 'ok' && fine.legs[0].after_cutoff_min === 0
      && oneMin.legs[0].after_cutoff_min > 0 && oneMin.legs[0].after_cutoff_min <= 30 && oneMin.day.verdict === 'too much' && /nobody drives after 16:00/.test(oneMin.day.reasons[0].text)
      && much.day.verdict === 'too much' && much.day.leave_earlier && agreed.day.verdict === 'tight' && /as the group agreed \(1 rule bend\)/.test(agreed.day.reasons[0].text)
      && !agreed.day.leave_earlier && beyond.day.verdict === 'too much' && other.day.verdict === 'ok'
      && dayDark('18:00').day.verdict === 'tight';   // ordinary after-dark driving keeps its 30-minute tight band
    return ok ? '' : JSON.stringify([fine.legs[0], oneMin.day, much.day, agreed.day, beyond.day]);
  });

  // The Trip itinerary and the Operator brief (Portugal, Day 04 and Day 05 of the plan-day and review-travel-times examples)
  const iv = path.join(TMP, 'build-itin');
  fs.cpSync(dayVault, iv, { recursive: true });
  fs.writeFileSync(path.join(iv, 'Itinerary/Route.md'), rd(iv, 'Itinerary/Route.md').replace('status: draft', 'status: agreed'));
  fs.copyFileSync(path.join(BREF, 'trip-itinerary-example.md'), path.join(iv, 'Itinerary/Trip itinerary.md'));
  fs.copyFileSync(path.join(BREF, 'operator-brief-example.md'), path.join(iv, 'Itinerary/Operator brief.md'));
  const mineI = out => out.split('\n').filter(l => /Trip itinerary|Operator brief|Trip Itinerary|Operator Brief/.test(l));
  test('build-itinerary: the Trip itinerary and Operator brief examples pass the checker with no warnings about them', () => {
    const r = check(iv); return r.code === 0 && !mineI(r.out).length ? '' : r.out;
  });
  test('checker: the Trip itinerary and the brief must link every Day note of the chosen route, and no dropped place', () => {
    const v = path.join(TMP, 'build-itin-bad');
    fs.cpSync(iv, v, { recursive: true });
    fs.writeFileSync(path.join(v, 'Itinerary/Day 06.md'), rd(v, 'Templates/Day Plan.md').replace('{{title}}', 'Day 06'));
    const f = path.join(v, 'Locations/Mountain Fort (Example).md');
    fs.writeFileSync(f, rd(v, 'Locations/Mountain Fort (Example).md').replace('decision: considering', 'decision: dropped').replace('decision_reason:', 'decision_reason: too far'));
    const a = check(v).out;
    fs.writeFileSync(path.join(v, 'Itinerary/Route.md'), rd(v, 'Itinerary/Route.md').replace('status: agreed', 'status: draft'));
    const b = check(v).out;   // a brief for an option not chosen yet need not link the Day notes
    return warnLine(a, 'Trip itinerary.md', 'does not link 1 Day note(s): [[Day 06]]') && warnLine(a, 'Operator brief.md', 'does not link 1 Day note(s)')
      && warnLine(a, 'Trip itinerary.md', 'links [[Mountain Fort (Example)]], which the group dropped') && !warnLine(b, 'Operator brief.md', 'does not link') ? '' : a + b;
  });
  test('checker: an Operator brief with a food spot, a booking or a confirmation is flagged', () => {
    const v = path.join(TMP, 'build-brief-bad');
    fs.cpSync(iv, v, { recursive: true });
    fs.mkdirSync(path.join(v, 'Food'), { recursive: true });
    fs.writeFileSync(path.join(v, 'Food/Harbour Grill.md'), rd(v, 'Templates/Food Spot.md').replace('{{title}}', 'Harbour Grill').replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"'));
    fs.appendFileSync(path.join(v, 'Sources/Src.md'), '[[Harbour Grill]]\n');
    fs.appendFileSync(path.join(v, 'Itinerary/Operator brief.md'), '\nLunch at [[Harbour Grill]]. Our confirmation is below.\n');
    const o = check(v).out;
    return warnLine(o, 'Operator brief.md', 'links [[Harbour Grill]]. An operator brief holds no food choices') && warnLine(o, 'Operator brief.md', 'mentions a booking reference or confirmation') ? '' : o;
  });
  test('build-itinerary: the Operator brief example holds no reasons, budget, food, names or booking references', () => {
    const t = fs.readFileSync(path.join(BREF, 'operator-brief-example.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/> \[!info\][\s\S]*?\n\n/, '');
    const bad = ['because', 'budget', '€', 'booking_ref', 'confirmation', 'vegetarian', 'restaurant', 'Why'].filter(w => t.includes(w));
    return bad.length ? `found: ${bad.join(', ')}` : '';
  });

  // trip-init: road_cutoffs and on_the_way_min
  const exA = JSON.parse(fs.readFileSync(path.join(ANSWERS, 'example-vault-answers.json'), 'utf8'));
  const reconf = (v, name, extra) => { const f = path.join(TMP, name + '.json'); fs.writeFileSync(f, JSON.stringify({ ...exA, ...extra })); return run(INIT, ['--answers', f, '--vault', v, '--reconfigure']); };
  test('trip-init: road_cutoffs are written from the answers, kept when left out, replaced or cleared when given, and bad ones are refused', () => {
    const v = path.join(TMP, 'build-init');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const cut = [{ area: 'Jowai', no_drive_after: '16:00', reason: 'single-track, border roads' }];
    const a = reconf(v, 'bi-a', { road_cutoffs: cut });
    const t1 = rd(v, 'trip.md'), read1 = loadPlanningLimits(v) && JSON.stringify(loadSettings(v).road_cutoffs);
    const b = reconf(v, 'bi-b', {});
    const t2 = rd(v, 'trip.md');
    const before = t2;
    const bad = reconf(v, 'bi-bad', { road_cutoffs: [{ area: '', no_drive_after: '4pm' }] });
    const refused = rd(v, 'trip.md') === before;
    const c = reconf(v, 'bi-c', { road_cutoffs: [] });
    const same = rd(v, 'trip.md') === rd(path.join(ROOT, 'example-vault'), 'trip.md');
    return a.code === 0 && t1.includes('road_cutoffs: [{area: Jowai, no_drive_after: "16:00", reason: "single-track, border roads"}]') && read1 === JSON.stringify(cut)
      && b.out.includes('Nothing changed') && t2 === t1 && bad.code === 1 && /needs an area/.test(bad.out) && /no_drive_after must be a time/.test(bad.out) && refused
      && c.code === 0 && same ? '' : [a.out, t1, read1, b.out, bad.out, c.out].join('\n');
  });
  test('trip-init: a new vault gets road_cutoffs, on_the_way_min, the new templates and the Itinerary base columns', () => {
    const t = rd(portugal, 'trip.md'), bad = [];
    if (!/\nroad_cutoffs: \[\]\n/.test(t) || !/on_the_way_min: 20\}/.test(t)) bad.push('trip.md');
    for (const f of ['Templates/Trip Itinerary.md', 'Templates/Operator Brief.md']) if (!fs.existsSync(path.join(portugal, f))) bad.push(f);
    if (!/^## Day by day$/m.test(rd(portugal, 'Templates/Route.md')) || !/^## Day by day$/m.test(rd(portugal, 'Itinerary/Route.md'))) bad.push('Route template and starter Route note');
    if (!/- start_time\n/.test(rd(portugal, 'Bases/Itinerary.base')) || !/backtrack_km: Sum/.test(rd(portugal, 'Bases/Itinerary.base'))) bad.push('Itinerary base');
    return bad.join(', ');
  });

  // An older vault (before 0.12.0), brought up to date by trip-init --add-itinerary and migrate-itinerary.mjs
  const old = path.join(TMP, 'pre-0.12');
  fs.cpSync(path.join(ROOT, 'example-vault'), old, { recursive: true });
  const ow = (rel, fn) => { const p = path.join(old, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  for (const f of ['Templates/Trip Itinerary.md', 'Templates/Operator Brief.md']) fs.rmSync(path.join(old, f));
  ow('Templates/Route.md', s => s.replace(/^Day by day: .*\n/m, '').replace(/## Day by day\n[\s\S]*?\n\n(?=## Why this route)/, '').replace(/## What it makes possible\n[\s\S]*?(?=## Open questions)/, ''));
  ow('Templates/Day Plan.md', s => s.replace(/^(start_time|backtrack_km):.*\n/gm, '').replace(/## Along the way\n[\s\S]*?\n\n(?=## Meals)/, '')
    .replace(/^rule_bends: how many.*$/m, 'rule_bends: how many choices are listed under "Choices that bend the rules" (0 if none)'));
  ow('Templates/Location.md', s => s.replace(/^needs_night_nearby:.*\n/gm, ''));
  ow('.obsidian/types.json', s => s.replace(/\n\s*"(needs_night_nearby|start_time|backtrack_km|route|built_on|seats)": "\w+",/g, ''));
  ow('Bases/Itinerary.base', s => s.replace(/  start_time:\n    displayName: Start\n  backtrack_km:\n    displayName: Doubles back km\n/, '').replace(/      - (start_time|backtrack_km)\n/g, '').replace('      backtrack_km: Sum\n', ''));
  ow('Bases/Locations.base', s => s.replace('  needs_night_nearby:\n    displayName: Night nearby\n', '').replace('      - needs_night_nearby\n', ''));
  ow('00 Home.md', s => s.replace(/^6\. \*\*Plan the route\.\*\*.*$/m, '6. **Plan the route.** Fix the base towns and nights in `Itinerary/Route.md`.').replace(/(It never scores them, and the group decides\.) Once the group picks[^\n]*/, '$1'));
  ow('trip.md', s => s.replace(', on_the_way_min: 20}', '}').replace('road_cutoffs: []\n', ''));
  for (const f of fs.readdirSync(path.join(old, 'Locations'))) ow(`Locations/${f}`, s => s.replace(/^needs_night_nearby:.*\n/m, ''));
  fs.mkdirSync(path.join(old, 'Itinerary'), { recursive: true });
  fs.writeFileSync(path.join(old, 'Itinerary/Day 01.md'), rd(old, 'Templates/Day Plan.md').replace('{{title}}', 'Day 01'));
  const exAnswers = path.join(ANSWERS, 'example-vault-answers.json');
  const TOOL = ['Templates/Route.md', 'Templates/Day Plan.md', 'Templates/Location.md', 'Templates/Trip Itinerary.md', 'Templates/Operator Brief.md', '.obsidian/types.json', 'Bases/Itinerary.base', 'Bases/Locations.base', '00 Home.md', 'trip.md'];
  test('build-itinerary: the made-up older vault really is old (setup check)', () => {
    const notOld = TOOL.filter(f => fs.existsSync(path.join(old, f)) && rd(old, f) === rd(path.join(ROOT, 'example-vault'), f));
    return notOld.length ? `not changed by setup: ${notOld.join(', ')}` : '';
  });
  const up = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-itinerary']);
  test('trip-init --reconfigure --add-itinerary brings an older vault to what the example has (templates, types, Bases, Home, trip.md)', () => {
    const diff = TOOL.filter(f => !fs.existsSync(path.join(old, f)) || rd(old, f) !== rd(path.join(ROOT, 'example-vault'), f));
    return up.code === 0 && !diff.length ? '' : `${up.out}\ndiffers: ${diff.join(', ')}`;
  });
  test('trip-init --add-itinerary: a second run changes nothing, and without --reconfigure it is refused', () => {
    const again = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-itinerary']);
    const no = run(INIT, ['--answers', exAnswers, '--vault', path.join(TMP, 'never-i'), '--add-itinerary']);
    return again.code === 0 && again.out.includes('Nothing changed') && no.code === 1 && /--add-itinerary only works with --reconfigure/.test(no.out) ? '' : again.out + no.out;
  });
  const MIGI = path.join(ROOT, 'skills/build-itinerary/scripts/migrate-itinerary.mjs');
  const snapI = () => JSON.stringify(['Locations', 'Itinerary'].flatMap(d => fs.readdirSync(path.join(old, d)).map(f => fs.readFileSync(path.join(old, d, f), 'utf8'))));
  const beforeI = snapI(), dryI = run(MIGI, ['--dry-run'], old);
  test('migrate-itinerary: --dry-run changes nothing', () => dryI.code === 0 && /would change/.test(dryI.out) && snapI() === beforeI ? '' : dryI.out);
  const migI = run(MIGI, [], old);
  test('migrate-itinerary: notes get the new fields in template order, and a second run changes nothing', () => {
    const bad = [];
    for (const f of fs.readdirSync(path.join(old, 'Locations'))) {
      const want = rd(path.join(ROOT, 'example-vault'), `Locations/${f}`).replace('needs_night_nearby: true', 'needs_night_nearby:');
      if (rd(old, `Locations/${f}`) !== want) bad.push(f);
    }
    const keys = t => t.match(/^---\n([\s\S]*?)\n---/)[1].match(/^[a-z_]+(?=:)/gm).join();
    if (keys(rd(old, 'Itinerary/Day 01.md')) !== keys(rd(old, 'Templates/Day Plan.md'))) bad.push('Day 01 property order');
    const again = run(MIGI, [], old), r = check(old);
    const extra = r.out.split('\n').filter(l => /missing properties|not in the same order/.test(l));
    return migI.code === 0 && !bad.length && /Nothing to do/.test(again.out) && r.code === 0 && !extra.length ? '' : migI.out + bad.slice(0, 5).join('\n') + again.out + extra.join('\n');
  });

  // the templates, the skills, the roadmap and the plan
  test('build-itinerary: the new templates, types and Bases are the same in both vaults (Location and Day Plan but their slots)', () => {
    const same = f => rd(path.join(ROOT, 'vault-template'), f) === rd(path.join(ROOT, 'example-vault'), f);
    const bad = ['Templates/Route.md', 'Templates/Trip Itinerary.md', 'Templates/Operator Brief.md', '.obsidian/types.json', 'Bases/Itinerary.base', 'Bases/Locations.base'].filter(f => !same(f));
    const mask = t => t.replace(/^(state|nearest_base|category): .*$/gm, '$1: X');
    if (mask(rd(path.join(ROOT, 'vault-template'), 'Templates/Location.md')) !== mask(rd(path.join(ROOT, 'example-vault'), 'Templates/Location.md'))) bad.push('Templates/Location.md');
    const types = JSON.parse(rd(path.join(ROOT, 'vault-template'), '.obsidian/types.json')).types;
    for (const [k, t] of [['start_time', 'text'], ['backtrack_km', 'number'], ['needs_night_nearby', 'checkbox'], ['route', 'text'], ['built_on', 'date'], ['seats', 'number']]) if (types[k] !== t) bad.push(`types.json ${k}`);
    const loc = rd(path.join(ROOT, 'vault-template'), 'Templates/Location.md'), day = rd(path.join(ROOT, 'vault-template'), 'Templates/Day Plan.md');
    if (!/^last_mile:\nneeds_night_nearby:\npermits:/m.test(loc)) bad.push('Location: needs_night_nearby after last_mile');
    if (!/^locations: \[\]\nstart_time:\nearly_start:/m.test(day) || !/^total_walk_km:\nbacktrack_km:\nrule_bends: 0/m.test(day) || !/^## Along the way$/m.test(day)) bad.push('Day Plan: start_time, backtrack_km, Along the way');
    const ex = fs.readdirSync(path.join(ROOT, 'example-vault/Locations')).filter(f => !/^needs_night_nearby:/m.test(rd(path.join(ROOT, 'example-vault'), `Locations/${f}`)));
    if (ex.length) bad.push(`example places without needs_night_nearby: ${ex.slice(0, 3).join(', ')}`);
    return bad.join('; ');
  });
  test('build-itinerary: the skill and the skills it works with describe the new pieces', () => {
    const sk = n => fs.readFileSync(path.join(ROOT, 'skills', n, 'SKILL.md'), 'utf8'), bad = [];
    const b = sk('build-itinerary');
    for (const w of ['route.mjs', 'candidates', 'tight candidate', 'never a silent pick', 'even a minute over', 'links', 'check --route', 'legs.json', 'compare-itineraries', 'plan-day', 'Trip itinerary', 'Operator brief', 'not in your list yet', 'Decisions/', 'status: locked', 'never', 'reverse', 'big day', 'What it makes possible', 'Red flags', 'What it costs', 'migrate-itinerary.mjs', '--add-itinerary', 'researched', 'rough'])
      if (!b.includes(w)) bad.push(`build-itinerary: ${w}`);
    for (const n of ['plan-day', 'review-travel-times']) for (const w of ['road_cutoffs', 'legs.json']) if (!sk(n).includes(w)) bad.push(`${n}: ${w}`);
    for (const w of ['start_time', 'backtrack_km', 'Along the way', 'on_the_way_min']) if (!sk('plan-day').includes(w)) bad.push(`plan-day: ${w}`);
    if (!/needs_night_nearby/.test(sk('add-place'))) bad.push('add-place: needs_night_nearby');
    if (!/--add-itinerary/.test(sk('trip-init')) || !/road_cutoffs/.test(sk('trip-init'))) bad.push('trip-init');
    if (!/Day by day/.test(sk('compare-itineraries'))) bad.push('compare-itineraries: Day by day');
    const ref = fs.readFileSync(path.join(ROOT, 'skills/plan-day/references/day-example.md'), 'utf8');
    if (!/^start_time: "05:00"$/m.test(ref) || !/^## Along the way$/m.test(ref)) bad.push('plan-day example');
    return bad.join('; ');
  });
  test('build-itinerary: the roadmap marks it done; the plan says built', () => {
    const bad = [];
    if (!/\[x\] \(v0\.12\.0\) \*\*`build-itinerary`\*\*/.test(rd(ROOT, 'docs/ROADMAP.md'))) bad.push('roadmap not marked done');
    if (!/^Status: built \(v0\.12\.0\)/m.test(rd(ROOT, 'docs/PLAN-build-itinerary.md'))) bad.push('plan status line');
    return bad.join('; ');
  });
}

test('plugin: both manifests have the same version, and it is 0.13.0', () => {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8')).version;
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).plugins[0].version;
  return a === b && a === '0.13.0' ? '' : `plugin.json ${a}, marketplace.json ${b}`;
});
// ---- Food spots (restaurants and cafes): the template, the Base, the folder, the example notes and the old-vault upgrade
{
  const rd = (v, f) => fs.readFileSync(path.join(ROOT, v, f), 'utf8');
  test('food: Food.base, the Food Spot template (but its price band), types.json and the Source template agree between the vaults', () => {
    const bad = [];
    if (rd('vault-template', 'Bases/Food.base') !== rd('example-vault', 'Bases/Food.base')) bad.push('Bases/Food.base differs');
    if (rd('vault-template', '.obsidian/types.json') !== rd('example-vault', '.obsidian/types.json')) bad.push('types.json differs');
    if (rd('vault-template', 'Templates/Source Itinerary.md') !== rd('example-vault', 'Templates/Source Itinerary.md')) bad.push('Source Itinerary.md differs');
    const band = s => s.replace(/^price_band: .*\|.*$/m, 'price_band: X');
    if (band(rd('vault-template', 'Templates/Food Spot.md')) !== band(rd('example-vault', 'Templates/Food Spot.md'))) bad.push('Food Spot.md differs by more than the price band');
    if (!fs.existsSync(path.join(ROOT, 'vault-template/Food/.gitkeep'))) bad.push('vault-template has no Food/ folder');
    if (!fs.existsSync(path.join(ROOT, 'example-vault/Food'))) bad.push('example-vault has no Food/ folder');
    return bad.join('\n');
  });
  test('food: the template has kind, meal and scheduled_day, with closed lists and the right property types', () => {
    const tpl = rd('vault-template', 'Templates/Food Spot.md'), types = JSON.parse(rd('vault-template', '.obsidian/types.json')).types;
    const bad = [];
    for (const k of ['kind', 'meal', 'scheduled_day', 'nearest_base', 'priority']) if (!new RegExp(`^${k}:`, 'm').test(tpl)) bad.push(`no ${k} property`);
    for (const g of ['kind: restaurant | cafe | street food | bakery | bar', 'meal: breakfast | lunch | dinner | snack', 'FIELD GUIDE']) if (!tpl.includes(g)) bad.push(`FIELD GUIDE lacks "${g}"`);
    if (types.meal !== 'multitext' || types.kind !== 'text') bad.push('types.json: meal must be multitext and kind text');
    return bad.join('\n');
  });
  test('food: the Food base filters on type food, every column is a Food Spot property, and its views exist', () => {
    const base = rd('vault-template', 'Bases/Food.base'), tpl = rd('vault-template', 'Templates/Food Spot.md');
    const props = new Set((tpl.match(/^---\n([\s\S]*?)\n---/)[1].match(/^[A-Za-z_]+(?=:)/gm)) || []);
    const bad = [];
    if (!base.includes('type == "food"')) bad.push('no type == "food" filter');
    const views = [...base.matchAll(/^ {2}- type: (\w+)\n {4}name: (.+)$/gm)].map(m => `${m[1]}:${m[2]}`);
    for (const v of ['table:To decide', 'table:Selected', 'table:Selected but unscheduled', 'table:By base town', 'cards:Cards', 'map:Map']) if (!views.includes(v)) bad.push(`no view ${v}`);
    const formulas = new Set([...base.matchAll(/^ {2}(\w+): /gm)].map(m => 'formula.' + m[1]));
    const cols = [...base.matchAll(/^ {6}- ([\w.]+)$/gm)].map(m => m[1]).filter(c => !c.startsWith('file.'));
    for (const c of new Set(cols)) if (!props.has(c) && !formulas.has(c)) bad.push(`column ${c} is not a Food Spot property`);
    if (!/coordinates: note\.location/.test(base)) bad.push('the map view does not use location');
    return bad.join('\n');
  });
  test('food: 00 Home.md embeds a view that exists in Food.base, and the how-it-works steps mention Food/', () => {
    const base = rd('vault-template', 'Bases/Food.base'), bad = [];
    for (const v of ['vault-template', 'example-vault']) {
      const home = rd(v, '00 Home.md'), embeds = [...home.matchAll(/!\[\[Food\.base#([^\]]+)\]\]/g)].map(m => m[1]);
      if (!embeds.length) bad.push(`${v}: no Food.base embed on Home`);
      for (const e of embeds) if (!base.includes(`name: ${e}\n`)) bad.push(`${v}: Home embeds Food.base view "${e}", which does not exist`);
      if (!/`Food\/`/.test(home)) bad.push(`${v}: the how-it-works steps do not mention Food/`);
    }
    return bad.join('\n');
  });
  test('food: the example vault has Food notes, each pointing to the public research note only, in the right folder', () => {
    const dir = path.join(ROOT, 'example-vault/Food'), files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    const bad = files.filter(f => {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      return !s.includes('type: food') || !s.includes('"[[Example - Public research]]"') || (s.match(/^recommended_by:\n((?:  - .*\n)+)/m)?.[1].trim().split('\n').length !== 1)
        || !fs.readFileSync(path.join(ROOT, 'example-vault/Sources/Example - Public research.md'), 'utf8').includes(`[[${f.replace(/\.md$/, '')}]]`);
    });
    return files.length >= 2 && !bad.length ? '' : `${files.length} Food note(s); problems in: ${bad.join(', ')}`;
  });

  // The checker on Food notes
  const fv = path.join(TMP, 'food-notes');
  fs.cpSync(path.join(ROOT, 'example-vault'), fv, { recursive: true });
  const foodTpl = fs.readFileSync(path.join(fv, 'Templates/Food Spot.md'), 'utf8');
  const mk = (name, fn = s => s) => fs.writeFileSync(path.join(fv, 'Food', name + '.md'), fn(foodTpl.replace('{{title}}', name)
    .replace('recommended_by: []', 'recommended_by:\n  - "[[Example - Public research]]"').replace('location: []', 'location: [25.5, 91.9]')));
  const srcFile = path.join(fv, 'Sources/Example - Public research.md');
  fs.writeFileSync(srcFile, fs.readFileSync(srcFile, 'utf8').replace('## Notes / opinions', '- [x] [[Good Cafe]]\n- [x] [[Odd Cafe]]\n- [x] [[Far Cafe]]\n\n## Notes / opinions'));
  mk('Good Cafe', s => s.replace('kind:', 'kind: cafe').replace('meal: []', 'meal: [breakfast, snack]').replace('veg_options:', 'veg_options: good')
    .replace('decision: considering', 'decision: selected'));
  mk('Odd Cafe', s => s.replace('kind:', 'kind: diner').replace('meal: []', 'meal: [brunch]').replace('veg_options:', 'veg_options: lots'));
  mk('Far Cafe', s => s.replace('location: [25.5, 91.9]', 'location: [48.8584, 2.2945]'));
  const fr = check(fv), lines = fr.out.split('\n');
  test('checker: a well-filled Food note passes', () => lines.some(l => l.includes('Good Cafe')) ? fr.out : '');
  test('checker: kind, meal and veg_options outside the closed lists are warned about', () => {
    const w = x => lines.some(l => l.includes('Food/Odd Cafe.md') && l.includes(x));
    return w('kind "diner" is not one of') && w('meal "brunch" is not one of') && w('veg_options "lots" is not one of') ? '' : fr.out;
  });
  test('checker: a Food note outside map_box is an error', () => lines.some(l => l.includes('Food/Far Cafe.md') && l.includes('outside the trip map_box')) ? '' : fr.out);
  test('checker: a Food note with no source is an error, and one filed outside Food/ is flagged', () => {
    mk('No Source', s => s.replace(/recommended_by:\n  - .*\n/, 'recommended_by: []\n'));
    fs.writeFileSync(path.join(fv, 'Locations/Misfiled Cafe.md'), foodTpl.replace('{{title}}', 'Misfiled Cafe'));
    const r = check(fv).out.split('\n');
    return r.some(l => l.includes('Food/No Source.md') && l.includes('recommended_by is empty')) && r.some(l => l.includes('Locations/Misfiled Cafe.md') && l.includes('must live in Food/')) ? '' : r.join('\n');
  });

  // A new vault gets the category with no extra step
  test('food: a new vault from trip-init has the Food/ folder, Food.base and the Food Spot template, and passes the checker', () => {
    const missing = ['Food', 'Bases/Food.base', 'Templates/Food Spot.md'].filter(f => !fs.existsSync(path.join(portugal, f)));
    return missing.length ? `not created: ${missing.join(', ')}` : '';
  });

  // An older vault (before 0.9.0): the Food Spot template had no kind or meal, and there was no Food folder or base
  const oldFood = path.join(TMP, 'pre-0.9');
  fs.cpSync(path.join(ROOT, 'example-vault'), oldFood, { recursive: true });
  const ow = (rel, fn) => { const p = path.join(oldFood, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  fs.rmSync(path.join(oldFood, 'Food'), { recursive: true }); fs.rmSync(path.join(oldFood, 'Bases/Food.base'));
  ow('Sources/Example - Public research.md', s => s.replace(/## Restaurants and cafes mentioned\n(- .*\n)+\n/, ''));
  ow('Templates/Food Spot.md', () => '---\ntype: food\nstate:\nnearest_base:\nlocation: []\nmaps_link:\ncuisine:\nveg_options:\nprice_band:\ngoogle_rating:\nopening_hours:\ndecision: considering\ndecision_reason:\nrecommended_by: []\ncover:\ntags:\n  - food\n---\n<!--\nveg_options: good | limited | none\nprice_band: ₹ | ₹₹ | ₹₹₹\ndecision: considering | selected | backup | dropped\n-->\n\n# {{title}}\n');
  ow('Templates/Source Itinerary.md', s => s.replace(/\n## Restaurants and cafes mentioned\n- \[ \] \[\[ \]\]\n/, ''));
  ow('.obsidian/types.json', s => s.replace(/\s*"(kind|meal)": "(text|multitext)",/g, ''));
  ow('00 Home.md', s => s.replace('## Food to decide\n![[Food.base#To decide]]\n\n', ''));
  const exAnswersFile = path.join(ANSWERS, 'example-vault-answers.json');
  test('trip-init --reconfigure alone does not add the Food category to an older vault', () => {
    const r = run(INIT, ['--answers', exAnswersFile, '--vault', oldFood, '--reconfigure']);
    return r.code === 0 && r.out.includes('Nothing changed') && !fs.existsSync(path.join(oldFood, 'Food')) ? '' : r.out;
  });
  const up = run(INIT, ['--answers', exAnswersFile, '--vault', oldFood, '--reconfigure', '--add-food']);
  test('trip-init --reconfigure --add-food brings an older vault to what the example has (folder, Base, templates, types, Home)', () => {
    const same = ['Bases/Food.base', 'Templates/Food Spot.md', 'Templates/Source Itinerary.md', '.obsidian/types.json', '00 Home.md'];
    const diff = same.filter(f => fs.readFileSync(path.join(oldFood, f), 'utf8') !== rd('example-vault', f));
    return up.code === 0 && fs.existsSync(path.join(oldFood, 'Food')) && !diff.length ? '' : `${up.out}\ndiffers: ${diff.join(', ')}`;
  });
  test('trip-init --add-food: a second run changes nothing, and the result is accepted by the checker', () => {
    const again = run(INIT, ['--answers', exAnswersFile, '--vault', oldFood, '--reconfigure', '--add-food']);
    const r = check(oldFood);
    return again.code === 0 && again.out.includes('Nothing changed') && r.code === 0 ? '' : again.out + r.out;
  });
  test('trip-init: --add-food without --reconfigure is refused', () => {
    const r = run(INIT, ['--answers', exAnswersFile, '--vault', path.join(TMP, 'never'), '--add-food']);
    return r.code === 1 && /--add-food only works with --reconfigure/.test(r.out) ? '' : r.out;
  });
}
// ---- the booking list (v0.11.0): templates, the base, the example, the checker, trip-init --add-bookings and the migration
{
  const rd = (v, f) => fs.readFileSync(path.join(ROOT, v, f), 'utf8');
  const BF = ['booking_status', 'cost_agreed', 'advance_paid', 'balance_pending', 'payment_due', 'cancel_by', 'confirmation'];
  const split = t => t.replace(/cost_agreed \/ [\d.]+/, 'cost_agreed / N').replace(/(formula\.cost_per_split:\n\s*displayName: ).*/, '$1X');
  test('bookings: the Booking and Transport templates, the Bookings base (but its split), the types and the folders agree between the vaults', () => {
    const bad = [];
    for (const f of ['Templates/Booking.md', 'Templates/Transport.md', '.obsidian/types.json']) if (rd('vault-template', f) !== rd('example-vault', f)) bad.push(`${f} differs`);
    if (split(rd('vault-template', 'Bases/Bookings.base')) !== split(rd('example-vault', 'Bases/Bookings.base'))) bad.push('Bases/Bookings.base differs by more than the split (S14, S15)');
    if (!/cost_agreed \/ 4,/.test(rd('example-vault', 'Bases/Bookings.base')) || !/displayName: Per family ₹/.test(rd('example-vault', 'Bases/Bookings.base'))) bad.push('the example base does not split per family');
    for (const d of ['Bookings', 'Confirmations']) if (!fs.existsSync(path.join(ROOT, 'vault-template', d, '.gitkeep')) || !fs.existsSync(path.join(ROOT, 'example-vault', d))) bad.push(`no ${d}/ folder`);
    return bad.join('\n');
  });
  test('bookings: the templates carry the booking fields, Transport has decision, Location has needs_booking, with the right types', () => {
    const fm = t => t.match(/^---\n([\s\S]*?)\n---/)[1];
    const bad = [], types = JSON.parse(rd('vault-template', '.obsidian/types.json')).types;
    const booking = rd('vault-template', 'Templates/Booking.md');
    if (fm(booking) !== 'type: booking\n' + 'booking_status: not-contacted\ncost_agreed:\nadvance_paid:\nbalance_pending:\npayment_due:\ncancel_by:\nconfirmation:\ntags:\n  - booking') bad.push('Booking template frontmatter');
    for (const t of ['Stay', 'Transport']) for (const k of BF) if (!new RegExp(`^${k}:`, 'm').test(fm(rd('vault-template', `Templates/${t}.md`)))) bad.push(`${t} has no ${k}`);
    if (!/^booking_ref:$/m.test(fm(rd('vault-template', 'Templates/Stay.md')))) bad.push('Stay lost booking_ref');
    if (!/^decision: considering\ndecision_reason:$/m.test(fm(rd('vault-template', 'Templates/Transport.md')))) bad.push('Transport has no decision');
    const loc = rd('vault-template', 'Templates/Location.md');
    if (!/^permits:\nneeds_booking: false\n/m.test(fm(loc) + '\n') || BF.some(k => new RegExp(`^${k}:`, 'm').test(fm(loc)))) bad.push('Location: needs_booking after permits, and no booking fields in the frontmatter');
    if (!loc.includes('booking_status: not-contacted | enquired | quoted | booked | paid | cancelled')) bad.push('Location FIELD GUIDE has no booking_status list');
    for (const [k, ty] of [['needs_booking', 'checkbox'], ['cost_agreed', 'number'], ['balance_pending', 'number'], ['advance_paid', 'number'], ['confirmation', 'text'], ['payment_due', 'date'], ['cancel_by', 'date']]) if (types[k] !== ty) bad.push(`types.json: ${k} should be ${ty}`);
    if (/not-needed/.test(booking)) bad.push('a new booking value');
    return bad.join('\n');
  });
  test('bookings: the base lists the selected stays, vehicle and places that need booking plus Bookings notes, and its views and columns exist', () => {
    const base = rd('vault-template', 'Bases/Bookings.base'), bad = [];
    for (const f of ['type == "booking"', 'type == "stay"', 'type == "transport"', 'type == "location"', 'needs_booking == true']) if (!base.includes(f)) bad.push(`no filter ${f}`);
    if ((base.match(/decision == "selected"/g) || []).length !== 3) bad.push('stay, transport and location must each need decision == "selected"');
    const views = [...base.matchAll(/^ {2}- type: table\n {4}name: (.+)$/gm)].map(m => m[1]);
    for (const v of ['To book', 'No confirmation yet', 'Balance pending', 'By date', 'All bookings']) if (!views.includes(v)) bad.push(`no view ${v}`);
    const cols = [...base.matchAll(/^ {6}- ([\w.]+)$/gm)].map(m => m[1]).filter(c => !c.startsWith('file.'));
    for (const c of new Set(cols)) if (![...BF, 'type', 'formula.cost_per_split'].includes(c)) bad.push(`column ${c}`);
    for (const v of ['vault-template', 'example-vault']) {
      const home = rd(v, '00 Home.md');
      for (const e of [...home.matchAll(/!\[\[Bookings\.base#([^\]]+)\]\]/g)].map(m => m[1])) if (!views.includes(e)) bad.push(`${v}: Home embeds a missing view ${e}`);
      for (const w of ['## Bookings', '![[Bookings.base#To book]]', '![[Bookings.base#By date]]', '![[Bookings.base#No confirmation yet]]', '![[Stays.base#Booking tracker]]', '- **Paid so far / still owed:**', '`Confirmations/`']) if (!home.includes(w)) bad.push(`${v}: Home lacks ${w}`);
      if (!/booking: Bookings[,}]/.test(rd(v, 'trip.md'))) bad.push(`${v}: trip.md folders line`);
    }
    if (!/## Bookings live on the item's own note/.test(rd('vault-template', '.claude/CLAUDE.md'))) bad.push('vault CLAUDE.md rule');
    return bad.join('\n');
  });
  test('bookings: the example has a Bookings note and a place that needs booking, and no confirmations, references, amounts or dates', () => {
    const bad = [], dirs = ['Stays', 'Locations', 'Bookings'];
    const notes = dirs.flatMap(d => fs.readdirSync(path.join(ROOT, 'example-vault', d)).filter(f => f.endsWith('.md')).map(f => `${d}/${f}`));
    for (const n of notes) {
      const front = rd('example-vault', n).match(/^---\n([\s\S]*?)\n---/)[1];
      for (const k of ['booking_ref', 'cost_agreed', 'advance_paid', 'balance_pending', 'confirmation', 'nights_booked']) if (new RegExp(`^${k}: *\\S`, 'm').test(front)) bad.push(`${n}: ${k} is filled`);
      if (/^booking_status: (?!not-contacted\s*$)/m.test(front)) bad.push(`${n}: booking_status is not not-contacted`);
    }
    const tasks = fs.readdirSync(path.join(ROOT, 'example-vault/Bookings')).filter(f => f.endsWith('.md'));
    if (!tasks.length) bad.push('no Bookings note');
    if (tasks.some(f => /\b\d{4}-\d{2}-\d{2}\b/.test(rd('example-vault', `Bookings/${f}`)))) bad.push('a date in a Bookings note');
    if (fs.readdirSync(path.join(ROOT, 'example-vault/Confirmations')).some(f => f !== '.gitkeep')) bad.push('files in Confirmations/');
    if (!/^needs_booking: true\nbooking_status: not-contacted\ncost_agreed:\nadvance_paid:\nbalance_pending:\npayment_due:\ncancel_by:\nconfirmation:\n/m.test(rd('example-vault', 'Locations/Kaziranga National Park.md'))) bad.push('Kaziranga has no booking block');
    const r = check(path.join(ROOT, 'example-vault'));
    if (r.out.split('\n').some(l => /Bookings\/|Kaziranga|Stays\//.test(l))) bad.push(r.out);
    return bad.join('\n');
  });

  // The checker on bookings: changed copies of the example
  const SOHRA = 'Stays/Sohra Plaza.md', SDEC = 'Decisions/Decision - Stay in Sohra.md', TASK = 'Bookings/Book - Travel to and from the trip.md';
  const KAZ = 'Locations/Kaziranga National Park.md', ARWAH = 'Locations/Arwah Cave.md';
  const bvariant = (tag, edits) => {
    const v = path.join(TMP, 'book-' + tag);
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    for (const [file, from, to] of edits) {
      const p = path.join(v, file);
      if (from === null) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, to); continue; }
      const t = fs.readFileSync(p, 'utf8');
      if (!t.includes(from)) throw new Error(`test setup: "${from}" not in ${file}`);
      fs.writeFileSync(p, t.replace(from, to));
    }
    return check(v);
  };
  const selectSohra = [SOHRA, 'decision: considering', 'decision: selected'];
  const bookSohra = [SOHRA, 'booking_status: not-contacted', 'booking_status: booked'];
  const lockSohra = [[SDEC, 'status: open', 'status: locked'], [SDEC, 'decided_option:', 'decided_option: "[[Sohra Plaza]]"'],
    [SDEC, 'decision_reason:', 'decision_reason: the group chose it'], [SDEC, 'locked_by:', 'locked_by: "[[Sohra Plaza]]"']];
  const voucher = [[SOHRA, 'confirmation:', 'confirmation: "[[Confirmations/sohra-voucher.pdf]]"'], ['Confirmations/sohra-voucher.pdf', null, 'made up']];
  const mineB = (out, file) => out.split('\n').filter(l => l.includes(file));
  test('bookings: a booked stay with no confirmation warns "booked, no confirmation yet", and its open decision "not locked"', () => {
    const r = bvariant('noconf', [selectSohra, bookSohra]);
    return r.code === 0 && warnLine(r.out, SOHRA, 'booked, no confirmation yet') && warnLine(r.out, SOHRA, 'is not locked') ? '' : r.out;
  });
  test('bookings: booked, confirmed and locked by a link to the stay is clean', () => {
    const r = bvariant('clean', [selectSohra, bookSohra, ...voucher, ...lockSohra,
      [SOHRA, 'cost_agreed:', 'cost_agreed: 100'], [SOHRA, 'advance_paid:', 'advance_paid: 40'], [SOHRA, 'balance_pending:', 'balance_pending: 60']]);
    return r.code === 0 && !mineB(r.out, 'Sohra').length ? '' : r.out;
  });
  test('bookings: paid with a balance still pending, and amounts that do not add up, are warned about', () => {
    const r = bvariant('amounts', [selectSohra, [SOHRA, 'booking_status: not-contacted', 'booking_status: paid'], ...voucher, ...lockSohra,
      [SOHRA, 'cost_agreed:', 'cost_agreed: 100'], [SOHRA, 'advance_paid:', 'advance_paid: 40'], [SOHRA, 'balance_pending:', 'balance_pending: 50']]);
    return warnLine(r.out, SOHRA, 'paid, but balance_pending is 50') && warnLine(r.out, SOHRA, 'is not cost_agreed (100)') ? '' : r.out;
  });
  test('bookings: a booking on a stay the group no longer has selected is flagged', () => {
    const r = bvariant('notsel', [bookSohra, ...voucher]);
    return warnLine(r.out, SOHRA, 'booked, but the group has it as "considering", not selected') ? '' : r.out;
  });
  test('bookings: locked_by linking a note that is not booked is flagged, and a text locked_by still passes', () => {
    const r = bvariant('lockedby', [selectSohra, ...lockSohra]);
    return warnLine(r.out, SDEC, 'locked_by links to [[Sohra Plaza]], but that is not booked or paid')
      && !mineB(r.out, 'Decision - How we get around').length ? '' : r.out;
  });
  test('bookings: a confirmation outside Confirmations/ is flagged', () => {
    const r = bvariant('confdir', [selectSohra, bookSohra, ...lockSohra, [SOHRA, 'confirmation:', 'confirmation: "[[Example - Public research]]"']]);
    return warnLine(r.out, SOHRA, 'is not in Confirmations/') && !warnLine(r.out, SOHRA, 'no confirmation yet') ? '' : r.out;
  });
  test('bookings: a booked Bookings note in a decision\'s affects locks that decision; until then it is flagged', () => {
    const DAWKI = 'Decisions/Decision - Dawki boat ride.md';
    const edits = [[TASK, 'booking_status: not-contacted', 'booking_status: booked'], [TASK, 'confirmation:', 'confirmation: "[[Confirmations/tickets.pdf]]"'],
      ['Confirmations/tickets.pdf', null, 'made up'], [DAWKI, 'affects:\n', 'affects:\n  - "[[Book - Travel to and from the trip]]"\n']];
    const r = bvariant('task', edits);
    return warnLine(r.out, TASK, 'booked, but its decision [[Decision - Dawki boat ride]] is not locked') && !warnLine(r.out, TASK, 'not selected') ? '' : r.out;
  });
  test('bookings: a place\'s booking fields must match needs_booking, and a bad booking_status is a warning', () => {
    const r = bvariant('place', [[KAZ, 'needs_booking: true', 'needs_booking: false'], [ARWAH, 'needs_booking: false', 'needs_booking: true'],
      [TASK, 'booking_status: not-contacted', 'booking_status: not-needed']]);
    return warnLine(r.out, KAZ, 'has booking fields (booking_status, cost_agreed, advance_paid, balance_pending, payment_due, cancel_by, confirmation) but needs_booking is not true')
      && warnLine(r.out, ARWAH, 'needs_booking is true but the booking fields are missing') && warnLine(r.out, TASK, 'booking_status "not-needed" is not one of')
      && !warnLine(r.out, KAZ, 'properties that are not in') ? '' : r.out;
  });
  test('bookings: a Bookings note outside Bookings/ is an error, and folders: {booking: Logistics} in trip.md moves it', () => {
    const v = path.join(TMP, 'book-folder');
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    fs.mkdirSync(path.join(v, 'Logistics'));
    fs.renameSync(path.join(v, TASK), path.join(v, 'Logistics', path.basename(TASK)));
    const a = check(v);
    fs.writeFileSync(path.join(v, 'trip.md'), fs.readFileSync(path.join(v, 'trip.md'), 'utf8').replace('field_packs: []', 'field_packs: []\nfolders: {booking: Logistics}'));
    const b = check(v);
    return a.code === 1 && warnLine(a.out, 'Logistics/Book - Travel', 'must live in Bookings/') && b.code === 0 ? '' : a.out + b.out;
  });
  test('bookings: the daily drive limit comes from the selected Transport note', () => {
    const tpl = rd('example-vault', 'Templates/Transport.md'), day = rd('example-vault', 'Templates/Day Plan.md');
    const r = bvariant('transport', [
      ['Logistics/Transport - Van.md', null, tpl.replace('{{title}}', 'Transport - Van').replace('decision: considering', 'decision: selected').replace('max_hrs_per_day:', 'max_hrs_per_day: 4')],
      ['Logistics/Transport - Bus.md', null, tpl.replace('{{title}}', 'Transport - Bus').replace('max_hrs_per_day:', 'max_hrs_per_day: 10')],
      ['Itinerary/Day 01.md', null, day.replace('{{title}}', 'Day 01').replace('drive_hrs:', 'drive_hrs: 6')]]);
    return warnLine(r.out, 'Itinerary/Day 01.md', 'over the daily limit of 4 hours') ? '' : r.out;
  });

  // trip-init: a new vault, and an older vault brought up to date
  test('bookings: a new vault from trip-init has the folders, the base (split per its answers), the templates, and passes', () => {
    const missing = ['Bookings', 'Confirmations', 'Bases/Bookings.base', 'Templates/Booking.md'].filter(f => !fs.existsSync(path.join(portugal, f)));
    const units = JSON.parse(fs.readFileSync(path.join(ANSWERS, 'portugal-answers.json'), 'utf8')).cost_split_units;
    const base = fs.readFileSync(path.join(portugal, 'Bases/Bookings.base'), 'utf8');
    const t = fs.readFileSync(path.join(portugal, 'Logistics/Transport.md'), 'utf8');
    return !missing.length && base.includes(`cost_agreed / ${units},`) && /^decision: considering$/m.test(t) ? '' : `missing: ${missing.join(', ')}\n${base}`;
  });
  const old = path.join(TMP, 'pre-0.11');
  fs.cpSync(path.join(ROOT, 'example-vault'), old, { recursive: true });
  const ow = (rel, fn) => { const p = path.join(old, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  const front = fn => s => { const m = s.match(/^---\n[\s\S]*?\n---/)[0]; return fn(m) + s.slice(m.length); };
  const drop = (...ks) => front(m => ks.reduce((t, k) => t.replace(new RegExp(`^${k}:.*\\n`, 'm'), ''), m));
  for (const f of ['Bases/Bookings.base', 'Templates/Booking.md']) fs.rmSync(path.join(old, f));
  for (const d of ['Bookings', 'Confirmations']) fs.rmSync(path.join(old, d), { recursive: true });
  ow('Templates/Stay.md', s => drop('confirmation', 'cost_agreed', 'balance_pending', 'payment_due', 'cancel_by')(s)
    .replace('price_per_night / extra_bed / cost_agreed / advance_paid / balance_pending:', 'price_per_night / extra_bed / advance_paid:').replace(/^(cost_agreed: the total|confirmation: a link|payment_due: the date|cancel_by: the last).*\n/gm, ''));
  ow('Templates/Location.md', s => drop('needs_booking')(s).replace(/^(needs_booking|booking_status): .*\n/gm, ''));
  ow('Templates/Transport.md', s => drop('decision', 'decision_reason', 'cost_agreed', 'advance_paid', 'balance_pending', 'payment_due', 'cancel_by', 'confirmation')(s).replace(/^(decision|cost_agreed \/|payment_due|cancel_by|confirmation): .*\n/gm, ''));
  ow('.obsidian/types.json', s => s.replace(/,\n\s*"needs_booking"[\s\S]*?"cancel_by": "date"/, ''));
  ow('00 Home.md', s => s.replace(/^## Bookings\n[\s\S]*?(?=\n## )/m, '## Stays to book\n![[Stays.base#Booking tracker]]\n')
    .replace(/^8\. \*\*Book\.\*\*.*$/m, "8. **Book.** Move each selected stay's `booking_status` from enquired → quoted → booked → paid.").replace('- **Paid so far / still owed:** \n', ''));
  fs.mkdirSync(path.join(old, '.claude'));
  fs.writeFileSync(path.join(old, '.claude/CLAUDE.md'), rd('vault-template', '.claude/CLAUDE.md').replace(/\n## Bookings live on[\s\S]*$/, ''));
  ow(KAZ, s => s.replace('needs_booking: true\nbooking_status: not-contacted\ncost_agreed:\nadvance_paid:\nbalance_pending:\npayment_due:\ncancel_by:\nconfirmation:\n', ''));
  for (const d of ['Stays', 'Locations']) for (const f of fs.readdirSync(path.join(old, d))) ow(`${d}/${f}`, drop('needs_booking', 'confirmation', 'cost_agreed', 'balance_pending', 'payment_due', 'cancel_by'));
  fs.mkdirSync(path.join(old, 'Logistics'));
  fs.writeFileSync(path.join(old, 'Logistics/Transport.md'), '---\ntype: transport\nvehicle: hired van\ndriver:\ncontact_phone:\nquote:\nbooking_status: booked\nmax_km_per_day:\nmax_hrs_per_day:\ntags:\n  - transport\n---\n<!--\nFIELD GUIDE\n-->\n\n# Transport\n');
  const exAnswers = path.join(ANSWERS, 'example-vault-answers.json');
  const TOOL = ['Bases/Bookings.base', 'Templates/Booking.md', 'Templates/Stay.md', 'Templates/Location.md', 'Templates/Transport.md', '.obsidian/types.json', '00 Home.md'];
  test('bookings: the made-up older vault really is old (setup check), and --reconfigure alone adds nothing', () => {
    const notOld = ['Templates/Stay.md', 'Templates/Location.md', 'Templates/Transport.md', '.obsidian/types.json', '00 Home.md'].filter(f => fs.readFileSync(path.join(old, f), 'utf8') === rd('example-vault', f));
    const r = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure']);
    return !notOld.length && r.code === 0 && r.out.includes('Nothing changed') && !fs.existsSync(path.join(old, 'Bases/Bookings.base')) ? '' : `not changed by setup: ${notOld.join(', ')}\n${r.out}`;
  });
  const up = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-bookings']);
  test('trip-init --reconfigure --add-bookings brings an older vault to what the example has (folders, base, templates, types, Home, vault rules)', () => {
    const diff = TOOL.filter(f => fs.readFileSync(path.join(old, f), 'utf8') !== rd('example-vault', f));
    if (fs.readFileSync(path.join(old, '.claude/CLAUDE.md'), 'utf8') !== rd('vault-template', '.claude/CLAUDE.md')) diff.push('.claude/CLAUDE.md');
    const dirs = ['Bookings', 'Confirmations'].filter(d => !fs.existsSync(path.join(old, d)));
    return up.code === 0 && !diff.length && !dirs.length ? '' : `${up.out}\ndiffers: ${diff.join(', ')} missing: ${dirs.join(', ')}`;
  });
  test('trip-init --add-bookings: a second run changes nothing, and without --reconfigure it is refused', () => {
    const again = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-bookings']);
    const no = run(INIT, ['--answers', exAnswers, '--vault', path.join(TMP, 'never-b'), '--add-bookings']);
    return again.code === 0 && again.out.includes('Nothing changed') && no.code === 1 && /--add-bookings only works with --reconfigure/.test(no.out) ? '' : again.out + no.out;
  });
  const MIG = path.join(ROOT, 'skills/group-decisions/scripts/migrate-bookings.mjs');
  const snap = () => { const o = {}; for (const d of ['Stays', 'Locations', 'Logistics']) for (const f of fs.readdirSync(path.join(old, d))) o[`${d}/${f}`] = fs.readFileSync(path.join(old, d, f), 'utf8'); return o; };
  const before = JSON.stringify(snap());
  const dry = run(MIG, ['--dry-run'], old);
  test('migrate-bookings: --dry-run changes nothing', () => dry.code === 0 && /would change/.test(dry.out) && JSON.stringify(snap()) === before ? '' : dry.out);
  const mig = run(MIG, [], old);
  test('migrate-bookings: notes get the new fields in template order (the example\'s notes, an older booked Transport note selected)', () => {
    const now = snap(), bad = [];
    for (const [f, t] of Object.entries(now)) {
      if (f.startsWith('Logistics/')) continue;
      const want = f === KAZ ? rd('example-vault', f).replace(/needs_booking: true\nbooking_status: not-contacted\ncost_agreed:\nadvance_paid:\nbalance_pending:\npayment_due:\ncancel_by:\nconfirmation:\n/, 'needs_booking: false\n') : rd('example-vault', f);
      if (t !== want) bad.push(f);
    }
    const tr = now['Logistics/Transport.md'];
    if (!/contact_phone:\ndecision: selected\ndecision_reason:\nquote:\nbooking_status: booked\ncost_agreed:\nadvance_paid:\nbalance_pending:\npayment_due:\ncancel_by:\nconfirmation:\nmax_km_per_day:/.test(tr)) bad.push('Transport: ' + tr);
    return mig.code === 0 && !bad.length ? '' : mig.out + '\n' + bad.slice(0, 5).join('\n');
  });
  test('migrate-bookings: a second run changes nothing, and the result passes the checker', () => {
    const again = run(MIG, [], old), r = check(old);
    const extra = r.out.split('\n').filter(l => /missing properties|not in the same order|not in Templates/.test(l));
    return again.code === 0 && /Nothing to do/.test(again.out) && r.code === 0 && !extra.length && warnLine(r.out, 'Logistics/Transport.md', 'booked, no confirmation yet') ? '' : again.out + r.out;
  });

  // the skills, the roadmap and the plan
  test('bookings: group-decisions has the booking procedure, and the other skills read the new fields', () => {
    const sk = n => fs.readFileSync(path.join(ROOT, 'skills', n, 'SKILL.md'), 'utf8'), bad = [];
    const g = sk('group-decisions'), ref = fs.readFileSync(path.join(ROOT, 'skills/group-decisions/references/booking.md'), 'utf8');
    for (const w of ['references/booking.md', 'migrate-bookings.mjs', '--add-bookings', "what's left to book", 'Paid so far / still owed', 'booked, no confirmation yet', 'cost_agreed']) if (!g.includes(w)) bad.push(`group-decisions: ${w}`);
    for (const w of ['not-contacted', 'enquired', 'quoted', 'booked', 'paid', 'cancelled', 'Confirmations/', 'needs_booking', 'Lock it right away', 'dropped', 'affects', 'delete']) if (!ref.includes(w)) bad.push(`references/booking.md: ${w}`);
    if (/not-needed|confirmed`/.test(ref)) bad.push('references/booking.md uses a value that is not in the lists');
    if (!/needs_booking/.test(sk('add-place')) || !/needs_booking/.test(fs.readFileSync(path.join(ROOT, 'skills/add-place/references/agent-prompt.md'), 'utf8'))) bad.push('add-place: needs_booking');
    if (!/needs_booking/.test(sk('plan-day')) || !/decision: selected/.test(sk('plan-day')) || !/decision: selected/.test(sk('review-travel-times'))) bad.push('plan-day / review-travel-times: the selected Transport note and needs_booking');
    if (!/cost_agreed/.test(sk('compare-itineraries'))) bad.push('compare-itineraries: cost_agreed');
    if (!/--add-bookings/.test(sk('trip-init'))) bad.push('trip-init: --add-bookings');
    return bad.join('; ');
  });
  test('bookings: the roadmap marks the booking task list done; the plan says built', () => {
    const bad = [];
    if (!/\[x\] \(v0\.11\.0\) \*\*Booking task list\*\*/.test(rd('.', 'docs/ROADMAP.md'))) bad.push('roadmap not marked done');
    if (!/^Status: built \(v0\.11\.0\)/m.test(rd('.', 'docs/PLAN-booking-tasks.md'))) bad.push('plan status line');
    return bad.join('; ');
  });
}

// ---------- booking deadlines (v0.13.0) ----------
{
  const rd = (v, f) => fs.readFileSync(path.join(ROOT, v, f), 'utf8');
  const fm = t => t.match(/^---\n([\s\S]*?)\n---/)[1];
  const TASK = 'Bookings/Book - Travel to and from the trip.md';
  test('deadlines: Booking, Stay and Transport have payment_due and cancel_by after balance_pending; date types, the By date view and the Home embed in both vaults', () => {
    const bad = [];
    for (const v of ['vault-template', 'example-vault']) {
      for (const t of ['Booking', 'Stay', 'Transport']) if (!/^balance_pending:\npayment_due:\ncancel_by:\n/m.test(fm(rd(v, `Templates/${t}.md`)) + '\n')) bad.push(`${v} ${t}`);
      const types = JSON.parse(rd(v, '.obsidian/types.json')).types;
      if (types.payment_due !== 'date' || types.cancel_by !== 'date') bad.push(`${v} types`);
      const base = rd(v, 'Bases/Bookings.base'), view = base.match(/name: By date\n[\s\S]*?(?=\n  - type:|$)/)?.[0] || '';
      if (!/'!payment_due\.isEmpty\(\)'/.test(view) || !/'!cancel_by\.isEmpty\(\)'/.test(view) || !/property: payment_due\n\s+direction: ASC/.test(view)) bad.push(`${v} By date view`);
      if (!/      - payment_due\n      - cancel_by\n/.test(base.match(/name: All bookings[\s\S]*$/)[0])) bad.push(`${v} All bookings columns`);
      if (!rd(v, '00 Home.md').includes('### Deadlines coming up\n![[Bookings.base#By date]]\n')) bad.push(`${v} Home`);
      if (!/add these seven lines.*payment_due, cancel_by, confirmation/.test(rd(v, 'Templates/Location.md'))) bad.push(`${v} Location FIELD GUIDE`);
    }
    for (const t of ['Booking', 'Transport']) if (rd('vault-template', `Templates/${t}.md`) !== rd('example-vault', `Templates/${t}.md`)) bad.push(`${t} differs between the vaults`);
    return bad.join('; ');
  });
  test('deadlines: the example has no dates filled in', () => {
    const bad = [];
    for (const d of ['Stays', 'Locations', 'Bookings']) for (const f of fs.readdirSync(path.join(ROOT, 'example-vault', d)))
      if (/^(payment_due|cancel_by):[ \t]*\S/m.test(fm(rd('example-vault', `${d}/${f}`)))) bad.push(`${d}/${f}`);
    return bad.join(', ');
  });
  const withTask = (tag, fields) => {
    const v = path.join(TMP, 'dl-' + tag);
    fs.cpSync(path.join(ROOT, 'example-vault'), v, { recursive: true });
    const p = path.join(v, TASK);
    let t = fs.readFileSync(p, 'utf8');
    for (const [k, val] of Object.entries(fields)) t = t.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${val}`);
    fs.writeFileSync(p, t);
    return check(v);
  };
  const TASKNAME = path.basename(TASK);
  const W = { overdue: 'payment overdue since', expired: 'free cancellation expired on', order: 'is before payment is due', early: 'a date is set but booking is' };
  test('deadlines: the checker warns about an overdue payment, an expired free cancellation, dates in the wrong order and a date on a note not yet quoted', () => {
    const over = withTask('over', { booking_status: 'quoted', cost_agreed: 100, advance_paid: 0, balance_pending: 100, payment_due: '2020-01-01' });
    const exp = withTask('exp', { booking_status: 'booked', cost_agreed: 100, advance_paid: 50, balance_pending: 50, cancel_by: '2020-01-01' });
    const ord = withTask('ord', { booking_status: 'quoted', payment_due: '2099-02-01', cancel_by: '2099-01-10' });
    const early = withTask('early', { booking_status: 'not-contacted', payment_due: '2099-01-01' });
    const bad = [];
    if (!warnLine(over.out, TASKNAME, `${W.overdue} 2020-01-01`)) bad.push('overdue');
    if (!warnLine(exp.out, TASKNAME, `${W.expired} 2020-01-01`)) bad.push('expired');
    if (!warnLine(ord.out, TASKNAME, `cancellation cut-off (2099-01-10) ${W.order} (2099-02-01)`)) bad.push('order');
    if (!warnLine(early.out, TASKNAME, `${W.early} not-contacted`)) bad.push('early');
    if ([over, exp, ord, early].some(r => r.code !== 0)) bad.push('a deadline warning made the checker fail');
    return bad.length ? bad.join(', ') + '\n' + over.out + exp.out + ord.out + early.out : '';
  });
  test('deadlines: no warning for future dates in the right order, a paid booking past its cancel date, or a paid-off past payment date', () => {
    const fine = withTask('fine', { booking_status: 'quoted', cost_agreed: 100, advance_paid: 0, balance_pending: 100, payment_due: '2099-02-01', cancel_by: '2099-03-01' });
    const paid = withTask('paid', { booking_status: 'paid', cost_agreed: 100, advance_paid: 100, balance_pending: 0, payment_due: '2020-01-01', cancel_by: '2020-01-01' });
    const hit = [fine, paid].flatMap(r => r.out.split('\n').filter(l => l.includes(TASKNAME) && Object.values(W).some(w => l.includes(w))));
    return hit.join('\n');
  });

  // trip-init --add-deadlines and migrate-bookings on a vault made before 0.13.0
  const old = path.join(TMP, 'pre-0.13');
  fs.cpSync(path.join(ROOT, 'example-vault'), old, { recursive: true });
  const ow = (rel, fn) => { const p = path.join(old, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  const noDates = s => s.replace(/^(payment_due|cancel_by):.*\n/gm, '');
  for (const t of ['Booking', 'Stay', 'Transport']) ow(`Templates/${t}.md`, noDates);
  ow('Templates/Location.md', s => s.replace('add these seven lines', 'add these five lines').replace(', payment_due, cancel_by, confirmation', ', confirmation').replace('payment_due and cancel_by are dates YYYY-MM-DD; ', ''));
  ow('.obsidian/types.json', s => s.replace(/,\n\s*"payment_due": "date",\n\s*"cancel_by": "date"/, ''));
  ow('Bases/Bookings.base', s => s.replace(/  - type: table\n    name: By date\n[\s\S]*?(?=  - type: table\n    name: All bookings)/, '').replace('      - payment_due\n      - cancel_by\n', ''));
  ow('00 Home.md', s => s.replace('### Deadlines coming up\n![[Bookings.base#By date]]\n\n', ''));
  for (const d of ['Stays', 'Locations', 'Bookings']) for (const f of fs.readdirSync(path.join(old, d))) ow(`${d}/${f}`, noDates);
  const exAnswers = path.join(ANSWERS, 'example-vault-answers.json');
  const TOOL = ['Templates/Booking.md', 'Templates/Stay.md', 'Templates/Transport.md', 'Templates/Location.md', '.obsidian/types.json', 'Bases/Bookings.base', '00 Home.md'];
  test('deadlines: the made-up older vault really is old (setup check), and --reconfigure alone adds nothing', () => {
    const notOld = TOOL.filter(f => fs.readFileSync(path.join(old, f), 'utf8') === rd('example-vault', f));
    const r = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure']);
    return !notOld.length && r.code === 0 && r.out.includes('Nothing changed') ? '' : `not changed by setup: ${notOld.join(', ')}\n${r.out}`;
  });
  const up = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-deadlines']);
  test('trip-init --reconfigure --add-deadlines brings an older vault to what the example has (templates, types, base, Home)', () => {
    const diff = TOOL.filter(f => fs.readFileSync(path.join(old, f), 'utf8') !== rd('example-vault', f));
    return up.code === 0 && !diff.length ? '' : `${up.out}\ndiffers: ${diff.join(', ')}`;
  });
  test('trip-init --add-deadlines: a second run changes nothing, and without --reconfigure it is refused', () => {
    const again = run(INIT, ['--answers', exAnswers, '--vault', old, '--reconfigure', '--add-deadlines']);
    const no = run(INIT, ['--answers', exAnswers, '--vault', path.join(TMP, 'never-d'), '--add-deadlines']);
    return again.code === 0 && again.out.includes('Nothing changed') && no.code === 1 && /--add-deadlines only works with --reconfigure/.test(no.out) ? '' : again.out + no.out;
  });
  const MIG = path.join(ROOT, 'skills/group-decisions/scripts/migrate-bookings.mjs');
  const mig = run(MIG, [], old);
  test('migrate-bookings: a pre-0.13 vault\'s stays, booking notes and places that need booking get the two dates; a second run changes nothing, and it passes the checker', () => {
    const bad = [];
    for (const d of ['Stays', 'Locations', 'Bookings']) for (const f of fs.readdirSync(path.join(old, d)))
      if (fs.readFileSync(path.join(old, d, f), 'utf8') !== rd('example-vault', `${d}/${f}`)) bad.push(`${d}/${f}`);
    const again = run(MIG, [], old), r = check(old);
    const extra = r.out.split('\n').filter(l => /missing properties|not in the same order|not in Templates\/|booking fields/.test(l));
    return mig.code === 0 && !bad.length && /Nothing to do/.test(again.out) && r.code === 0 && !extra.length ? '' : `${mig.out}\n${bad.slice(0, 5).join('\n')}\n${extra.join('\n')}`;
  });

  // the skills, the roadmap and the plan
  test('deadlines: the skills mention the fields; the roadmap marks it done; the plan says built', () => {
    const bad = [];
    const g = rd('.', 'skills/group-decisions/SKILL.md'), ref = rd('.', 'skills/group-decisions/references/booking.md');
    for (const w of ['payment_due', '--add-deadlines', 'migrate-bookings.mjs']) if (!g.includes(w)) bad.push(`group-decisions: ${w}`);
    for (const w of ['payment_due', 'cancel_by', 'Coming up', 'payment overdue', 'free cancellation expired']) if (!ref.includes(w)) bad.push(`references/booking.md: ${w}`);
    if (!/--add-deadlines/.test(rd('.', 'skills/trip-init/SKILL.md'))) bad.push('trip-init: --add-deadlines');
    if (!/\[x\] \(v0\.13\.0\) \*\*Booking deadlines\*\*/.test(rd('.', 'docs/ROADMAP.md'))) bad.push('roadmap not marked done');
    if (!/^Status: built \(v0\.13\.0\)/m.test(rd('.', 'docs/PLAN-booking-deadlines.md'))) bad.push('plan status line');
    return bad.join('; ');
  });
}
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
  .replace('{{title}}', 'Cafe').replace('decision: considering', 'decision: maybe').replace('kind:', 'kind: diner'));
fs.writeFileSync(path.join(broken, 'Itinerary/Route.md'), fs.readFileSync(path.join(broken, 'Templates/Route.md'), 'utf8')
  .replace('{{title}}', 'Route').replace('bases: []', 'bases: [A, B]').replace('nights_per_base: []', 'nights_per_base: [2]'));
// A locked Decision note with no locked_by.
fs.mkdirSync(path.join(broken, 'Decisions'), { recursive: true });
fs.writeFileSync(path.join(broken, 'Decisions/Decision - Van.md'), fs.readFileSync(path.join(broken, 'Templates/Decision.md'), 'utf8')
  .replace('{{title}}', 'Decision - Van').replace('options: []', 'options:\n  - Van').replace('status: open', 'status: locked').replace('decided_option:', 'decided_option: Van'));
// A selected stay that is booked with no confirmation, and a Bookings note with a booking_status that is not in the list.
edit('Stays/Sohra Plaza.md', 'decision: considering', 'decision: selected');
edit('Stays/Sohra Plaza.md', 'booking_status: not-contacted', 'booking_status: booked');
edit('Bookings/Book - Travel to and from the trip.md', 'booking_status: not-contacted', 'booking_status: done');

// A bad road cutoff in trip.md, and a Route note whose Day by day table is a row short.
edit('trip.md', 'road_cutoffs: []', 'road_cutoffs: [{area: Jowai, no_drive_after: 4pm}]');
fs.writeFileSync(path.join(broken, 'Itinerary/Route - Option A.md'), fs.readFileSync(path.join(broken, 'Templates/Route.md'), 'utf8')
  .replace('{{title}}', 'Route - Option A').replace('bases: []', 'bases: [A]').replace('nights_per_base: []', 'nights_per_base: [2]').replace('total_nights:', 'total_nights: 2')
  .replace('| 1 |  |  |  |  |\n| 2 |  |  |  |  |', '| 1 | 08:00, A |  | A | A |\n| 2 | 08:00, A |  | A | A |'));

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
expectIn('kind outside the list in a Food note', 'Food/Cafe.md', 'kind "diner" is not one of', 'warning');
expectIn('locked Decision note with no locked_by', 'Decisions/Decision - Van.md', 'locked_by is empty', 'error');
expectIn('Route nights that do not match the bases', 'Itinerary/Route.md', 'nights_per_base', 'warning');
expectIn('a booked stay with no confirmation', 'Stays/Sohra Plaza.md', 'booked, no confirmation yet', 'warning');
expectIn('a booked stay whose decision is not locked', 'Stays/Sohra Plaza.md', 'is not locked', 'warning');
expectIn('a road cutoff with a bad time', 'trip.md', 'no_drive_after must be a time', 'warning');
expectIn('a Route Day by day table a row short', 'Itinerary/Route - Option A.md', 'Day by day has 2 row(s), but 2 nights need 3', 'warning');
expectIn('a booking_status outside the list', 'Bookings/Book - Travel to and from the trip.md', 'booking_status "done" is not one of', 'warning');

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
