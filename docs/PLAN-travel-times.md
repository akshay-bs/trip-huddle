# Plan: review-travel-times skill

Status: proposal, not built yet.

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
