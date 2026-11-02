// Adds the build-itinerary fields (v0.12.0) to the existing notes of a trip-huddle vault. Safe to run twice.
// Usage (from the vault root): node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/migrate-itinerary.mjs" [--dry-run]
// The vault is the current directory, or TRIP_VAULT if set.
//
// Run it after `trip-init --reconfigure --add-itinerary`, which brings the templates, the types, the Bases and the home page
// up to date (and touches no notes). This script touches only notes, and only adds empty fields:
//   - Location notes: `needs_night_nearby` right after `last_mile`;
//   - Day notes: `start_time` right after `locations`, and `backtrack_km` right after `total_walk_km`.
// Nothing else changes: no value is filled in or guessed. Route notes keep their body; the build-itinerary skill adds the
// Day by day table and the three lists when it next writes one.
import fs from 'node:fs';
import path from 'node:path';

const VAULT = path.resolve(process.env.TRIP_VAULT || process.cwd());
const DRY = process.argv.includes('--dry-run');
if (!fs.existsSync(path.join(VAULT, 'Templates'))) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no Templates/ folder). Run this from the vault folder, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}
const rel = p => path.relative(VAULT, p).split(path.sep).join('/');
const SKIP = new Set(['.obsidian', '.claude', '.git', '.trash', 'Templates']);
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (SKIP.has(f)) continue;
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && files.push(p);
  }
})(VAULT);

// Insert `lines` after the frontmatter property `anchor` (and any indented lines that belong to it). With no anchor,
// insert before `tags:`, or at the end of the frontmatter.
function addAfter(front, anchor, lines) {
  const out = front.split('\n');
  let i = out.findIndex(l => l.startsWith(anchor + ':'));
  if (i >= 0) { while (i + 1 < out.length && /^\s+\S/.test(out[i + 1])) i++; out.splice(i + 1, 0, ...lines); }
  else { const t = out.findIndex(l => l.startsWith('tags:')); out.splice(t >= 0 ? t : out.length, 0, ...lines); }
  return out.join('\n');
}
const has = (front, key) => new RegExp(`^${key}:`, 'm').test(front);
const PLAN = {
  location: [['last_mile', ['needs_night_nearby:']]],
  day: [['locations', ['start_time:']], ['total_walk_km', ['backtrack_km:']]],
};

let changed = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const type = m[1].match(/^type:\s*(\S+)/m)?.[1];
  if (!PLAN[type]) continue;
  let front = m[1];
  const added = [];
  for (const [anchor, lines] of PLAN[type]) {
    const todo = lines.filter(l => !has(front, l.split(':')[0]));
    if (!todo.length) continue;
    front = addAfter(front, anchor, todo);
    added.push(...todo.map(l => l.split(':')[0]));
  }
  if (!added.length) continue;
  changed++;
  console.log(`${DRY ? 'WOULD CHANGE' : 'changed'} ${rel(f)}: added ${added.join(', ')}`);
  if (!DRY) fs.writeFileSync(f, `---\n${front}\n---` + text.slice(m[0].length));
}
console.log(`\n${DRY ? 'Dry run: ' : ''}${changed} note(s) ${DRY ? 'would change' : 'changed'}.`);
if (!changed) console.log('Nothing to do: already migrated.');
