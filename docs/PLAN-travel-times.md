# Plan: review-travel-times skill

Status: built (v0.7.0).

How it was built, where it differs from the proposal below:
- **No Road type column** in the Legs table. The script takes road types as input (a leg can mix several), so one cell per leg would not fit, and the Road notes already say it in words. The skill keeps road types in its working input and the basis line.
- **The stops buffer is part of `drive_hrs`.** `drive_hrs` is the upper end of each checked range plus the buffer, so a re-check gives the same number and the Itinerary base's slack and verdict update by themselves. The basis line and the *Daylight and slack* line say how much of it is stops.
- **The verdict** is the worst of: the slack verdict (plan-day's thresholds, on the checked drive hours); an `avoid` leg driven after sunset or before sunrise beyond what the group agreed (up to 30 minutes is tight, more is too much); a day that ends over an hour after sunset away from an `evening_base` (tight); a closed road (too much). So it is never kinder than the slack verdict. An agreed bend is not counted, except for time beyond what was agreed.
- **Vehicle class** is read from `group_vehicle` (a van, bus, coach or 6 or more seats is `group`, otherwise `car`), and can be overridden for one check.
- **The checker** also warns when `travel_verdict` and `travel_checked` do not go together. A Day note that changed after `travel_checked` is still not detected; plan-day clears both properties when it changes the legs.
- Day notes made before 0.7.0 have no travel properties; the checker warns about the missing ones, and the skill asks before adding them to the template.

---


## The problem
plan-day writes drive times as researched estimates. They are usually optimistic:
- Map apps assume a car, not a loaded group vehicle on hill roads.
- They leave out stops: toilets, tea, photos, loading 10+ people, waiting for one person.
- They don't know about roadworks, landslides, market-day jams or one-lane stretches.
- Agency itineraries are often worse. They cram in places to look good on paper.

The group needs one answer per day: **can we really do this before dark, and if not, what changes?**

## What it checks
Two kinds of input:
1. **Day notes** made by plan-day.
2. **An itinerary from a Source note** (an agency quote or a friend's plan), before any Day notes exist. "Is this agency plan realistic?"

For each leg, three estimates, and the skill keeps the most realistic one:
| Estimate | How |
|---|---|
| Map time | Web search for the route's distance and drive time |
| Road-type time | km ÷ a typical speed for the road type, from the table below |
| Local reports | Recent traveller reports and news: roadworks, landslides, closures, jams |

Default speeds (km/h), editable in `trip.md` as `road_speeds`:
| Road type | Car | Group vehicle |
|---|---|---|
| Motorway / 4-lane | 70 | 55 |
| Highway, 2-lane | 50 | 40 |
| Rural road | 35 | 28 |
| Hill or mountain road | 30 | 22 |
| City traffic | 20 | 15 |
| Rough track | 15 | 10 |

Then a **stops buffer** for each day: 10 min per hour of driving, plus 15 min per stop for getting a group in and out. Editable in `trip.md` as `stop_buffer`.

## What it writes
For **Day notes**, in place:
- The Legs table's drive time becomes the checked range. The basis line says what it was checked against and when: "Checked 2 Nov: map 1 h 40, hill road at 22 km/h gives 2 h 10, no closures reported."
- New properties: `travel_checked` (date) and `travel_verdict` (ok / tight / too much). `drive_hrs` is updated, so slack and the plan-day verdict update too.
- If the verdict gets worse, the skill **doesn't rewrite the day**. It suggests fixes, in this order: leave earlier, drop or move a `maybe` place, swap the order to avoid an `avoid` road after dark, split the day, change where the night is spent. It then asks which one to apply, and hands that to plan-day.

For **a Source itinerary**: a section added to the Source note, "Travel-time check", with one line per day: verdict, the main reason, the fix.

## What the human sees
One short table, then the reasons. No speeds or field names:

| Day | Route | Verdict | Why |
|---|---|---|---|
| 3 | Shillong → Dawki → Shillong | too much | 5½ hrs of hill road, back 1 hr after dark |
| 4 | Shillong → Sohra | ok | 2 hrs of driving, done by 15:30 |

Then: "Day 3: leave at 7:00 instead of 8:30, or drop the boat ride. Which one?"

## Checker
- `travel_verdict` must be ok, tight or too much.
- Warning: `travel_verdict` is better than the slack verdict (the check is out of date).
- Warning: a Day's legs changed after `travel_checked`? Not checkable reliably, so skip it.

## Tests
- Road-type time and stops buffer: a small script (`scripts/travel.mjs` in the skill) with known inputs and outputs.
- A made-up example: the Portugal day from plan-day, checked, with one leg slower than the map.

## Not doing
- No maps API or key. Web search and the speed table are enough to catch bad plans.
- No live traffic. This is planning weeks ahead.
