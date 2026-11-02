---
name: build-itinerary
description: Build the trip's route options from the places, stays and base towns a trip-huddle group has chosen, then, once the group picks one, the day-by-day itinerary and a brief for tour operators. Use whenever the user asks to "build the itinerary", "make a route", "what order should we do the towns in", "give us two or three options", "turn our choices into a trip", "should we stay in X or day-trip there", "write the itinerary", "make a brief for the operator", "we need quotes for a van for this plan". It tries the standard order, its reverse, a base change and a big-day version, checks each one for driving, road cutoffs, after-dark driving and doubling back, and hands the side-by-side to compare-itineraries. It never decides for the group.
---

# Build the itinerary

The group has chosen its places, base towns, stays and food spots. Nothing turns those choices into a trip: `plan-day` details one day but needs a Route note, and `compare-itineraries` compares routes someone already wrote. This skill builds **two or three route options from the group's own choices**, each with what it makes possible, its red flags and what it costs; then, once the group chooses, **a day-by-day Trip itinerary and an Operator brief**.

**The lesson it is built on.** On the trip this plugin grew from, every agency sold the same loop, and on that loop the most wanted places (near Jowai, where nobody drives after about 4 pm) kept failing the daylight check. The same loop **in reverse**, with Jowai as a night stop, made them easy: same towns, same places, same nights, only the order changed. So:
1. **Try more than the standard route.** At least the reverse, and a version with a different base. The common route suits agencies, not every group.
2. **Find the hard places first** and build around them.
3. **Pair a short morning with a long drive.** An activity that ends early (a safari, a sunrise point) is a good start to a big travel day.
4. **A hard area is a night stop**, reached by daylight and left in the morning.

**The numbers are for you; the options are for the group.** Work with links, road types, cutoffs and field names, but the Route notes, the itinerary and the chat use plain words, the way plan-day writes *Why this plan*: "Krem Chympe gets a full day; no driving near Jowai after 4 pm", not `after_cutoff_min: 0`. Never paste the script's output or a field list.

Rules that do not bend:
- **The group decides.** Never set `decision` on a place, stay or food spot, never set a Route note to `agreed` yourself (that is `compare-itineraries` or `group-decisions`, after the group says so), and never book anything.
- **Locked decisions are rules.** Read `Decisions/` first. A locked stay, date, arrival, departure, vehicle, route or activity holds in **every** option. An option that would need an unlock is not built; say what it would undo and ask.
- **No scores.** Options get reasons, not points. The group compares them with `compare-itineraries`.
- **Estimates are marked as estimates.** Rough links are straight-line guesses; researched links are a map time, a road type and local reports, not driven. Say which an option rests on.
- **Facts and decisions live apart.** `Logistics/legs.json` holds facts about roads only. What is chosen lives in the notes and is read from them every time.

The vault root is the current working directory. Scratch files go in `.claude/scratch/` and get deleted at the end.
**Pipeline:** read the trip and the locks → links → find the hard places → build 2–3 options → quick check of each → hand to compare-itineraries → when the group chooses: plan every day → Trip itinerary → Operator brief → validate → report.

