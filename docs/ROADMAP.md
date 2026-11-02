# Roadmap

v0.1 is a seed: the setup from one real trip, with private details removed. The next step is to make it work for any trip, then turn more of the workflows used on that trip into skills.

## Phase 1: v0.1 seed (this commit)
- [x] `add-place` skill, subagent prompt and validator, with private trip details removed
- [x] Validator finds the vault from the current directory (or `TRIP_VAULT`) instead of its own location, so it works when installed as a plugin
- [x] `vault-template/` (empty starter vault) and `example-vault/` (60 places, 6 stays)
- [x] Plugin manifest and marketplace file
- [x] Test the install from GitHub in Claude Code (2.1.316), against a copy of `example-vault/`: `claude plugin validate .` passes (only warning: no icon), marketplace add and install work, and the installed validator reports 0 errors on the copy
- [x] `${CLAUDE_PLUGIN_ROOT}` resolves in Claude Code: the loaded skill text shows the full plugin cache path, and the command runs as written
- [x] Fixed: the subagent prompt path in SKILL.md now uses `${CLAUDE_PLUGIN_ROOT}` (before, it pointed inside the user's vault)
- [x] Fixed: the validator now prints a clear message instead of crashing when run outside a vault
- [x] Test the same in Cowork: the plugin installs from GitHub, `${CLAUDE_PLUGIN_ROOT}` resolves to the synced plugin folder, the validator reports 0 errors, dedupe works, and `general-purpose` background subagents work (3 new places researched by one agent)
- [ ] Research notes can save estimated coordinates and guessed walk details that still pass the validator. Consider a `coords_verified` field, or a warning when the research says a value is unverified
- [ ] Add a square plugin icon at `.claude-plugin/icon.png`

## Phase 2: make it work for any trip
Done on main (checked against the code and `git log`). Nothing trip-specific is left in the plugin files.

| Where | Was hardcoded | Now |
|---|---|---|
| Location template, `types.json`, `Locations.base` | `december_verdict`, `december_note`, "December reality" | [x] `season_verdict`, `season_note`, "Season reality". `skills/add-place/scripts/migrate-0.2.mjs` moves old vaults over |
| Location template FIELD GUIDE | `state`, `nearest_base` and `category` lists | [x] Written by `trip-init` from `trip.md` (`regions`, `bases`, `categories`) |
| Stay template, `Stays.base`, `types.json` | `parking_for_tempo_traveller` | [x] `parking_for_group_vehicle` |
| `Bases/Stays.base` | cost per family = `est_total_inr / 4` | [x] `trip-init` writes the split count and labels into the Base |
| Day Plan template | `daylight_hrs: 9.5`, sunrise and sunset times | [x] Set from `trip.md` by `trip-init` |
| Checker | Coordinates inside an Assam/Meghalaya box | [x] `map_box` in `trip.md`; the check is skipped when none is set |
| Templates, Bases | `_inr` property names, ₹ in Bases | [x] Plain names (`entry_fee`, `est_total`); the currency symbol comes from `trip.md` |
| `SKILL.md` | December-specific advice | [x] Neutral wording; season facts come from Trip facts |

- [x] **Trip facts as config:** `trip.md` at the vault root holds them as properties.
- [x] **Setup skill:** `trip-init` interviews, copies `vault-template/`, fills in the values, and has a `--reconfigure` mode.
- [x] **Shared checker:** `scripts/validate.mjs` is the one checker every skill calls. It reads the note types, fields, required fields and folders from the vault's `Templates/` folder, and value lists, the map box and folders from `trip.md`. It checks Day, Food and Source notes too. Tests: `node scripts/tests/validate.test.mjs`.
- [ ] Route and Transport have no templates yet. The checker will check them once templates exist.

## Phase 3: more skills from the original trip
These were done by hand on the original trip and could each become a skill:
- **`add-source`**: take in an itinerary, agency quote or hotel list, create the Source note, then hand each item to `add-place`.
- **`compare-itineraries`**: a side-by-side note with nights by base, day by day, places, pace and effort, cost, a bottom line, and what to confirm.
- **`review-travel-times`**: check each leg of a route against maps and local reports, and give a verdict on whether each day is realistic before sunset.
- **`plan-day`**: build Day notes (legs, schedule, meals, backup plan) and work out the slack between daylight, driving and activity time.
- **`driver-brief`**: a printable brief or PDF of the route, with the questions for the driver.
- **`group-decisions`**: keep the home page's open questions current and summarize what the group still has to decide.

## Phase 4: publish and polish
- Screenshots of the Bases views (To decide, Booking tracker, Cards, Map) in the README
- A CHANGELOG, and tagged releases (`v0.1.0`, `v0.2.0` after Phase 2)
- A short demo: from a pasted friend's message to finished notes
