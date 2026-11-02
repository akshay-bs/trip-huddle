# Plan: build-itinerary skill

Status: built (v0.12.0).

How it was built, where it differs from the proposal below:
- **The distance file** is `Logistics/legs.json` (the folder is `folders.transport`). A link has `from`, `to`, `km`, `drive_hrs: [low, high]`, `road`, `after_dark` (`ok` or `avoid`), `cutoff_area`, `status` (`rough` or `researched`), `source` and `checked`, and works both ways. Two additions: `towns`, the coordinates of base towns and other points with no note of their own (an airport), and `rough_road`, the road type rough links use. `scripts/route.mjs` writes it (`links`, `link` for one researched link, `town`), so no skill edits the JSON by hand. The checker warns when the file cannot be read, a link is malformed, or the same pair is listed twice.
- **Rough links:** straight-line km × a winding factor per road type (motorway 1.2, highway 1.25, rural 1.3, hill 1.5, city 1.4, track 1.4), at the trip's speeds for the vehicle class (`travel.mjs`, `road_speeds`). A rough link on a hill, rural or track road is `avoid` after dark, and it is in a cutoff area when either end is (a town of that name, or a place's `nearest_base` or a stay's `base_town`). `links` covers selected places, stays that are not dropped, and the towns; it updates rough links and never touches a researched one.
- **The reach rule** is the one proposed, with the stops buffer of `travel.mjs` added to the drive (10 min per driving hour, 15 per stop), and the drive limit taken from the selected Transport note's `max_hrs_per_day` when set. It counts as fitting only a day that would be **ok** (daylight minus `slack_ok_hrs`); a tight day is left out with the reason, and `--daylight` gives the real daylight of a date. "About 20 minutes" is a new planning limit, `on_the_way_min` (20).
- **The quick check** (`route.mjs check --route`) reuses `travel.mjs`'s day arithmetic for every day of the *Day by day* table, so its drive hours, after-dark minutes and verdicts are the ones `review-travel-times` would give on the same figures. Without dates and a time zone it uses the `trip.md` season defaults (sunrise = `sunset` − `daylight_hrs`); `--sunset` and `--daylight` override them.
- **Doubling back** is a link driven again later in the trip; going to a stop and straight back (a spur) is not counted. It works on links, so a pass-through town is written in *Main stops* when the road goes through it. Its km go into the Day note's `backtrack_km` (0 if none).
- **Road cutoffs in the verdict:** a leg in a cutoff area driven after `no_drive_after` uses the after-dark thresholds (up to `dark_drive_tight_min` minutes is tight, more is too much). A bend that covers it sets `bent` and, if it says how long, `agreed_cutoff_min`. The checker's Day note warning reads it the way the after-dark warning reads the Schedule: a row after the cutoff with a driving or arriving word and the leg's town.
- **The Route template** has *Day by day* (Day, Start "HH:MM, place", Main stops, End, Night with "—" on the last day) and three sections, *What it makes possible*, *Red flags*, *What it costs*. The checker compares the rows (nights + 1) and the nights per town with `bases` and `nights_per_base`, only when the table is filled.
- **The Trip itinerary and the Operator brief are note types** (`itinerary` and `brief`, `Templates/Trip Itinerary.md` and `Templates/Operator Brief.md`, kept in `Itinerary/`), so the checker can find them. Their properties: `route` and `built_on`, plus `vehicle` and `seats` on the brief. "Links every Day note" applies when the `route` is agreed or booked (a brief for an option not chosen yet has no Day notes); a brief that links a food spot, a booking or a confirmation, or mentions a confirmation, is flagged.
- **`needs_night_nearby`** is a checkbox, after `last_mile`. In the example vault it is `true` on Krem Chympe Falls, Labon Falls and Wari Chora, from their public research (hours from any base). The Locations base shows it in its *All* view; the Itinerary base gains `start_time` and `backtrack_km` (summed).
- **trip-init** writes `road_cutoffs: []` and `on_the_way_min` with every run, like the other settings (kept or replaced on `--reconfigure`, refused when an entry has no area or a bad time). `--add-itinerary` brings the templates, types, Bases and home page of an older vault up to date; `skills/build-itinerary/scripts/migrate-itinerary.mjs` adds the empty new fields to its notes.
- **The made-up example** uses the example vault's public places with made-up choices, road figures and a Jowai cutoff (`references/example-setup.json`), so the example vault itself keeps every decision at `considering` and `road_cutoffs` empty. Both loops have the same 6 nights. With these figures the reverse loop's Krem Chympe day is **tight** on the season's 9.5 hrs of daylight, and the Route note says so as a red flag; it fits on a 10.5-hr day. The Trip itinerary and Operator brief examples use the two made-up Portugal Day notes of `plan-day` and `review-travel-times`.

