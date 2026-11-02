---
name: plan-day
description: Plan the days of a trip in a trip-huddle Obsidian vault. Builds Day notes from the places and stays the group has chosen, with legs, drive times, a schedule, meals, a backup plan, real sunrise and sunset, and the slack between daylight and the day's driving and activities. Use whenever the user asks to plan, build, draft, redo or check a day or the days ("plan Day 3", "lay out the days", "can we fit these places into Tuesday", "is this day too much"). It sets scheduled_day on the places it uses.
---

# Plan the days of the trip

A Day note answers one question: can this group do this day, in the daylight it has? This skill builds the note for one day, or for a run of days, from places and stays that already have notes.

The vault root is the current working directory.
**Pipeline:** read the trip → pick the days and their places → sun times → legs → schedule → slack and verdict → write the Day note → set `scheduled_day` → validate → report.

## 1. Read the trip
- Read `trip.md`: `group_vehicle`, `travellers`, `traveller_notes`, `pace`, `season`, `bases`, `evening_bases` (the bases where evenings out are easy; may be empty), `start_date`, `end_date`, and the fallback `daylight_hrs`, `day_start` and `sunset`. Read **Trip facts** in `00 Home.md`. Everything about the group, the vehicle and the season comes from here. Never assume it.
- Read `Itinerary/Route.md` (base towns and nights, in order) and `Logistics/Transport.md` if they exist. Transport has the daily limits (`max_hrs_per_day`, `max_km_per_day`). **Flights, trains and transfers belong in the Logistics notes:** link to them from the Day note (arrival and departure days), and never copy flight numbers or booking details into it.
- Read `Memories/MEMORY.md` for anything about timing. Two defaults apply unless a memory says otherwise: **fixed dates are fixed**, and **the group decides** (this skill never sets `selected` or `dropped`).
- Read `Templates/Day Plan.md`. **The template is the schema:** use its property list, property order and section names. If the template has changed, follow the template, not this skill.
- Everything you create stays inside the vault. Scratch files go in `.claude/scratch/` and get deleted at the end.

## 2. Pick the days and their places
- **Which days:** one day ("plan Day 3"), or a run ("plan the days"). Number days from the first day of the trip: `Day 01`, `Day 02`. Work out each day's date from `start_date` and the Route. If the date is unknown, ask once. If it still isn't known, plan with the `trip.md` defaults, leave `date` empty and say so in the report.
- **Existing Day note:** update it in place. Keep what the user wrote by hand (Notes, meals they chose). Never make a second note for the same day.
- **Which places:** Locations with `decision: selected` that belong to the day's base area (`nearest_base`, coordinates), plus any place the user names. A place the user names that is still `considering` can go in; say so in the report. Do **not** change `decision`. A `season_verdict: skip` place stays out unless the user insists.
- **Which stay:** the Stay with `decision: selected` for that night, or the one the user names. If none is chosen, write `stay:` empty, put the candidates in Notes ("Stay tonight, not chosen yet: [[A]], [[B]]") and never invent a booking.
- **A run of days:** spread the places across days before detailing any day. Follow the Route order; keep each day in one area; give `priority: must` places the best slots; put the heavy days where the group is rested; keep arrival and departure days light (room for the transfer, check-in or check-out, and a buffer for the airport or station). Do the days in order, because one day's end base is the next day's start.
- **Selected places that don't fit** (wrong direction, needs sunrise, closed that weekday, no room): leave them off the day, name them under Notes as "Didn't fit: …" with the reason, and say which day could take them. A `must` place is never left off silently: see the rules in section 5.
- **Include an "on the way" place only if it is on the day's road** (it adds under about 20 minutes to the day's drive). A detour is a stop of its own.
- Read each place's note: `time_needed_hrs`, `best_time_of_day` (a list), `after_dark` (good | fine | avoid, may be blank), `after_dark_note`, `opening_hours`, `closed_days`, `season_verdict`, `season_note`, `difficulty`, `group_fit`, `last_mile`, `permits`, `walk_distance_km`.

