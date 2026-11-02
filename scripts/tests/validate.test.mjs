// Tests for scripts/validate.mjs. No dependencies. Run: node scripts/tests/validate.test.mjs
// Builds deliberately broken notes in temp copies of the example vault and the empty template vault.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHECKER = path.join(ROOT, 'scripts', 'validate.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'th-validate-'));

let passed = 0; const failed = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed.push(name); console.log(`  FAIL ${name}${detail ? '\n       ' + detail.split('\n').join('\n       ') : ''}`); }
}
function run(vault, args = [], { cwd, env } = {}) {
  const r = spawnSync('node', [CHECKER, ...(vault ? ['--vault', vault] : []), ...args],
    { cwd: cwd || TMP, env: { ...process.env, TRIP_VAULT: '', ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}
const count = (out, label) => Number((out.match(new RegExp(`${label} \\((\\d+)\\)`)) || [])[1]);
function copyVault(src, name) {
  const dest = path.join(TMP, name);
  fs.cpSync(path.join(ROOT, src), dest, { recursive: true });
  return dest;
}
const put = (vault, file, text) => { const p = path.join(vault, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const get = (vault, file) => fs.readFileSync(path.join(vault, file), 'utf8');
const swap = (vault, file, from, to) => {
  const t = get(vault, file);
  if (!t.includes(from)) throw new Error(`test setup: "${from}" not found in ${file}`);
  put(vault, file, t.replace(from, to));
};
// A note made from a template: fill the title and the given properties.
function fromTemplate(vault, templateFile, title, props = {}) {
  let t = get(vault, `Templates/${templateFile}`).replace(/\{\{title\}\}/g, title).replace(/\{\{date\}\}/g, '2026-01-01');
  for (const [k, v] of Object.entries(props)) t = t.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`);
  return t;
}
const SRC = '"[[Example - Public research]]"';

// ---------- clean vaults pass ----------
console.log('Clean vaults');
const example = copyVault('example-vault', 'example');
let r = run(example);
check('example vault: 0 errors, exit 0', r.code === 0 && count(r.out, 'ERRORS') === 0, r.out);
r = run(copyVault('vault-template', 'empty'));
check('empty template vault: 0 errors, exit 0', r.code === 0 && count(r.out, 'ERRORS') === 0, r.out);

// Good Day, Food and Source notes in the example copy
put(example, 'Itinerary/Day 01.md', fromTemplate(example, 'Day Plan.md', 'Day 01', { day: 1, date: '2026-01-01' }));
put(example, 'Food/Test Cafe.md', fromTemplate(example, 'Food Spot.md', 'Test Cafe', { recommended_by: `[${SRC}]`, veg_options: 'good' }));
put(example, 'Sources/Test Source.md', fromTemplate(example, 'Source Itinerary.md', 'Test Source', { source_from: 'a test', source_kind: 'blog' }));
put(example, 'Itinerary/Route.md', '---\ntype: route\n---\n# Route\n'); // no template for "route": skipped
r = run(example);
check('good Day, Food and Source notes and a Route note add no errors', r.code === 0 && count(r.out, 'ERRORS') === 0, r.out);
check('they are checked (note count went up)', /Checked 70 note/.test(r.out), r.out.split('\n')[0]);

// ---------- Location and Stay errors ----------
console.log('Location and Stay notes');
const base = copyVault('example-vault', 'broken');
const loc = fs.readdirSync(path.join(base, 'Locations')).find(f => f.endsWith('.md'));
const locPath = `Locations/${loc}`;
const orig = get(base, locPath);
const locName = loc.replace(/\.md$/, '');
const LOC_RE = /^location:(?: \[.*\]|\n(?:  - .*\n)+)/m; // inline or block list
const withCoords = (text, c) => text.replace(LOC_RE, `location: [${c}]\n`);
check('test setup: the first Location has coordinates', LOC_RE.test(orig), locPath);

put(base, locPath, orig.replace(/^recommended_by:[\s\S]*?(?=^cover:)/m, 'recommended_by: []\n'));
r = run(base, [locPath]);
check('missing source (recommended_by empty) is an error', r.code === 1 && /recommended_by is empty/.test(r.out), r.out);

put(base, locPath, orig.replace(/^decision: .*$/m, 'decision: maybe'));
r = run(base, [locPath]);
check('bad decision value is an error', r.code === 1 && /decision "maybe" invalid/.test(r.out), r.out);

put(base, locPath, orig.replace(/^difficulty:.*$/m, 'difficulty: banana'));
r = run(base, [locPath]);
check('bad FIELD GUIDE value is a warning, not an error', r.code === 0 && /difficulty "banana" is not one of/.test(r.out), r.out);

put(base, locPath, withCoords(orig, '10.5, 20.5'));
r = run(base, [locPath]);
check('coordinates outside trip.md map_box are an error', r.code === 1 && /outside the trip map_box/.test(r.out), r.out);
const noBox = copyVault('example-vault', 'nobox');
swap(noBox, 'trip.md', /map_box: \{[^}]*\}/.exec(get(noBox, 'trip.md'))[0], 'map_box:');
put(noBox, locPath, withCoords(orig, '10.5, 20.5'));
r = run(noBox, [locPath]);
check('no map_box in trip.md: box check is skipped', r.code === 0, r.out);

put(base, locPath, orig.replace(/^state: .*$/m, 'state: Atlantis'));
r = run(base, [locPath]);
check('state outside trip.md regions is a warning', r.code === 0 && /state "Atlantis" is not one of the trip regions/.test(r.out), r.out);

put(base, locPath, orig);
fs.renameSync(path.join(base, locPath), path.join(base, 'Stays', loc));
r = run(base);
check('note in the wrong folder is an error', r.code === 1 && new RegExp(`Stays/${locName.replace(/[()]/g, '\\$&')}\\.md: type location must live in Locations/`).test(r.out), r.out);
fs.renameSync(path.join(base, 'Stays', loc), path.join(base, locPath));

const stay = fs.readdirSync(path.join(base, 'Stays')).find(f => f.endsWith('.md'));
const stayText = get(base, `Stays/${stay}`);
put(base, `Stays/${stay}`, stayText.replace(/^price_per_night:.*$/m, 'price_per_night: about 5000'));
r = run(base, [`Stays/${stay}`]);
check('Stay: text in a number property is an error', r.code === 1 && /price_per_night must be a plain number/.test(r.out), r.out);
put(base, `Stays/${stay}`, stayText);

// ---------- Day, Food and Source errors ----------
console.log('Day, Food and Source notes');
const d = copyVault('example-vault', 'dfs');
put(d, 'Itinerary/Day 02.md', fromTemplate(d, 'Day Plan.md', 'Day 02', { date: '2026-01-02' })); // day left empty
r = run(d);
check('Day note without its required "day" is an error', r.code === 1 && /Itinerary\/Day 02\.md: day is required but empty/.test(r.out), r.out);
put(d, 'Itinerary/Day 02.md', fromTemplate(d, 'Day Plan.md', 'Day 02', { day: 2, date: 'next week' }));
r = run(d);
check('Day note with a bad date is an error', r.code === 1 && /date must be YYYY-MM-DD/.test(r.out), r.out);
fs.rmSync(path.join(d, 'Itinerary/Day 02.md'));

put(d, 'Food/Bad Cafe.md', fromTemplate(d, 'Food Spot.md', 'Bad Cafe', { veg_options: 'maybe' })); // no source
r = run(d);
check('Food note without a source is an error', r.code === 1 && /Food\/Bad Cafe\.md: recommended_by is empty/.test(r.out), r.out);
check('Food note with a bad veg_options value gets a warning', /Food\/Bad Cafe\.md: veg_options "maybe" is not one of/.test(r.out), r.out);
fs.renameSync(path.join(d, 'Food/Bad Cafe.md'), path.join(d, 'Locations/Bad Cafe.md'));
r = run(d);
check('Food note in Locations/ is in the wrong folder', /Locations\/Bad Cafe\.md: type food must live in Food\//.test(r.out), r.out);
fs.rmSync(path.join(d, 'Locations/Bad Cafe.md'));

put(d, 'Sources/Bad Source.md', fromTemplate(d, 'Source Itinerary.md', 'Bad Source', { source_kind: 'blog' })); // source_from empty
r = run(d);
check('Source note without source_from is an error', r.code === 1 && /Sources\/Bad Source\.md: source_from is required but empty/.test(r.out), r.out);
fs.rmSync(path.join(d, 'Sources/Bad Source.md'));

put(d, 'Stays/Typo.md', get(d, 'Stays/' + stay).replace(/^type: stay$/m, 'type: stya'));
r = run(d);
check('a mistyped note type in a note folder is an error', r.code === 1 && /Stays\/Typo\.md: unknown type "stya"/.test(r.out), r.out);
fs.rmSync(path.join(d, 'Stays/Typo.md'));

// ---------- driven by the templates ----------
console.log('Template-driven');
const t = copyVault('example-vault', 'tpl');
swap(t, 'Templates/Location.md', 'recommended_by: []', 'parking_at_site:\nrecommended_by: []');
swap(t, 'Templates/Location.md', '-->\n\n# {{title}}', 'parking_at_site: free | paid | none\n-->\n\n# {{title}}');
r = run(t);
check('a field added to a template is required in existing notes', r.code === 1 && /missing properties: parking_at_site/.test(r.out), r.out);
check('...and gets checked in every Location', count(r.out, 'ERRORS') > 50, r.out.split('\n').slice(0, 6).join('\n'));

const f = copyVault('example-vault', 'folders');
swap(f, 'trip.md', 'field_packs: []', 'field_packs: []\nfolders: {location: Places}');
r = run(f);
check('folders in trip.md override the template folder', r.code === 1 && /type location must live in Places\//.test(r.out), r.out.split('\n').slice(0, 6).join('\n'));
const dv = copyVault('example-vault', 'decisions');
swap(dv, 'trip.md', 'field_packs: []', 'field_packs: []\ndecision_values: [yes, no]');
r = run(dv, [locPath]);
check('decision_values in trip.md replace the default list', r.code === 1 && /decision "considering" invalid \(use yes \| no\)/.test(r.out), r.out);

// ---------- where the vault is ----------
console.log('Finding the vault');
r = run(null, [], { cwd: example });
check('no option: the current folder', r.code === 0 && /Checked 70 note/.test(r.out), r.out);
r = run(null, [], { cwd: TMP, env: { TRIP_VAULT: example } });
check('TRIP_VAULT is used when there is no --vault', r.code === 0 && /Checked 70 note/.test(r.out), r.out);
r = run(path.join(TMP, 'empty'), [], { cwd: example, env: { TRIP_VAULT: example } });
check('--vault wins over TRIP_VAULT and the current folder', /Checked 0 note/.test(r.out), r.out);
fs.mkdirSync(path.join(TMP, 'plain'));
r = run(null, [], { cwd: path.join(TMP, 'plain') });
check('not a vault: clear message, exit 2', r.code === 2 && /Not a trip-huddle vault/.test(r.out), r.out);

// ---------- output format ----------
console.log('Output');
r = run(base, [locPath]);
check('prints "Checked", ERRORS and WARNINGS counts', /Checked 1 note/.test(r.out) && /ERRORS \(\d+\)/.test(r.out) && /WARNINGS \(\d+\)/.test(r.out), r.out);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed.length} failed`);
if (failed.length) failed.forEach(n => console.log(`  - ${n}`));
process.exit(failed.length ? 1 : 0);