---

This is a reusable process for any trip. Every number below is a default that a group changes in `trip.md` as it plans.

## The problem
The group has chosen its places, base towns, stays and food spots. Nothing turns those choices into a trip.

- `plan-day` details one day, but it assumes a Route note already exists (towns, order, nights). Today a person writes that by hand.
- `compare-itineraries` compares routes, but only routes someone already wrote: an agency quote, a friend's plan, a draft.
- Nobody checks the trip as a whole: the order of towns, the direction of the loop, doubling back on the same road across days.
- There is no single day-by-day itinerary the group reads, and no brief to send to a tour operator or vehicle rental for a quote.

The group needs: **two or three route options built from its own choices, with what each one makes possible and its red flags; then, once one is chosen, a clear day-by-day itinerary and an operator brief.**

## The lesson from the original trip
The standard route, used by every agency quote and most blogs, was a loop: the city airport → a wildlife sanctuary → the hill capital → the waterfall town → the river border town → Jowai → back to the capital → the airport.

On that route Jowai was the problem. The places the group wanted most (Krem Chympe, Krang Suri) are near Jowai. The roads there are single track, near the border, and local advice is not to drive after about 4 pm. On the standard loop Jowai is a day trip or a late leg, so it kept failing the daylight check. The group nearly dropped it.

A travel video showed the same loop **in reverse**: the airport → the sanctuary → straight to Jowai → the river border town → the waterfall town → the capital → the airport. It worked because:
- The safari at the sanctuary ends by 10 or 11 am. That leaves the whole day for the long drive to Jowai, all of it before the cutoff.
- Jowai becomes a **night stop**, not a pass-through. A full day there for Krem Chympe, with no evening drive.
- From Jowai, Krang Suri is about 1 hour, and the river border town is about 1 hour after that. The hard area is done in short morning legs.

Same towns, same places, same number of nights. Only the order changed, and a must-see place went from "drop it" to "easy".

What the skill must learn from this:
1. **Try more than the standard route.** At least the reverse, and a version with a different base town. The common route is common because it suits agencies, not because it suits every group.
2. **Find the hard places first** and build around them: places with a road cutoff, places that need a night nearby, activities fixed to a time of day.
3. **Pair a short morning with a long drive.** An activity that ends early (a safari, a sunrise point) is a good start to a big travel day.
4. **A hard area should be a night stop**, so it is reached by daylight and left in the morning.

## Input
- Places with `decision: selected` (and `priority`), stays and food spots with `decision: selected` or `considering`.
- `trip.md`: dates, arrival and departure points, vehicle, `pace`, `bases`, `planning_limits`, and the new `road_cutoffs` (below).
- Locked decisions in `Decisions/`. A locked stay, date or arrival is a hard rule for every option.
- Any Source notes: the agency routes are a starting point, never the only option.

## Step 1: find the hard places
Before any route, list what limits the order. The agent works this out and does not show it raw.
- **Road cutoffs:** an area where nobody drives after a set time (the Jowai rule). From `road_cutoffs` in `trip.md`, the places' `after_dark` and `last_mile`, and local reports.
- **Needs a night nearby:** a place whose time needed plus the drive in and out does not fit one day from any base.
- **Fixed time of day:** sunrise points, morning safaris, boat slots, a market day, a closing day.
- **Ends early:** activities that finish by late morning and free the rest of the day for driving.
- **Entry and exit:** arrival and departure points and times, if known or locked.

