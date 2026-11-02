// Tests for trip-huddle. Run from anywhere:  node scripts/test.mjs
// Covers: the checker on the example vault, trip-init reconfigure leaving the example vault unchanged,
// trip-init making a new vault the checker accepts, and a deliberately broken vault where every problem
// must be reported. Works on temporary copies, so the repo is never modified. Exits 1 if anything fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sunTimes, slack, tzOffsetMinutes, TIGHT_BELOW_HRS, TOO_MUCH_BELOW_HRS } from '../skills/plan-day/scripts/sun.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(ROOT, 'scripts/validate.mjs');
const INIT = path.join(ROOT, 'skills/trip-init/scripts/init.mjs');
const ANSWERS = path.join(ROOT, 'skills/trip-init/tests');
const SUN = path.join(ROOT, 'skills/plan-day/scripts/sun.mjs');
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
  put('Sources/Src.md', '---\ntype: source\ntags:\n  - source\n---\n# Src\n[[Cliff Viewpoint (Example)]] [[Fishing Harbour (Example)]] [[Old Town Walk (Example)]] [[Mountain Fort (Example)]]\n');
  for (const n of ['Cliff Viewpoint (Example)', 'Fishing Harbour (Example)', 'Old Town Walk (Example)', 'Mountain Fort (Example)']) {
    put(`Locations/${n}.md`, tpl('Location.md').replace('{{title}}', n).replace('location: []', 'location: [37.1, -8.7]')
      .replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"').replace(/scheduled_day:.*/, n.startsWith('Mountain') ? 'scheduled_day:' : 'scheduled_day: "[[Day 04]]"'));
  }
  put('Stays/Example Guesthouse Lagos.md', tpl('Stay.md').replace('{{title}}', 'Example Guesthouse Lagos').replace('location: []', 'location: [37.1, -8.67]')
    .replace('recommended_by: []', 'recommended_by:\n  - "[[Src]]"'));
  fs.appendFileSync(path.join(dayVault, 'Sources/Src.md'), '[[Example Guesthouse Lagos]]\n');
  fs.copyFileSync(path.join(ROOT, 'skills/plan-day/references/day-example.md'), path.join(dayVault, 'Itinerary/Day 04.md'));
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
