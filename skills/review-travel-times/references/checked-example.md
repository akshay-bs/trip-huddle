---
type: day
day: 5
date: 2027-06-10
start_base: Lagos
end_base: Lagos
stay: "[[Example Guesthouse Lagos]]"
locations:
  - "[[Mountain Fort (Example)]]"
  - "[[Cork Oak Farm (Example)]]"
start_time: "08:30"
early_start:
sunrise: "06:14"
sunset: "20:54"
daylight_hrs: 14.7
drive_hrs: 4.8
activity_hrs: 4.5
predawn_hrs:
total_walk_km: 3
backtrack_km: 0
rule_bends: 0
travel_checked: 2026-11-02
travel_verdict: ok
tags:
  - day
---
<!--
FIELD GUIDE
Name the note "Day 01", "Day 02", …
stay: "[[Stay note]]" for tonight
locations: list of "[[Location note]]" visited today (also set scheduled_day on each Location)
start_time: "HH:MM", when the day starts: the first drive, or the first activity at the stay (the Schedule's first row)
early_start: "HH:MM", only when the day starts before sunrise (leave empty otherwise)
sunrise, sunset: local time "HH:MM" on this date at the day's base (the plan-day skill works them out with scripts/sun.mjs)
daylight_hrs: real daylight, sunset − sunrise. It is not the length of your day. If the sun times are unknown, the default from trip.md is used
drive_hrs: sum of the legs below, using the upper end of each range (after a travel-time check it also holds the stops buffer);  activity_hrs: time at the day's locations (time_needed_hrs) + meals and rests. Leave out after-dark activities
predawn_hrs: the part of drive_hrs + activity_hrs that happens before sunrise (empty if none). It is counted separately and does not use up daylight
backtrack_km: km driven today on a road the trip already drove (earlier today or on an earlier day), from the build-itinerary route check; a stop and straight back is not counted. 0 if none, empty if not worked out
rule_bends: how many choices are listed under "Choices that bend the rules" (0 if none). A leg in a road_cutoffs area (trip.md) driven after its time is a rule bend too
travel_checked: date (YYYY-MM-DD) the review-travel-times skill last checked the drive times; empty if never
travel_verdict: ok | tight | too much   (that skill's verdict on the drive times, empty if not checked; the checker warns when it is better than the slack verdict below)
Legs table, After dark column: ok = lit highway or city streets; avoid = unlit, forest, hill or bad surface
Slack = daylight_hrs − (drive_hrs + activity_hrs − predawn_hrs), computed in the Itinerary base. Verdict: ok = slack_ok_hrs or more (planning_limits in trip.md, 1.5 hrs unless changed), tight = 0 to slack_ok_hrs, too much = below 0
-->

# Day 05 · Thu 10 Jun · Mountain Fort and a cork oak farm

> [!info] Made-up example
> This note shows what a day looks like after the review-travel-times skill has checked it. The places and the trip are invented. The sun times were worked out with `scripts/sun.mjs` for Lagos, and the drive hours with `skills/review-travel-times/scripts/travel.mjs` from `checked-example-input.json` (same folder).

A day inland from Lagos, on the quiet day after the early start: the fort in the morning, lunch at a farm, home before the evening. Part of [[Route]].

**Daylight and slack:** sunrise 06:14, sunset 20:54, so 14.7 hrs of daylight (computed for Lagos, time zone Europe/Lisbon). Drive 4.8 (3.7 of driving and 1.1 for stops) + activity 4.5 = 9.3 hrs in daylight. Slack 5.4 hrs: **ok**.

## Why this plan
- **Fort first.** The road up is the slow part of the day, and the fort is cooler and quieter before midday. We leave at 08:30 and are there by 10:45.
- **The road takes longer than a map says.** A map app gives about an hour and ten minutes to the fort, but the last 30 km are a narrow hill road, and a full van is slower than a car. We plan on nearly two hours.
- **Lunch at the farm.** It is on the way down, so the group eats once, sits for a while, and the afternoon drive starts after the hottest hour.
- **Home by 18:00.** Even with stops, we are back in Lagos with three hours of daylight left, so the hill roads are all done well before dark.
- **No rule bends.** Nothing here needs a night drive.

## Legs
| From | To | km | Drive time (estimate) | After dark | Road notes |
| ---- | -- | -- | --------------------- | ---------- | ---------- |
| Lagos | Mountain Fort | ~45 | 1.2–1.9 hrs | avoid | Rural road, then 30 km of narrow hill road with bends. Van OK. Slower than the map shows |
| Mountain Fort | Cork Oak Farm | ~12 | 0.4–0.6 hrs | avoid | Hill road, no lights, a few passing places. Van OK |
| Cork Oak Farm | Lagos | ~38 | 0.9–1.2 hrs | ok | 10 km of hill road, then a main road, lit near Lagos |

*Drive times are estimates, checked on 2 Nov 2026 against a map search, a typical speed for each kind of road and local reports; not driven. Basis: Lagos to Mountain Fort: map 1 h 10, but 15 km of rural road at 28 km/h and 30 km of hill road at 22 km/h gives 1 h 55, so the longer is used. Mountain Fort to Cork Oak Farm: map 25 min, hill road at 22 km/h gives 35 min. Cork Oak Farm to Lagos: map 55 min, 10 km of hill road and 28 km of highway at 40 km/h gives 1 h 10. No roadworks or closures found in recent reports. Stops add 1.1 hrs (10 min for each hour of driving and 15 min for each of the 2 stops) and are included in the day's drive hours.*

## Schedule
| Time | What | Notes |
| ---- | ---- | ----- |
| 08:30 | Breakfast at the guesthouse, then depart | |
| 10:45 | **[[Mountain Fort (Example)]]** | Cooler before midday. Steps up to the walls: anyone can wait in the café |
| 13:00 | Leave the fort | |
| 13:45 | **[[Cork Oak Farm (Example)]]**: tour and lunch | Lunch is at the farm, booked for the group |
| 16:30 | Leave the farm | |
| 17:50 | Back at the guesthouse | |
| 20:54 | Sunset | |

## Along the way
- **The old aqueduct** beside the road out of Lagos, seen from the van. Not worth a stop with the fort ahead.
- **The last café before the hills**, at the turn-off for the fort. A short stop if anyone needs one: it adds under 5 minutes.

## Meals
- **Breakfast:** guesthouse
- **Lunch:** the farm's restaurant, booked for the group
- **Dinner:** Lagos old town, many options

## Backup plan (weather / closure / delay)
- **Rain or mist on the hill:** skip the fort's walls, keep the museum room, and move the farm tour up an hour.
- **Hill road closed or one lane:** go to the farm by the main road (about 15 min longer) and drop the fort.
- **Running late in the morning:** shorten the fort visit to 1.5 hrs; lunch stays at the farm.

## Choices that bend the rules
- None.

## Notes
- **Stay tonight:** [[Example Guesthouse Lagos]] (same as last night).
- **Travel-time check, 2 Nov 2026: ok.** The drive to the fort is the one leg that is much slower than the map says (about 40 minutes more). Even so the day ends well before sunset, with 5.4 hrs of slack.
- **Book ahead:** lunch at the farm for the whole group.
