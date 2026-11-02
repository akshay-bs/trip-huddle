---
name: trip-init
description: Set up a new trip-huddle Obsidian vault for a specific trip, or change an existing vault's trip settings. Use when the user wants to start planning a new trip, create or initialise a trip vault or folder, "set up trip-huddle", or change trip-wide facts such as dates, group size, cost split, vehicle, currency, season or regions ("we're now 5 families", "we switched to self-drive", "re-run trip-init settings").
---

# Set up a trip vault

A short interview, then a script does the file work. You never hand-edit templates or Bases in this skill: the script does it from the answers, so every vault comes out the same.

**Pipeline:** pick the mode → interview → confirm → write answers → run the script → check → next steps.

## 0. Pick the mode
- **New vault:** the working directory has no `trip.md`. Ask where the vault should go if the user hasn't said. The folder must be empty or not exist yet. Never set up a vault inside another vault, or on top of existing files.
- **Change settings:** the working directory has a `trip.md`. Read it, show the current values as defaults, and only ask about what the user wants to change. Notes are never touched in this mode; only `trip.md`, the templates, the Bases and the Trip facts in `00 Home.md`.
  - **A vault made before 0.9.0 has no restaurants-and-cafes category** (no `Bases/Food.base`, and the Food Spot template has no `kind` or `meal`). If `Bases/Food.base` is missing, tell the user what is new (a `Food/` folder, a Food Base with a "To decide" view and a map, a "Food to decide" section on the home page, and `kind`, `meal` and `scheduled_day` on the Food Spot template) and **ask before adding it**. On a yes, add `--add-food` to the script in step 4. It only adds files and sections; it touches no notes. On a no, change nothing and don't ask again in this session.
  - **A vault made before 0.11.0 has no booking list** (no `Bases/Bookings.base`, no `Templates/Booking.md`). If they are missing, tell the user what is new (a *Bookings* list on the home page made from what the group selected, booking fields on stays, the vehicle and places that need tickets or permits, a `Bookings/` folder for flights, trains and insurance, and a `Confirmations/` folder for vouchers) and **ask before adding it**. On a yes, add `--add-bookings` to the script in step 4, then run the note migration from the vault folder: `node "${CLAUDE_PLUGIN_ROOT}/skills/group-decisions/scripts/migrate-bookings.mjs"` (it only adds empty fields to existing notes, and is safe to run twice). On a no, change nothing and don't ask again in this session.
  - **A vault made before 0.12.0 has nothing for building the itinerary** (`Templates/Route.md` has no *Day by day* section, and there is no `Templates/Trip Itinerary.md`). If so, tell the user what is new (route options with a day-by-day table and *What it makes possible / Red flags / What it costs*, a one-page Trip itinerary and an Operator brief for quotes, `start_time`, `backtrack_km` and an *Along the way* section on Day notes, `needs_night_nearby` on places, and two new columns in the Itinerary base) and **ask before adding it**. On a yes, add `--add-itinerary` to the script in step 4, then run the note migration from the vault folder: `node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/migrate-itinerary.mjs"` (it only adds empty fields to existing notes, and is safe to run twice). On a no, change nothing and don't ask again in this session. `road_cutoffs` and `planning_limits.on_the_way_min` come with every change of settings, like the other `trip.md` values.

## 1. Interview
Ask in small groups, one group per message. Offer a sensible default for every question so the user can just say "fine". Accept "don't know yet": leave that value empty, and add it to the open questions.

1. **Basics:** trip name; destination; dates, and whether they're fixed (flights booked) or flexible; where the trip starts and ends.
2. **People:** how many people; how costs are split (per family, per couple, per person) and how many shares; ages or mobility needs that affect walking and pace; food needs.
3. **Getting around:** self-drive car, hired van with driver, public transport, or on foot. This decides the parking field and the travel-time notes. Write the vehicle in words that show its size ("hired 7-seat van with driver", "own car"): the `review-travel-times` skill reads `group_vehicle` to choose car or group-vehicle speeds (a van, bus, coach or anything with 6 or more seats is a group vehicle).
4. **Place and season:** regions or states; likely base towns, and which of those bases are good for evenings out (lit streets, food open late, short trips back to the stay; small villages and forest stays are not) — ask "Which of your bases are good for evenings out?" and leave it empty if they don't know; the season in a word or two (e.g. "December", "monsoon", "summer"). **You suggest** daylight hours, a usual day start, sunset time, and a map box around the regions (rounded to half a degree, a little wider than the regions). The user confirms or corrects them. Say they are estimates.
5. **Money:** currency code and symbol. Suggest from the destination.
6. **What to track:** suggest place categories that fit the destination, and the field packs that fit the answers so far (see `${CLAUDE_PLUGIN_ROOT}/skills/trip-init/field-packs/`, one JSON file per pack, each with a `description` and `suggest_when`). The user picks.

Keep it to these six messages. Don't research places here; that's what `add-place` is for.

## 2. Confirm
Show one short summary of all answers, grouped as above, with the estimates marked. Ask for a yes before writing anything.

