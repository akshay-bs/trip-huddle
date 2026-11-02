// Tests for trip-huddle. Run from anywhere:  node scripts/test.mjs
// Covers: the checker on the example vault, trip-init reconfigure leaving the example vault unchanged,
// trip-init making a new vault the checker accepts, and a deliberately broken vault where every problem
// must be reported. Works on temporary copies, so the repo is never modified. Exits 1 if anything fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(ROOT, 'scripts/validate.mjs');
const INIT = path.join(ROOT, 'skills/trip-init/scripts/init.mjs');
const ANSWERS = path.join(ROOT, 'skills/trip-init/tests');
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