## 3. Sunrise, sunset and daylight
Never type `daylight_hrs` by hand and never stretch it to cover a long day. Work it out for the date and the day's base:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/plan-day/scripts/sun.mjs" times --date 2027-06-09 --lat 37.10 --lng -8.67 --tz Europe/Lisbon
```
- **Coordinates:** the stay's `location` if it has one, else the base town (look it up, 2 decimals are enough). Sun times barely change over a day's drive.
- **Time zone:** the IANA name for the place (`Europe/Lisbon`), or `--utc-offset 5.5`. The script changes it for daylight saving on that date. Don't guess an offset.
- **Result:** JSON with `weekday`, `sunrise`, `sunset`, `first_light` and `last_light` (civil twilight), and `daylight_hrs`. Copy `sunrise` and `sunset` into the note as quoted `"HH:MM"` and `daylight_hrs` as given. Use `weekday` for the weekday in the H1 and for the closing-day check. It is accurate to about 1–2 minutes. A polar day or night comes back as `polar` with no times: tell the user and plan by hand.
- **Fallback:** with no coordinates, leave out `--lat` and `--lng`. The script uses `daylight_hrs` and `sunset` from `trip.md` and says `source: trip.md season defaults`. Write that in the note's "Daylight and slack" line, and tell the user these are the trip's rough defaults, not this date. They are often lower than real daylight, because they describe a usable day.
- **Early starts:** if the day begins before sunrise (a sunrise viewpoint, a safari, a long first drive), set `early_start: "HH:MM"`. `daylight_hrs` stays the real daylight. The drive and activity hours that happen before sunrise go in `predawn_hrs`. They are counted separately and do not use up daylight. Say so in the "Daylight and slack" line. Don't schedule early starts on two days running unless the user asks. Give the day after one a rest block.

## 4. Legs and drive times
- Order the stops to avoid backtracking. One row per leg: from, to, km, drive time, **after dark**, road notes. After dark is `ok` for a lit highway or city streets, and `avoid` for an unlit, forest, hill or bad-surface road. A leg is judged for how it would be after sunset, even when the plan drives it by day.
- **Drive times are researched estimates, never verified facts.** Research each leg (a routing site or OpenStreetMap routing, local reports, the place notes' `last_mile`). Write a **range** in hours (`1–1.5 hrs`), not a single figure. Add a margin for hill, village, rural or unpaved roads and for known traffic.
- Under the table write `*Drive times are researched estimates, not checked on the road. Basis: …*` and say what they were based on (for example "a routing site's free-flow time plus 25%", or "straight-line distance × 1.4 at 40 km/h, no routing site reachable"). If a driver or the user checked a time, say who. Mention in the report any leg you could only guess.
- **Road notes:** the surface, narrow or unpaved stretches, and **whether the group vehicle** (`group_vehicle` in `trip.md`) **can use the road**. For self-drive trips, say what the driver should know (steep, no barriers, no fuel).
- `drive_hrs` is the sum of the **upper** end of each range (the cautious number). Compare it to `max_hrs_per_day` and `max_km_per_day` in the Transport note. The checker warns if it is over.

## 5. The schedule
Fill the Schedule table (time, what, notes). Put `[[wikilinks]]` on places.
- **Default rules for daylight and evenings.** These are guidelines. Groups bend them for things they love, and that is allowed as long as the plan says so (see *When a plan only works by breaking a rule*).
  1. **A day trip out of an `evening_base` is back on an `ok` road by sunset.** The rest of the drive can run after dark only if every remaining leg is `ok`. A day that ends at a base outside `evening_bases` (a village, a forest stay) has no evening plans, and its last drive is over within an hour of sunset.
  2. **A place with `after_dark: avoid` is left by sunset** (30 minutes before is better; never later than `last_light`). Outdoor stops and viewpoints with a blank `after_dark` follow the same rule, because blank means unknown.
  3. **Evenings go to `evening_bases`.** Places with `after_dark: good` or `best_time_of_day: [evening]` or `[night]` are planned after sunset, marked "after dark", and **left out of `activity_hrs`**. Dinner out and an evening walk in an evening base need no bend.
  4. **A place with `best_time_of_day: [sunrise]` sets an `early_start`** (see section 3).
- **When a plan only works by breaking a rule** (a place that has to be left after sunset, an `avoid` leg driven after dark, an evening somewhere that is not an `evening_base`):
  - For a `priority: must` place, or one the user named: **ask**, briefly, before writing the note: "Seeing X means driving 1 hr of forest road after dark. Do it anyway, move it to another day, or drop it?" Offer the move first when a lighter day could take it.
  - If the user says do it: write it under **Choices that bend the rules** in the form `- **<what>.** Why: <reason>. Cost: <what it costs, e.g. 15 min on city streets after dark>.` and set `rule_bends` to the number of lines. Say it in the verdict: "tight: 1 rule bend, see below". Never hide a bend.
  - For a `maybe` or `should` place that was not named: move it to a better day, or leave it off, **without asking**. List it under Notes → "Didn't fit: <place> (<reason>; could go on Day N)".
  - **Never quietly drop a `must` place.** It is either in the plan (by the rules, or as a recorded bend), moved with the user's say-so, or dropped because the user said so.
- **Opening hours and closing days:** check each place's `opening_hours` and `closed_days` against the weekday of the date. If a place is closed that day, don't schedule it. Offer a swap.
- **Book ahead:** timed entries, safari or boat slots, guides, permits and group meals go under Notes → **Book ahead**. Write "book early" when the trip falls in a busy period (school holidays, festivals, peak season; check `season` and the place notes). Add a line to **Open questions for the group** in `00 Home.md` for anything the group must book or decide.
- **Pace and people:** judge the day against `pace`, `traveller_notes` and each place's `group_fit` and `difficulty`. If part of the group can skip a place and wait, say so in Notes.
- **Season:** cite the place's `season_note` where it changes the plan (low water, closures, fog, heat at midday).
- **Walking:** `total_walk_km` is the sum of the places' `walk_distance_km` (round trip) plus walks the schedule adds, such as town walks.
- `activity_hrs` is the time at the day's places (`time_needed_hrs`) plus meals and rests. Count daylight time only. Leave a free hotel rest out.
- The first row is the day start and the last row is sunset (the template has both). Change them to this day's real times.

## 6. Slack and verdict
Slack is the daylight left over: **daylight − (drive + activity − predawn)**, in hours. Get the number and the verdict from the script, so the thresholds live in one place:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/plan-day/scripts/sun.mjs" slack --daylight 14.7 --drive 2.3 --activity 10 --predawn 1.3
```
| Slack | Verdict | Meaning |
|---|---|---|
| 1.5 hrs or more | **ok** | Room for a late start, a slow lunch or a closed road |
| 0 to under 1.5 hrs | **tight** | It works only if nothing slips. Say what to drop first |
| below 0 | **too much** | More than the daylight allows. Don't leave it as is |

