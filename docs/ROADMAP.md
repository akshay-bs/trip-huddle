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
- [x] (v0.3.0) One shared checker at `scripts/validate.mjs` (the old `skills/add-place/scripts/validate.mjs` still runs it). It learns the note types, properties and value lists from the vault's `Templates/` folder, and reads `map_box`, `regions`, `folders` and `decision_values` from `trip.md`. It checks Day, Food, Source, Route and Transport notes too. `node scripts/test.mjs` runs every check.
These are still specific to the original trip:

| Where | Hardcoded | Generalize to |
|---|---|---|
| `Templates/Location.md`, `types.json`, `Locations.base`, validator | `december_verdict`, `december_note`, the "December reality" section | `season_verdict`, `season_note`, "Season reality". Migrate the example notes with a script |
| `Templates/Location.md` FIELD GUIDE | `state: Assam \| Meghalaya`, the `nearest_base` and `category` lists | Values read from Trip facts, or open lists |
| `Templates/Stay.md`, `Stays.base`, `types.json` | `parking_for_tempo_traveller` | `parking_for_group_vehicle` |
| `Bases/Stays.base` | `cost_per_family = est_total_inr / 4` | Divide by a number of cost-sharing units from Trip facts. Bases formulas can't read another note, so this may need a per-vault value set at setup |
| `Templates/Day Plan.md`, `Itinerary.base` | `daylight_hrs: 9.5`, Meghalaya sunrise and sunset times | Set from the destination and dates at setup. `plan-day` now works sunrise, sunset and `daylight_hrs` out per date and place; the `trip.md` values are only its fallback |
| `validate.mjs` | Coordinates must be inside an Assam/Meghalaya box (lat 24–28.5, lng 89–97) | A bounding box from Trip facts, or skip the check when none is set |
| `Templates/Stay.md` | `_inr` property names, ₹ in Bases | A currency set at setup, or keep `_inr` and document it |
| `SKILL.md` | December-specific advice (thin waterfalls, fog, Christmas crowds) | Seasonal guidance written from Trip facts |

**Trip facts as config.** `00 Home.md` → Trip facts is now free text that the skill reads. Consider a `Trip.md` note with frontmatter (destination, start and end dates, fixed or flexible, arrival and departure, group size, families or cost units, age bands, mobility, vehicle, season, currency, bounding box) that the skills and validator can read reliably.

**A `new-trip` setup skill.** It asks the Trip facts questions, copies `vault-template/` into a new folder, fills in Trip facts, and sets the values that can't be read at runtime (cost units, daylight hours).