## Step 2: build two or three route options
Each option is a Route note (`Itinerary/Route - Option A.md`) with bases, nights, and a new **Day by day** table (one line per day: start, main stops, end, night). The agent always tries:
- **The standard order** (from the Source notes, or the obvious loop).
- **The reverse** of it.
- **A base change:** stay in the hard area instead of day-tripping to it, or the other way round.
- **One "big day" version** when it would save a night or fit in a must-see place: one long travel day, said plainly ("8 hrs on the road on Day 3, all before dark").

It drops options that are clearly worse and keeps 2 or 3 that are really different.

## Step 3: a quick check of each option
For each day of each option, a rough check with the existing scripts (`travel.mjs` for drive time by road type, `sun.mjs` for daylight):
- drive hours and kilometres, against `max_drive_hrs_day`
- any leg driven after dark on an `avoid` road, or after a road cutoff
- **doubling back:** the same road driven twice, and the kilometres it adds over the whole trip
- must-see places covered, moved, or impossible
- a stay town with no selected or candidate stay

This is a quick check, not a full day plan. `plan-day` and `review-travel-times` do the detail later.

## Step 4: show the options
The side-by-side view is the `compare-itineraries` skill, run on the new Route notes. No new comparison format. On top of that, each option gets three short lists, in plain words:
- **What it makes possible** ("Krem Chympe gets a full day; no driving near Jowai after 4 pm").
- **Red flags** ("Day 4 crosses the border road at 5 pm", "drives the same 70 km twice").
- **What it costs** ("one 8-hour day", "one hotel change more").

No scores. A recommendation with reasons, as `compare-itineraries` already does. The group decides.

## Step 5: once the group chooses
The chosen Route note becomes `agreed` (the `compare-itineraries` and `group-decisions` flow). Then the skill:
1. Runs `plan-day` for every day, in order.
2. Writes the **Trip itinerary** note.
3. Writes the **Operator brief** note.
4. Offers `review-travel-times` once, in one line.

## The Trip itinerary note (for the group)
`Itinerary/Trip itinerary.md`: the whole trip on one page, made from the Day notes. It is rebuilt whenever a Day note changes; it holds no facts of its own.

For each day:
- **Start:** time and place ("7:30 am, leave the hotel in Jowai").
- **Stops, in order:** arrive and leave times, how long, what you do.
- **Meals:** where and when.
- **Along the way:** what you pass without stopping (a viewpoint from the road, a town, the last fuel or ATM for a while).
- **End:** the night's town and stay, and the arrival time against sunset.
- **Drive:** kilometres and hours; "doubles back" when it does.
- A link to the Day note for the detail and the reasons.

## The Operator brief (for quotes)
`Itinerary/Operator brief.md`: what a tour operator or vehicle rental needs to quote on the exact plan, and nothing else.
- Vehicle type and number of seats (from the Transport note). No names, no group details beyond the seat count.
- Per day: start time and point, stops with expected waiting time, end point, kilometres, hours, driver night halt.
- Driver needs: the nights away from the operator's base, where the driver sleeps if the stay has no driver rooms, parking.
- Permits, tolls or border-area rules on the route.
- The questions to ask: per-kilometre or package price, driver allowance, night charges, what happens when a day runs over.

No reasons, no budget, no food choices, no booking references. The same brief goes to every operator, so the quotes can be compared.

## The distance file
One saved file of road facts between places, `Logistics/legs.json`, shared by this skill, `plan-day`, `review-travel-times` and `compare-itineraries`. Each link: from, to, km, drive time range, road type, after dark (ok or avoid), the road cutoff area if any, where the figure came from, and the date it was checked. A script (`skills/build-itinerary/scripts/route.mjs`) reads it to try route orders and check each day the same way every time.