## 3. Write the answers
Write the answers as JSON to `.claude/scratch/trip-answers.json` inside the target folder (create the folder). Use exactly the property names in `${CLAUDE_PLUGIN_ROOT}/vault-template/trip.md`. Rules:
- Dates as `YYYY-MM-DD`; times as `"HH:MM"`; `daylight_hrs`, `travellers` and `cost_split_units` as numbers.
- `regions`, `bases`, `evening_bases`, `categories`, `field_packs` as lists. `evening_bases` holds only towns that are also in `bases`. Categories in lowercase with hyphens (`lake-river`).
- `map_box` as `{"lat_min":…, "lat_max":…, "lng_min":…, "lng_max":…}`, or `null`.
- `cost_split_label` singular and lowercase: `family`, `couple`, `person`.
- Unknown values: `""` (or `[]` for lists).
- `road_speeds` and `stop_buffer` are optional settings for `review-travel-times`. Don't ask about them in the interview, and leave them out of the answers unless the user gives them ("our van is slow on hills, 18 km/h"). Shapes: `"road_speeds": {"hill": {"car": 30, "group": 18}}` (road types: motorway, highway, rural, hill, city, track; leave out what stays at the default) and `"stop_buffer": {"min_per_hour": 10, "min_per_stop": 15}`. The script checks them. In the change-settings mode, leaving them out keeps the vault's current values.
- `planning_limits` are the limits the skills plan and judge by, with defaults the group changes as it plans: `"planning_limits": {"slack_ok_hrs": 1.5, "dark_drive_tight_min": 30, "late_finish_min": 60, "max_drive_hrs_day": 6, "on_the_way_min": 20}` (hours of daylight slack for a day to be "ok"; minutes of unagreed driving on a road to avoid in the dark, or after a road cutoff, before a day is "too much"; minutes after sunset a day may end somewhere without evenings out; hours of driving a day before `compare-itineraries` and `build-itinerary` flag it; minutes a stop may add to a day's drive and still be "on the way"). Don't ask about them in the interview. Leave them out, or give only the ones the user wants changed ("we're fine with a 12-hour drive day"): anything left out keeps its current value, or the default in a new vault. The script checks them.
- `road_cutoffs` are areas where nobody drives after a set time (single-track border roads, a forest closed at dusk, a ferry's last run): `"road_cutoffs": [{"area": "Jowai", "no_drive_after": "16:00", "reason": "single-track border roads"}]`. The area is a base town or a `nearest_base`; the time is `"HH:MM"`. Don't ask about them in the interview; give them when the user or the research mentions such a rule ("nobody drives near Jowai after 4"). A new vault gets `[]`. In the change-settings mode, leaving them out keeps the vault's current list; giving them replaces it (`[]` clears it). The script rejects an entry with no area or a bad time.
- `stage` is where the group is now: `"planning"`, `"booking"`, `"travelling"` or `"after"`. Don't ask about it in the interview (a new vault is `planning`). Give it only when the user says the trip has moved on ("we're booking now", "we're on the road"); leave it out and the vault's current value is kept. The script rejects any other word. Changing the stage locks nothing: locks live in the Decision notes (`group-decisions` skill).

## 4. Run the script
From the target folder:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/trip-init/scripts/init.mjs" --answers .claude/scratch/trip-answers.json
```
Add `--reconfigure` in the change-settings mode (and `--add-food`, `--add-bookings` or `--add-itinerary` as well, if the user said yes to the Food category, the booking list or the itinerary building above). The script:
- copies the empty vault (including the hidden `.obsidian/` and `.claude/` folders, and the `Food/` folder and Food Base) when the folder is new,
- writes `trip.md`,
- fills the per-trip values into the templates and Bases (cost split, currency symbol, value lists, day defaults, and `slack_ok_hrs` into the Itinerary base, which cannot read `trip.md`),
- adds or removes the chosen field packs in the templates and `.obsidian/types.json`,
- fills in **Trip facts** in `00 Home.md`,
- with `--add-food`: adds the `Food/` folder, `Bases/Food.base`, the new Food Spot template (with the price band set again), the food checklist in the Source template, the `kind` and `meal` types and the "Food to decide" section on the home page, and leaves anything already there as it is,
- with `--add-bookings`: adds the `Bookings/` and `Confirmations/` folders, `Bases/Bookings.base` (with the cost split filled in), the Booking template, the booking fields in the Stay, Transport and Location templates, their types, the *Bookings* section and budget line on the home page and the bookings rule in `.claude/CLAUDE.md`, and leaves anything already there as it is,
- with `--add-itinerary`: adds the *Day by day* table and the three lists to the Route template, `start_time`, `backtrack_km` and *Along the way* to the Day Plan template, `needs_night_nearby` to the Location template, the Trip Itinerary and Operator Brief templates, their types, the new columns in the Itinerary and Locations Bases and the route step of the home page, and leaves anything already there as it is,
- and prints every file it changed.

If it stops with an error, show the user the error in plain words and fix the answers file. Don't edit the vault by hand to work around it.

## 5. Check
Run the checker from the vault folder:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
It must report 0 errors. Delete `.claude/scratch/` afterwards.

## 6. Report and next steps
Tell the user, in a few short lines:
- where the vault is, and to open that folder in Obsidian as a vault,
- what was filled in, and which values are your estimates to double-check,
- the open questions (the "don't know yet" answers),
- what to do next, e.g. "Send me a friend's itinerary or a list of places, restaurants or cafes, and I'll add them" (the `add-place` skill).