## 1. Read the trip and the locks
- `trip.md`: `start_date`, `end_date`, `dates_fixed`, `arrival`, `departure`, `group_vehicle`, `travellers`, `pace`, `bases`, `evening_bases`, `day_start`, `daylight_hrs`, `sunset`, `planning_limits` (`slack_ok_hrs`, `dark_drive_tight_min`, `late_finish_min`, `max_drive_hrs_day`, `on_the_way_min`) and `road_cutoffs` (areas where nobody drives after a set time: `{area, no_drive_after, reason}`). Read **Trip facts** in `00 Home.md` and `Memories/MEMORY.md`. Never assume anything about the group.
- **Locked decisions:** every note in `Decisions/` with `status: locked` is a hard rule for every option (see the rules above). A `decided` decision is the group's current choice: follow it, and say so if an option goes against it. From `stage: booking` on, do not move what is booked.
- **The choices:** Locations with `decision: selected` (and their `priority`), Stays and Food notes that are `selected` or `considering`, the selected Transport note in `Logistics/` (its `max_hrs_per_day` is the daily drive limit when set; otherwise `max_drive_hrs_day`). Source notes in `Sources/` with a Day by day are the starting point for "the standard order", never the only option. Existing Route notes in `Itinerary/`: update an option in place rather than making a second one.
- Read `Templates/Route.md`, `Templates/Trip Itinerary.md` and `Templates/Operator Brief.md`. **The template is the schema.** If `Templates/Route.md` has no *Day by day* section, the vault is older than 0.12.0: tell the user what is new (route options with a day-by-day table and three lists, the Trip itinerary, the Operator brief, `start_time`, `backtrack_km` and *Along the way* on Day notes, `needs_night_nearby` on places) and **ask before adding it**. On a yes run, from the vault folder, `trip-init` with `--reconfigure --add-itinerary` (see the `trip-init` skill: it only changes templates, types, Bases and the home page), then `node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/migrate-itinerary.mjs"` (it adds the empty new fields to existing notes; safe to run twice).

## 2. Links: the shared distance file
`Logistics/legs.json` (the folder is `folders.transport` in `trip.md`) holds one **link** per pair of points: `from`, `to`, `km`, `drive_hrs` `[low, high]`, `road` (motorway, highway, rural, hill, city, track), `after_dark` (`ok` or `avoid`), `cutoff_area`, `status` (`rough` or `researched`), `source` and `checked` (a date). A link works both ways. `towns` holds the coordinates of base towns and other points that have no note (an airport, a junction). `plan-day`, `review-travel-times` and `compare-itineraries` read the same file.
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" town --name Jowai --lat 25.45 --lng 92.20
node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" links --road hill
```
- **Towns first.** Save every base town in `trip.md` (and any town an option might use) with `town`. Look the coordinates up (OpenStreetMap or Wikipedia, 2 decimals). `links` lists the bases it has no coordinates for.
- **Rough links for every pair, for free.** `links` adds a rough link for every pair of selected places, stays not dropped and towns: straight-line km × a winding factor for the road type (motorway 1.2, highway 1.25, rural 1.3, hill 1.5, city 1.4, track 1.4), at the trip's road speeds for the vehicle (`travel.mjs config`, `road_speeds` in `trip.md`). `--road` sets the road type rough links use (default `rural`, kept in the file); pick the one most of the trip's roads are. A rough link on a hill, rural or track road is `avoid` after dark. It puts a link in a cutoff area when either end is in that area (a town of that name, or a place or stay whose `nearest_base` or `base_town` it is). **It never overwrites a researched link**, and a second run changes nothing. A new place only adds links.
- **Real links only where a day could use them.** There is no fixed reach. A place P is worth researching for a day from A to B (A = B for a day trip) when the rough `A→P + time_needed_hrs(P) + P→B` fits the trip's own limits:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" candidates --from Jowai --to Dawki
  ```
  It lists the places whose drive (with the stops buffer) is within the drive limit, and whose drive plus time at the place is within the day's daylight minus `slack_ok_hrs`. Each is **on the way** (it adds at most `on_the_way_min` minutes to the A→B drive) or a **detour** (a stop of its own), with the links still to research. So the reach differs by place (a 4-hour trek reaches less far than a 20-minute viewpoint), by trip (motorway or hill roads) and by season (pass `--daylight` from `sun.mjs` for the date; it uses the `trip.md` default otherwise). `--all` also lists what was left out and why.
