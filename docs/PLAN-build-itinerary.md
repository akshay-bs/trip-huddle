# Plan: build-itinerary skill

Status: proposed, not built.

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

## Open questions
1. **Road cutoffs on the area, or on each place?** Recommended: on the area in `trip.md`, because the rule is about the roads, not one waterfall.
2. **Should the skill also suggest base towns** the group has not listed (it would have found "stay in Jowai")? Recommended: yes, but as a suggestion only, marked "not in your list yet".
3. **Operator brief:** one per trip, or one per route option, to get quotes before deciding? Recommended: one per option on request, because quotes often decide the route.
