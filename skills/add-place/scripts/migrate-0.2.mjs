// Migrates a trip-huddle vault from 0.1 field names to 0.2. Safe to run twice.
// Usage (from the vault root): node "${CLAUDE_PLUGIN_ROOT}/skills/add-place/scripts/migrate-0.2.mjs" [--dry-run]
// The vault is the current directory, or TRIP_VAULT if set.
//
// Renames, in every .md note (frontmatter keys, FIELD GUIDE lines and plain mentions of the property names):
//   december_verdict -> season_verdict, december_note -> season_note
//   parking_for_tempo_traveller -> parking_for_group_vehicle
//   <name>_inr -> <name>   (entry_fee_inr, price_per_night_inr, est_total_inr, advance_paid_inr, extra_bed_inr, ...)
// and the headings "## December reality" -> "## Season reality".
// Notes that already have both the old and the new name are reported and left alone.
import fs from 'node:fs';
import path from 'node:path';

const VAULT = path.resolve(process.env.TRIP_VAULT || process.cwd());
const DRY = process.argv.includes('--dry-run');

if (!fs.existsSync(path.join(VAULT, 'Templates'))) {
  console.error(`Not a trip-huddle vault: ${VAULT}\n(no Templates/ folder). Run this from the vault folder, or set TRIP_VAULT to the vault path.`);
  process.exit(2);
}

const FIXED = {
  december_verdict: 'season_verdict',
  december_note: 'season_note',
  parking_for_tempo_traveller: 'parking_for_group_vehicle',
};
const rename = name => FIXED[name] ?? (/^[a-z][a-z0-9_]*_inr$/.test(name) ? name.slice(0, -4) : null);
const HEADINGS = [[/^(#{1,6}\s+)December reality\s*$/gm, '$1Season reality']];

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (['.obsidian', '.claude', '.git', '.trash', 'node_modules'].includes(f)) continue;
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && files.push(p);
  }
})(VAULT);

const OLD = /\b(december_verdict|december_note|parking_for_tempo_traveller|[a-z][a-z0-9_]*_inr)\b/g;
let changedNotes = 0, skipped = 0;
const totals = {};
const bump = k => { totals[k] = (totals[k] || 0) + 1; };

for (const f of files) {
  const rel = path.relative(VAULT, f).split(path.sep).join('/');
  const text = fs.readFileSync(f, 'utf8');
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontKeys = new Set(fmMatch ? [...fmMatch[1].matchAll(/^([A-Za-z_][\w-]*):/gm)].map(m => m[1]) : []);

  // refuse to create duplicate keys: both old and new present in the same frontmatter
  const clash = [...frontKeys].filter(k => rename(k) && frontKeys.has(rename(k)));
  if (clash.length) { console.log(`SKIP ${rel}: has both old and new names (${clash.join(', ')}); fix by hand`); skipped++; continue; }

  const notes = [];
  let out = text.replace(OLD, (m) => {
    const n = rename(m);
    if (!n) return m;
    notes.push(`${m} -> ${n}`); bump(`${m} -> ${n}`);
    return n;
  });
  for (const [re, to] of HEADINGS) {
    out = out.replace(re, (...a) => { notes.push('heading December reality -> Season reality'); bump('heading December reality -> Season reality'); return a[0].replace(/December reality/, 'Season reality'); });
  }
  if (out !== text) {
    changedNotes++;
    if (!DRY) fs.writeFileSync(f, out);
    console.log(`${DRY ? 'WOULD CHANGE' : 'changed'} ${rel}: ${[...new Set(notes)].join(', ')}`);
  }
}

console.log(`\n${DRY ? 'Dry run: ' : ''}${changedNotes} note(s) ${DRY ? 'would change' : 'changed'}, ${skipped} skipped, ${files.length} checked.`);
for (const [k, v] of Object.entries(totals).sort()) console.log(`  ${k}: ${v}`);
if (!changedNotes && !skipped) console.log('Nothing to do: already on version 0.2 names.');
process.exit(skipped ? 1 : 0);