- **Research those links** as `review-travel-times` does (its section 3: a map time, the road type by stretch, local reports, the cutoff area), then save each one:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" link --from Jowai --to "Krang Suri Falls" --km 30 --hrs 0.75-1 --road hill --after-dark avoid --cutoff-area Jowai --source "map search 2 Nov 2026, hill road, no closures in reports"
  ```
  `link` writes it as `researched` with today's date (or `--checked`), replacing what was there. Never write a figure you did not find: leave the link rough and say so.
- **Facts, never decisions.** No `selected`, no stay name for a night, no "our route". When a hotel falls through the road has not changed, so the file stays right.

## 3. Find the hard places
Before any route, work out what limits the order. Keep this in the scratch folder; do not show it raw.
- **Road cutoffs:** an area in `road_cutoffs`, a place whose `after_dark` is `avoid` because of the road back (`after_dark_note`), a `last_mile` that says "no driving after…", and local reports.
- **Needs a night nearby:** a place with `needs_night_nearby: true`, or one whose time needed plus the drive in and out does not fit one day from any base (`candidates --from <base> --to <base>` leaves it out from every base). Make it a night stop, or say plainly it does not fit.
- **Fixed time of day:** `best_time_of_day: [sunrise]`, a morning safari or boat slot, a market day, `closed_days`.
- **Ends early:** an activity done by late morning frees the rest of the day for a long drive. Put the big travel day after it.
- **Entry and exit:** `arrival` and `departure` (and their times, if known or locked).
- **Base towns not in the list:** if a town that is not in `bases` would solve a hard place (a night near the cutoff area), you may use it, marked "not in your list yet" in the option and in the report. Do not add it to `trip.md`; the group decides.

## 4. Build two or three options
Each option is a Route note, `Itinerary/Route - Option A.md`, `Option B`, `Option C`, from `Templates/Route.md`, `status: draft`. Always **try**:
1. **The standard order:** the order of the Source notes' itineraries, or the obvious loop from the arrival point.
2. **Its reverse.**
3. **A base change:** stay in the hard area instead of day-tripping to it, or the other way round.
4. **A "big day" version**, where it would save a night or fit in a `must` place: one long travel day, said plainly ("about 6 hrs on the road on Day 2, all before the cutoff").

Run the quick check (section 5) on each, drop the ones that are clearly worse (a `must` place lost, a day over the cutoff that the others avoid, the same nights with more driving), and keep **two or three that are really different**. Say in the report which you tried and dropped, in one line each.

Fill each Route note:
- `bases`, `nights_per_base` and `total_nights` (the same number of nights as the trip unless an option says why not), the *Bases and nights* table.
- **Day by day:** one row per day (nights + 1). *Start*: the time of the first drive and where ("07:00, Jowai"). *Main stops*: the places in order as links, `[[A]] → [[B]]`; a town the day passes through can be named too. *End*: where the day's driving ends. *Night*: the base town ("—" on the last day). Use the stop order the check likes: on-the-way places in road order, the hard area in the morning.
- **Why this route:** two or three bullets on the idea of the option.
- **What it makes possible**, **Red flags**, **What it costs:** two or three short bullets each, in plain words, with the day and the amount. Red flags come from the check: a day over the drive limit, a leg after a cutoff or after dark, driving the same road twice ("drives the same 64 km between Shillong and Jowai twice"), a `must` place missed, a night with no stay looked at. What it costs: a long day, a hotel change more, a place left out, more kilometres.
- **Open questions:** what the group has to find out (a stay in a town with none, a road nobody has reported on).

## 5. Quick check of each option
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" check --route "Itinerary/Route - Option A.md"
```
It reads the Day by day table and, for each day, works out the legs from `legs.json` (a rough one when no link is saved), then uses the `review-travel-times` arithmetic (`travel.mjs`): drive hours with stops, when each leg is driven, minutes on an `avoid` road after dark, **minutes driven in a cutoff area after its time**, the slack and the verdict against the trip's daylight. For the trip it gives the kilometres, the days over the drive limit, the cutoff breaks, the after-dark driving, the **doubling back** (the same road driven again on a later leg, and the kilometres it adds; going to a stop and straight back is not counted), the `must` places covered and missed, the nights with no selected or candidate stay, and the links it had to guess. The sun times are the `trip.md` season defaults unless you pass `--sunset` and `--daylight` (from `sun.mjs` for the dates). This is a quick check, not a day plan: `plan-day` and `review-travel-times` do the detail later. Rerun it after every change to an option.

## 6. Show the options
The side-by-side is the **`compare-itineraries`** skill, run on the new Route notes (and any agency Source the group still has in mind). No new comparison format. Invoke it with the options; it writes the Comparison note, recommends with reasons and asks the one question. In your own report, add only what the three lists already say, one line per option. If the options are close, say what decides it.