The Itinerary base shows the same slack and verdict (its formula uses the same 1.5 and 0). Also say **tight** if the day only works by driving an `avoid` leg after dark, even when the numbers look fine. The Itinerary base adds the number of bends to the verdict (for example "tight (1 rule bend)").

**When it is tight or too much, say what to cut or move.** Offer fixes in this order, with the saving for each:
1. Move a `maybe` or `should` place to a lighter nearby day, or to the departure day.
2. Drop the place with the lowest `priority` that is furthest off the day's road.
3. Shorten the time at a place whose `season_verdict` is only ok, or that the group can see from the road.
4. Take out a stop that needs a backtrack, or swap the order to remove one.
5. Use an early start (set `early_start` and `predawn_hrs`) to move driving before sunrise, only if the group agrees.
6. Change where the day ends (a base closer to tomorrow's places).

Apply the fix when the user asked you to plan the day, then recompute. Keep a dropped place under Notes with its reason. Never mark it `dropped` in its own note. If the fix means a change to the Route (a different base), suggest it and leave `Itinerary/Route.md` alone.

## 7. Write the Day note
File: `Itinerary/Day 03.md` (the folder is `folders.day` in `trip.md`, default `Itinerary`). Start from the template: every property in template order, the FIELD GUIDE comment block kept, `{{title}}` replaced.
- **Properties:** `day` (number), `date`, `start_base`, `end_base`, `stay: "[[Stay note]]"`, `locations` (quoted wikilinks), `early_start`, `sunrise`, `sunset` (quoted `"HH:MM"`), `daylight_hrs`, `drive_hrs`, `activity_hrs`, `predawn_hrs`, `total_walk_km`, `rule_bends` (the number of lines under *Choices that bend the rules*; 0 if none). Plain numbers only, no units. Leave unknowns blank. `tags` keeps `day`.
- **Heading:** `# Day 03 · Thu 17 Jun · <the day in a few words>` (the weekday comes from the script).
- Under it, one line on the shape of the day and a link to the Route (or itinerary) note it belongs to.
- **Daylight and slack:** `sunrise …, sunset …, … hrs of daylight (computed for <base>, <time zone>). Drive … + activity … − … hrs before sunrise = … hrs. Slack … hrs: **ok**.` For the fallback case say `(trip.md defaults, not worked out for this date)`.
- **Legs, Schedule, Meals** (where each meal happens; note where there are few options after dark), **Backup plan** (a weather, closure or delay case, each with a concrete swap), **Choices that bend the rules** (write `- None.` when there are none), **Notes** (the stay or candidates, **Book ahead**, places that don't fit and why).
- A complete made-up note is in `${CLAUDE_PLUGIN_ROOT}/skills/plan-day/references/day-example.md`. Match its shape.

## 8. Set `scheduled_day` on the places
For each Location in the day's `locations`, set `scheduled_day: "[[Day 03]]"` (a quoted wikilink). If a place was on this day before and is not any more, clear it. Change nothing else in a Location note.

## 9. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
It checks the Day note against the template (properties, order, number types) and warns when `sunrise`, `sunset` and `daylight_hrs` disagree, when the Schedule puts an `after_dark: avoid` place (or a drive on an `avoid` leg) after sunset while `rule_bends` is 0, when `rule_bends` does not match the lines under *Choices that bend the rules*, when `early_start` is not before sunrise, when `drive_hrs` is over the Transport limit, and when the day has no slack. Fix every error in the notes you wrote. Report problems in older notes; don't silently rewrite them.

## 10. Report to the user
Keep it short:
- A table: day | date | route | sunrise–sunset | drive | activity | slack | verdict.
- For each tight or too-much day: what you cut or moved, or what you suggest.
- What the times are based on: computed sun times or the `trip.md` defaults, and which drive times are guesses.
- Book-ahead items, places left off and why, and the stay still to choose.
- Anything you changed in Home's open questions.