## Phase 3: more skills from the original trip
These were done by hand on the original trip and could each become a skill:
- [x] (v0.4.0) **`add-source`**: take in an itinerary, agency quote or hotel list, create the Source note, then hand each item to `add-place`. The checker also warns when a Source note is `processed` with unticked checklist lines.
- [x] (v0.8.0) **`compare-itineraries`** (see [PLAN-compare-itineraries.md](PLAN-compare-itineraries.md)): a short Comparison note for 2 or more options (Source notes and/or Route notes): a side-by-side table (nights, must-see places covered, driving, after dark, stays, cost per cost-sharing unit, what is not said), a bottom line with reasons, the trade-offs and what to ask before deciding. No scores or weights. It reuses the travel-time check in Source mode. On a decision it marks the chosen Route note `agreed` (or makes one from the chosen Source) and offers `plan-day`; it never changes a place decision or rewrites a day. New note type `comparison` (`Templates/Comparison.md`, kept in `Sources/`), checked by the validator. A vault made before 0.8.0 needs the template and four types added; the skill asks first.
- [x] (v0.8.0) **`planning_limits` in `trip.md`**: `slack_ok_hrs` (1.5), `dark_drive_tight_min` (30), `late_finish_min` (60) and `max_drive_hrs_day` (6) are defaults the group changes while planning. `plan-day`, `review-travel-times`, `sun.mjs`, `travel.mjs` and the checker read them from `trip.md` (through `scripts/trip-settings.mjs`). The Itinerary base cannot read `trip.md`, so `trip-init` writes `slack_ok_hrs` into its formula.
- [x] (v0.7.0) **`review-travel-times`** (see [PLAN-travel-times.md](PLAN-travel-times.md)): check each leg three ways (map time, a typical speed for the road type, local reports), add time for stops, compare the day with sunset, and give an ok / tight / too much verdict for each Day note or for a Source itinerary. Day notes get `travel_checked` and `travel_verdict`; `trip.md` gets optional `road_speeds` and `stop_buffer`; the checker warns when `travel_verdict` is better than the slack verdict. It proposes fixes and hands the chosen one to `plan-day`; it never rewrites a day itself. A vault made before 0.7.0 needs the two Day Plan properties added by hand (the skill says which).
- [x] (v0.5.0) **`plan-day`**: build Day notes (legs, schedule, meals, backup plan) with real sunrise and sunset worked out for the date and place (`skills/plan-day/scripts/sun.mjs`), pre-dawn starts counted separately, and the slack between daylight, driving and activity time with an ok / tight / too much verdict. Drive times are written as researched estimates with their basis; they are not verified on the road (see the open item on unverified values in Phase 1).
- [x] (v0.6.0) **After dark** (see [PLAN-after-dark.md](PLAN-after-dark.md)): places get `best_time_of_day` (a list), `after_dark` and `after_dark_note`; `trip.md` gets `evening_bases`; Day notes get an After dark column on the legs, a *Choices that bend the rules* section and `rule_bends`. `plan-day` uses them as guidelines and asks before breaking one for a `must` place; the checker warns when a Day breaks one without recording it. The 60 example places have the fields empty: filling them in is a research job for `add-place`.
- **`driver-brief`**: a printable brief or PDF of the route, with the questions for the driver.
- [x] (v0.10.0) **`group-decisions`** (see [PLAN-group-decisions.md](PLAN-group-decisions.md)): gathers what the group still has to decide (the home page's open questions, undecided Comparison notes, places and stays still `considering`, stays not yet booked, unprocessed Sources), keeps Decision notes (new note type `decision`, `Templates/Decision.md`, kept in `Decisions/`, with `Bases/Decisions.base` views Open, Decided and Locked), refreshes the home page's open questions and budget snapshot per cost-sharing unit, and summarises by deadline. A decision is `open`, `decided` or `locked`; a locked one ("flights booked" locks dates, arrival and departure) is a hard rule that `plan-day`, `review-travel-times`, `compare-itineraries`, `add-place` and `add-source` read first, never plan against and ask about. `trip.md` gets `stage: planning | booking | travelling | after`. The checker checks Decision notes and warns about a few conflicts it can read. It never decides for the group and asks before unlocking. A vault made before 0.10.0 needs the template, base, folder and home sections added; the skill asks first.

## Phase: booking and beyond
The group is moving from planning into booking, then travelling, then home. Decisions harden along the way (see `stage` in `trip.md` and the locks in [PLAN-group-decisions.md](PLAN-group-decisions.md)). These are planned, in this order.
- [ ] **Booking task list** (next up): a checklist of everything to close before travel, e.g. flight or train booking, a car for the whole trip at the destination, jeep or safari bookings, reservations or permits for selected tourist spots, and anything else that comes up. Each task has a deadline, a status, a cost, and a link to the Decision it locks when done: closing a booking task locks that decision. The Decision note is built for this: `locks` is the shared list of what a task fixes, `locked_by` can later link to the task, and `deadline` means the same on both.
- [ ] **Booking deadlines**: cancellation cut-offs and payment due dates, shown with the booking tasks and the open decisions in one by-deadline view.
- [ ] **Travelling**: a plan for today, and a quick re-plan of the remaining days when something slips, keeping what is locked.
- [ ] **After travel**: an expense log with who paid what and a settle-up per family (not a full bill-splitting app), and a "would we go again" note on places.

## Phase 4: publish and polish
- Screenshots of the Bases views (To decide, Booking tracker, Cards, Map) in the README
- A CHANGELOG, and tagged releases (`v0.1.0`, `v0.2.0` after Phase 2)
- A short demo: from a pasted friend's message to finished notes
