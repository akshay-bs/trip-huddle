// Migrates a trip-huddle vault to the after-dark fields (v0.6.0). Safe to run twice.
// Usage (from the vault root): node "${CLAUDE_PLUGIN_ROOT}/skills/add-place/scripts/migrate-after-dark.mjs" [--dry-run]
// The vault is the current directory, or TRIP_VAULT if set.
//
// In every Location note (and in Templates/Location.md):
//   - adds `after_dark:` and `after_dark_note:` (empty) right after `best_time_of_day`, in template order;
//   - makes `best_time_of_day` a list. An old text value becomes a list only when every word in it is already
//     one of sunrise | morning | midday | afternoon | sunset | evening | night | any ("Morning" -> [morning]).
//     Any other text ("Late morning to early afternoon") is NOT guessed at: the list stays empty and the old
//     text is kept as a bullet under "## Tips" ("Best time, as first written: ..."), so nothing is lost.
// Also: the FIELD GUIDE lines in Templates/Location.md, the property types in .obsidian/types.json, and an empty
// `evening_bases: []` after `bases:` in trip.md.
// It does not change Day Plan.md or the Bases: copy those from vault-template/ (see the note it prints).
import fs from 'node:fs';
import path from 'node:path';

const VAULT = path.resolve(process.env.TRIP_VAULT || process.cwd());
const DRY = process.argv.includes('--dry-run');

if (!fs.existsSync(path.join(VAULT, 'Templates'))) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no Templates/ folder). Run this from the vault folder, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}

const TIMES = ['sunrise', 'morning', 'midday', 'afternoon', 'sunset', 'evening', 'night', 'any'];
const GUIDE = [
  `best_time_of_day: ${TIMES.join(' | ')}   (when to be there; a list, e.g. [sunrise] or [evening, night])`,
  'after_dark: good | fine | avoid   (good = worth visiting after dark: lights, night market, festival; fine = no problem, nothing special; avoid = closes, is unsafe or pointless after dark, or the way back is a bad night drive)',
  'after_dark_note: the reason, in a few words, e.g. "lit up for the festival", "no lights, forest road back"',
];
const unquote = s => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

// Old text -> { list, leftover }. Only exact value words are turned into a list.
function convertBestTime(text) {
  const parts = text.split(/\s*(?:,|\/|\+|\bor\b|\band\b)\s*/i).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length && parts.every(p => TIMES.includes(p))) return { list: [...new Set(parts)], leftover: '' };
  return { list: [], leftover: text.trim() };
}

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (['.obsidian', '.claude', '.git', '.trash', 'node_modules'].includes(f)) continue;
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && files.push(p);
  }
})(VAULT);

