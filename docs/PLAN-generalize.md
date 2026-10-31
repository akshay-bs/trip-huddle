# Plan: make trip-huddle work for any trip

Goal: someone with a different trip (a couple in Lisbon, 3 families in Kerala, a school group in Japan) installs the plugin, runs `trip-init`, answers a short interview, and gets a working vault. Every skill after that reads the trip's facts from one place instead of from hardcoded text.

## What the audit found

- The validator already finds the vault correctly. It uses the `TRIP_VAULT` setting or the current folder (`validate.mjs:8`). SKILL.md already calls it through `${CLAUDE_PLUGIN_ROOT}` (`SKILL.md:98`). The "fix you can't skip" is done, but it is not tested yet: the plugin install has never been run in Claude Code or Cowork (`ROADMAP.md:10-11`).
- No `D:\Obsidian` path is left in the repo.
- Things still tied to this trip:

| Item | Where | Change to |
|---|---|---|
| `december_verdict`, `december_note`, "December reality" heading, "December-worthy" view | Location.md, types.json, Locations.base, SKILL.md, agent-prompt.md | `season_verdict`, `season_note`, "Season reality", "Season-worthy" |
| `parking_for_tempo_traveller` | Stay.md, types.json, Stays.base | `parking_for_group_vehicle` |
| `/ 4` per-family cost, "Per family ₹" | Stays.base:6-13 | Split count and label taken from the trip config |
| `_inr` fields, ₹ signs, `UPI` | Location, Stay, Food Spot, Bases | `entry_fee`, `price_per_night`, `est_total`, etc. Currency comes from the config |
| `state: Assam \| Meghalaya`, base towns, category list | Location.md:44-46, Stay.md:49 | Lists come from the config |
| Map box `lat 24–28.5, lng 89–97` | validate.mjs:134-140 | Box comes from the config. Skip the check if there is none |
| `daylight_hrs: 9.5`, 07:00 start, 16:30 sunset | Day Plan.md:11-36 | Defaults come from the config |
| Teens, 17-seater, mountain roads, Guwahati route comment | Location, Day Plan, Stay, Source templates, SKILL.md | Neutral wording, or blocks filled in at init |
| `decision` values, folder names, the "only Home in root" rule | validate.mjs:77-80, 144, 174 | Read from the config, with today's values as defaults |

- Gaps: there are no templates for `Itinerary/Route.md` or `Logistics/Transport.md`, even though notes link to them. The validator only checks Locations and Stays. Food Spot has no folder, no Base and no skill.

## Phase 0: Prove the install works (half a day)

1. Install the plugin from GitHub in Claude Code and in Cowork.
2. Run `add-place` in a copy of the example vault. Confirm `${CLAUDE_PLUGIN_ROOT}` resolves and the validator runs.
3. Confirm the subagents that `add-place` uses for parallel research work in Cowork. If they don't, add a one-at-a-time fallback.
4. Write down the results in ROADMAP.md.

This comes first because every later skill depends on the same install and script setup.

## Phase 1: One trip config file (1 day)

Add `trip.md` at the vault root. It has properties only, so Obsidian shows it as a form and skills can read it.

```yaml
# Made-up example trip, not the real one
trip_name: Portugal road trip
start_date: 2027-06-05
end_date: 2027-06-14
arrival: Lisbon (LIS)
travellers: 6
cost_split_units: 3          # families, couples, or 1 per person
cost_split_label: couple
traveller_notes: "one person can't do long climbs"
group_vehicle: hired 7-seat van
currency: EUR
currency_symbol: €
season: June
daylight_hrs: 15
day_start: "08:00"
sunset: "21:05"
regions: [Lisbon, Alentejo, Algarve]
bases: [Lisbon, Évora, Lagos]
categories: [beach, viewpoint, old-town, castle, winery, ...]
map_box: {lat_min: 36.9, lat_max: 39.0, lng_min: -9.6, lng_max: -7.4}
```

- The validator, the skills and the init skill all read this file.
- Bases can't read another note's properties. So `trip-init` writes the numbers (the split count, the currency symbol) straight into the `.base` files. It rewrites them again if the config changes.

## Phase 2: Rename fields to version 0.2 (1 day)

- Make every rename in the table above, in the templates, `types.json`, the Bases, the validator, SKILL.md and agent-prompt.md.
- Add `scripts/migrate-0.2.mjs`. It renames properties in an existing vault, so the example vault and the real trip vault both move over safely.
- Rewrite the template comments in neutral wording. Example: "Is it good in your travel season?" instead of "dry in December?".

