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
These are still specific to the original trip:

| Where | Hardcoded | Generalize to |
|---|---|---|
| `Templates/Location.md`, `types.json`, `Locations.base`, validator | `december_verdict`, `december_note`, the "December reality" section | `season_verdict`, `season_note`, "Season reality". Migrate the example notes with a script |
| `Templates/Location.md` FIELD GUIDE | `state: Assam \| Meghalaya`, the `nearest_base` and `category` lists | Values read from Trip facts, or open lists |
| `Templates/Stay.md`, `Stays.base`, `types.json` | `parking_for_tempo_traveller` | `parking_for_group_vehicle` |
| `Bases/Stays.base` | `cost_per_family = est_total_inr / 4` | Divide by a number of cost-sharing units from Trip facts. Bases formulas can't read another note, so this may need a per-vault value set at setup |
| `Templates/Day Plan.md`, `Itinerary.base` | `daylight_hrs: 9.5`, Meghalaya sunrise and sunset times | Set from the destination and dates at setup |
| `validate.mjs` | Coordinates must be inside an Assam/Meghalaya box (lat 24–28.5, lng 89–97) | A bounding box from Trip facts, or skip the check when none is set |
| `Templates/Stay.md` | `_inr` property names, ₹ in Bases | A currency set at setup, or keep `_inr` and document it |
| `SKILL.md` | December-specific advice (thin waterfalls, fog, Christmas crowds) | Seasonal guidance written from Trip facts |

**Trip facts as config.** `00 Home.md` → Trip facts is now free text that the skill reads. Consider a `Trip.md` note with frontmatter (destination, start and end dates, fixed or flexible, arrival and departure, group size, families or cost units, age bands, mobility, vehicle, season, currency, bounding box) that the skills and validator can read reliably.

**A `new-trip` setup skill.** It asks the Trip facts questions, copies `vault-template/` into a new folder, fills in Trip facts, and sets the values that can't be read at runtime (cost units, daylight hours).

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