const write = (p, text) => { if (!DRY) fs.writeFileSync(p, text); };
const rel = p => path.relative(VAULT, p).split(path.sep).join('/');
let changed = 0;
const say = (p, what) => { changed++; console.log(`${DRY ? 'WOULD CHANGE' : 'changed'} ${rel(p)}: ${what}`); };
const kept = [];

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const m = text.match(/^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m || !/^type:\s*location\s*$/m.test(m[2])) continue;
  const eol = m[1];
  const lines = m[2].split(/\r?\n/);
  const isTemplate = rel(f) === 'Templates/Location.md';
  const notes = [];

  // the block of a property: its line plus any indented lines after it
  const blockEnd = i => { let j = i + 1; while (j < lines.length && /^\s+\S/.test(lines[j])) j++; return j; };
  let at = lines.findIndex(l => /^best_time_of_day:/.test(l));
  let leftover = '';
  if (at >= 0) {
    const end = blockEnd(at), first = lines[at].replace(/^best_time_of_day:\s*/, '').replace(/\s+#.*$/, '');
    const isList = first.startsWith('[') || end > at + 1;
    if (!isList) {
      const { list, leftover: left } = first === '' ? { list: [], leftover: '' } : convertBestTime(unquote(first));
      leftover = left;
      const next = list.length ? ['best_time_of_day:', ...list.map(v => `  - ${v}`)] : ['best_time_of_day: []'];
      lines.splice(at, end - at, ...next);
      notes.push(list.length ? `best_time_of_day -> [${list.join(', ')}]` : left ? 'best_time_of_day -> [] (old text kept under Tips)' : 'best_time_of_day -> []');
    }
  } else {
    const opening = lines.findIndex(l => /^opening_hours:/.test(l));
    if (opening < 0) { console.log(`SKIP ${rel(f)}: no best_time_of_day or opening_hours line to anchor on; add the fields by hand`); continue; }
    lines.splice(opening, 0, 'best_time_of_day: []');
    at = opening;
    notes.push('added best_time_of_day: []');
  }
  at = lines.findIndex(l => /^best_time_of_day:/.test(l));
  const after = blockEnd(at);
  const add = ['after_dark', 'after_dark_note'].filter(k => !lines.some(l => l.startsWith(k + ':'))).map(k => `${k}:`);
  if (add.length) { lines.splice(after, 0, ...add); notes.push(`added ${add.map(a => a.slice(0, -1)).join(', ')}`); }

  let body = text.slice(m[0].length);
  if (leftover) {
    const bullet = `- Best time, as first written: ${leftover}`;
    const h = body.match(/^## Tips[ \t]*$/m);
    if (h) {
      const start = h.index + h[0].length, nextH = body.slice(start).search(/\n## /);
      const stop = nextH < 0 ? body.length : start + nextH;
      const section = body.slice(start, stop).replace(/\s+$/, '').replace(/\n- *$/, '');
      const rest = body.slice(stop).replace(/^\n/, '');
      body = body.slice(0, start) + section + `\n${bullet}\n` + (rest ? '\n' + rest : '');
    } else {
      body = body.replace(/\s*$/, '') + `\n\n## Tips\n${bullet}\n`;
    }
    kept.push(rel(f));
  }

  // the FIELD GUIDE in the template
  let out = `---${eol}${lines.join(eol)}${eol}---${m[3]}${body}`;
  if (isTemplate) {
    const guideStart = out.indexOf('<!--'), guideEnd = out.indexOf('-->', guideStart);
    const guide = out.slice(guideStart, guideEnd);
    const need = GUIDE.filter(g => !new RegExp(`^${g.split(':')[0]}:`, 'm').test(guide));
    if (need.length && guideStart >= 0) {
      const anchor = guide.match(/^time_needed_hrs:.*\n/m);
      const pos = anchor ? guideStart + anchor.index + anchor[0].length : guideEnd;
      out = out.slice(0, pos) + need.join(eol) + eol + out.slice(pos);
      notes.push('FIELD GUIDE lines added');
    }
  }
  if (out !== text) { say(f, notes.join('; ')); write(f, out); }
}

// property types
const typesFile = path.join(VAULT, '.obsidian/types.json');
if (fs.existsSync(typesFile)) {
  const raw = fs.readFileSync(typesFile, 'utf8');
  try {
    const j = JSON.parse(raw);
    const types = {};
    for (const [k, v] of Object.entries(j.types || {})) {
      types[k] = k === 'best_time_of_day' ? 'multitext' : v;
      if (k === 'best_time_of_day') for (const x of ['after_dark', 'after_dark_note']) if (!(x in j.types)) types[x] = 'text';
      if (k === 'total_walk_km' && !('rule_bends' in j.types)) types.rule_bends = 'number';
    }
    if (!('rule_bends' in types)) types.rule_bends = 'number';
    const next = JSON.stringify({ ...j, types }, null, 2) + '\n';
    if (next !== raw) { say(typesFile, 'property types for best_time_of_day, after_dark, after_dark_note, rule_bends'); write(typesFile, next); }
  } catch { console.log(`SKIP ${rel(typesFile)}: could not read it as JSON; add the types by hand`); }
}

// trip.md
const tripFile = path.join(VAULT, 'trip.md');
if (fs.existsSync(tripFile)) {
  const t = fs.readFileSync(tripFile, 'utf8');
  if (!/^evening_bases:/m.test(t) && /^bases:.*$/m.test(t)) {
    say(tripFile, 'added evening_bases: []');
    write(tripFile, t.replace(/^(bases:.*)$/m, '$1\nevening_bases: []'));
  }
}

console.log(`\n${DRY ? 'Dry run: ' : ''}${changed} file(s) ${DRY ? 'would change' : 'changed'}.`);
if (kept.length) console.log(`${kept.length} note(s) had free-text best_time_of_day that is not a value from the list. The text is kept under "## Tips" and the list is empty. Fill the list in when you research the place.`);
if (!changed) console.log('Nothing to do: already migrated.');
else console.log('Also new in this version, copy from vault-template/ if you want them: Templates/Day Plan.md (After dark column, rule_bends, "Choices that bend the rules"), Bases/Itinerary.base and Bases/Locations.base. Trip-init per-trip values (day start, sunset, currency) in those files need re-running trip-init with --reconfigure afterwards.');