## Phase 3: A shared validator driven by the templates (1–2 days)

- Move `validate.mjs` to a shared `scripts/` folder that every skill calls.
- Take the note types from the vault's `Templates/` folder instead of a fixed list. Then fields added at init are checked automatically.
- Add checks for Day, Food, Source, Route and Transport notes.
- Take value lists, the map box, folders and decision values from `trip.md`.
- Keep the vault location as the current folder, or a `--vault <path>` option. Never work it out from where the script is stored.

## Phase 4: `trip-init` skill (2 days)

### Interview
Ask in small groups, with defaults the person can accept:

1. **Basics:** trip name, dates, start and end point, vault folder.
2. **People:** how many people, how costs are split (families, couples, each person), ages or mobility needs that affect walking and pace.
3. **Getting around:** vehicle type (self-drive car, hired van, public transport, on foot). This decides the parking field and the travel-time defaults.
4. **Place and season:** country and regions, likely bases, season. Claude suggests daylight hours, sunset time and a map box, and the person confirms them.
5. **Money:** currency.
6. **What matters:** pick extra fields to keep or drop. Examples: heating and hot water (cold trips), veg food, kid-friendly, wheelchair access, visa or permits, dive or ski conditions.

### What it creates
- Copies `vault-template/`, including the hidden `.obsidian/` and `.claude/` folders.
- Writes `trip.md`.
- Fills in the templates. It adds or removes optional field blocks and sets value lists and defaults.
- Writes the numbers into the `.base` files.
- Fills in `00 Home.md` with the trip facts and the first open questions.
- Creates `Itinerary/Route.md` and `Logistics/Transport.md` from new templates.
- Runs the validator on the empty vault, then gives a short "next steps" list. Example: "paste a friend's itinerary, and I'll run add-source".

### Other modes
- **Change settings:** `trip-init --reconfigure` edits `trip.md` and rewrites the templates and Bases without touching the notes.
- **Templates:** optional field blocks live in `skills/trip-init/field-packs/`, for example `cold-weather.yaml`, `kids.yaml`, `self-drive.yaml`, `accessibility.yaml`. This keeps template changes as data instead of free-form edits.

## Phase 5: Turn the hand workflows into skills (in this order)

| Skill | Input | Output | Why this order |
|---|---|---|---|
| `add-source` | Pasted itinerary, quote, hotel list, link | A Source note, then `add-place` for each place | Every other workflow starts from sources. Split it out of `add-place` step 1 |
| `plan-day` | Chosen places, stay, date | Day notes with legs, drive time, and slack (daylight − driving − activities). Sets `scheduled_day` on places | The core of the itinerary |
| `review-travel-times` | Day notes or an itinerary option | A verdict for each day (ok / tight / too much), with fixes | Uses `plan-day` data |
| `compare-itineraries` | 2+ Source or option notes | A comparison note: nights per base, day by day, places, pace, cost, bottom line, what to confirm | Used to pick between two route options |
| `group-decisions` | The whole vault | Updates the Home page's open questions, inbox and budget snapshot | Run after any of the above |
| `driver-brief` | Route, Day notes, stays | A printable PDF: daily legs, stops, timings, contacts, questions for the driver | Last. It needs everything else finished |

- Each skill has the same layout: `SKILL.md`, `references/`, and a call to the shared validator.
- Bring the logic over from the original trip vault's real notes. The repo's example vault doesn't have comparison, review or day notes yet. **I need those notes, or permission to read the original vault, to build these skills well.**

## Phase 6: Prove it works on a second trip (1 day)

- Make a small second example vault with very different facts. For example: a couple, Portugal, euros, self-drive car, summer, splitting costs 1 way, no heating fields.
- Add a test script that runs `trip-init` answers from a file, then runs the validator on both example vaults.
- Update README, ROADMAP and CLAUDE.md. Raise the plugin version to 0.2.0 in both manifest files.

## Done when

- A new person with no access to the original trip can go from installing the plugin to a valid, filled-in vault for their own trip in under 15 minutes.
- Searching the plugin files (not the example vault) for `december`, `tempo`, `inr`, `Assam` or `/ 4` finds nothing.
- Both example vaults pass the validator with 0 errors.

## Open decisions

1. Should the trip config be `trip.md` (an Obsidian form, easy to edit by hand) or a hidden JSON file? I recommend `trip.md`.
2. Should money fields drop the currency suffix (`entry_fee` plus `currency` in the config)? Or keep a suffix (`entry_fee_eur`)? I recommend dropping it.
3. Where are the original comparison, review and day notes for Phase 5?