## 7. Once the group chooses
Only when the user says which option the group chose. `compare-itineraries` (or `group-decisions`) records the choice and sets that Route note `agreed`. Then:
1. **Plan every day:** invoke `plan-day` for the days of the agreed route, in order. It reads the Route's Day by day table and `legs.json`, and writes `start_time`, `backtrack_km` (from the check) and *Along the way* on each Day note.
2. **Write the Trip itinerary** (section 8).
3. **Write the Operator brief** (section 9), and one for another option only if the user asks.
4. **Offer `review-travel-times` once,** in one line.

## 8. The Trip itinerary
`Itinerary/Trip itinerary.md`, from `Templates/Trip Itinerary.md`: `route` (a quoted link to the agreed Route note), `built_on` (today). The whole trip on one page, **made from the Day notes**: it holds no facts of its own, so rebuild it whenever a Day note changes, and never fix a fact here instead of in the Day note. For each day, under `## Day 4 · Wed 9 Jun · <the day in a few words>`:
- **Start:** time and place ("7:30 am, leave the hotel in Jowai").
- **Stops, in order:** arrive and leave times, how long, what you do, as links.
- **Meals:** where and when.
- **Along the way:** what you pass without stopping (from the Day note's section).
- **End:** the night's town and stay, and the arrival time against sunset.
- **Drive:** kilometres and hours; "doubles back about 64 km" when `backtrack_km` is above 0.
- **Detail:** a link to the Day note, for the detail and the reasons.
It must link **every** Day note and **no** dropped place, stay or food spot (the checker warns). A finished example: `${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/references/trip-itinerary-example.md`.

## 9. The Operator brief
`Itinerary/Operator brief.md` (or `Operator brief - Option B.md` for an option that is not chosen yet), from `Templates/Operator Brief.md`: `route`, `vehicle` and `seats` (from the Transport note and the number of seats the group needs), `built_on`. Only what a tour operator or vehicle rental needs to quote on the exact plan:
- the vehicle type and seats; no names, and no group details beyond the seat count;
- per day: start time and point, stops with the expected waiting time, end point, kilometres, hours on the road, where the driver spends the night;
- the driver's needs: nights away from the operator's base, where the driver sleeps if the stay has no driver rooms, parking;
- permits, tolls and border or cutoff rules on the route (say "no driving after 4 pm near Jowai" as a fact of the route, not a reason);
- the questions to ask: per-kilometre or package price, driver allowance, night charges, what happens when a day runs over, cancellation terms.

**Never** reasons, the budget, food choices, names, booking references or confirmations. The same brief goes to every operator, so the quotes can be compared. For the chosen route it links every Day note (the checker warns otherwise). A finished example: `${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/references/operator-brief-example.md`. Draft it; the human sends it. Never contact anyone.

## 10. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
For a Route note it checks that the Day by day table has one row per night plus the last day, and that its nights per town match `bases` and `nights_per_base`. It checks `road_cutoffs` in `trip.md`, the links in `Logistics/legs.json`, the Day notes' cutoff legs (a leg in a cutoff area driven after its time with `rule_bends` 0), and that the Trip itinerary and the Operator brief link every Day note and no dropped place. Fix every error in the notes you wrote. Report problems in older notes; don't silently rewrite them. Delete `.claude/scratch/`.

## 11. Report to the user
Plain words, short. No field names, codes, speeds or raw script output.
- **Building options:** one or two lines on the hard places and what they forced ("Krem Chympe needs a night in Jowai: the roads there close to traffic at 4 pm"). Then one line per option: its idea, what it makes possible and its worst red flag. Then one line on what you tried and dropped. Then hand over to `compare-itineraries` for the side by side and its one question.
- **After the choice:** what was planned (the days, with a link to the Trip itinerary), the days that are tight or too much, the stays still to choose, and the Operator brief ready to send. Offer `review-travel-times` once.
- **Always, last:** one line on how far to trust it: the rough links are straight-line guesses; the researched ones are map times, road types and recent reports, checked on <date>; nobody has driven them. Name any base town you used that is "not in your list yet".