**It holds facts about roads, never decisions.** Which stay, place or food spot is selected stays in the notes. When a hotel falls through, the road between two towns has not changed, so the file stays right; the skills read the current choices from the notes each time. There is no "update the file" step to forget. A new place only adds links.

**Which links, so a day between two bases works.** Not every pair researched (60 places would be thousands of links), and not only each place to its own base, which breaks a day like *Jowai → Krang Suri → Dawki*: Krang Suri sits between the two bases, and a day that checks out of one and checks in at the other needs both sides. **And no fixed reach like "2 hours"**: 2 hours suits Meghalaya's hill roads, but on a motorway trip it is far too short, and on a trek or ferry trip too long. The reach comes from the trip's own numbers, in two stages:
1. **Rough links for every pair, for free.** From coordinates alone: straight-line km × a winding factor for the road type, at the trip's road speeds (`travel.mjs` and `road_speeds` in `trip.md`). No research, so every pair can have one. Marked `rough`.
2. **Real links only where a day could use them.** A place P is a candidate for a day from base A to base B (A = B for a day trip) when, on the rough figures, `A→P + time_needed_hrs(P) + P→B` fits that day: the drive within `max_drive_hrs_day` (or the selected vehicle's limit), the whole within the day's daylight minus `slack_ok_hrs`. Only those links get researched (map time, road type, after dark, cutoff area) and marked `researched` with their source and date.

So the reach is different for each place (a 4-hour trek has a shorter reach than a 20-minute viewpoint), each trip (motorway or hill roads) and each season (winter daylight is shorter), with no new number to guess. Krang Suri fits a Jowai → Dawki day, so it gets both links.

**On the way or a detour.** For a day from A to B, a place P costs `A→P + P→B − A→B` extra. Under about 20 minutes it is "on the way" (the same rule `plan-day` uses); more is a detour and a stop of its own. This is how the script builds the stops of a moving day, and how it shows what the group passes without stopping.

**The figures are still estimates.** The file makes every skill use the same estimate, with its source and date. It does not make them true; `review-travel-times` still checks them.

## New fields
- **`trip.md` → `road_cutoffs`:** a list of `{area, no_drive_after: "HH:MM", reason}`. Example: `{area: Jowai, no_drive_after: "16:00", reason: single-track border roads}`. Read by this skill, `plan-day` and `review-travel-times`; a leg in that area after the time counts as a rule bend.
- **Route template:** a **Day by day** section (day, start, main stops, end, night), and a **What it makes possible / Red flags / What it costs** section.
- **Day Plan template:** an **Along the way** section, and `start_time` and `backtrack_km` properties.
- **Location:** `needs_night_nearby` (true or empty), set by `add-place` research.

## Checker
- `road_cutoffs` entries are well formed (an area, a valid time).
- A Day note warns when a leg in a cutoff area ends after the cutoff while `rule_bends` is 0.
- Route notes: the Day by day table has one line per night plus the last day, and its nights match `nights_per_base`.
- The Trip itinerary and Operator brief link to every Day note, and to no dropped place.

## Tests (scripts/test.mjs)
- A made-up example in `skills/build-itinerary/references/`, with the standard and the reverse loop, where the standard loop breaks a road cutoff and the reverse does not. The test checks that the script finds the break and the doubling back.
- The new fields in both vaults, and `trip-init --reconfigure` bringing an older vault up to date, then changing nothing.

## Not doing
- No automatic route solver. Groups have few towns; trying 3 or 4 sensible orders and checking them is enough, and the reasons stay readable.
- No live booking or price lookups. The operator brief asks for quotes; it does not get them.
- No printing or PDF. That is the `driver-brief` item on the roadmap, which can grow out of the Operator brief.

## Decided
1. Road cutoffs are kept per area in `trip.md`.
2. The skill may suggest base towns not in the list, marked "not in your list yet".
3. One operator brief per route option, on request.
4. Road facts go in a shared distance file; decisions stay in the notes.
5. No fixed link reach: rough straight-line links for every pair, researched links only where the trip's own limits say a day could use them.
