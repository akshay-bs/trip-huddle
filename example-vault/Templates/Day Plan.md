---
type: day
day:
date:
start_base:
end_base:
stay:
locations: []
start_time:
early_start:
sunrise:
sunset:
daylight_hrs: 9.5
drive_hrs:
activity_hrs:
predawn_hrs:
total_walk_km:
backtrack_km:
rule_bends: 0
travel_checked:
travel_verdict:
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

# {{title}}

<!-- One line: the shape of the day, and the Route or itinerary note it belongs to. -->

**Daylight and slack:** 

## Why this plan
<!-- 3 to 6 short bullets, in plain words, for the group. Why this order, why this start time, why a place is in the morning or the evening, what was left out and why, which roads are done before dark, and any rule bend (see "Choices that bend the rules"). No field names or codes. -->
- 

## Legs
| From | To | km | Drive time (estimate) | After dark | Road notes |
| ---- | -- | -- | --------------------- | ---------- | ---------- |
|      |    |    |                       |            |            |

*Drive times are researched estimates, not checked on the road. Basis: *

## Schedule
| Time | What | Notes |
| ---- | ---- | ----- |
| 07:00 | Breakfast / depart |  |
|  |  |  |
| 16:30 | Sunset |  |

## Along the way
<!-- What the group passes without stopping: a viewpoint from the road, a town, the last fuel or ATM for a while. Places that add under on_the_way_min minutes (planning_limits in trip.md) can be a short stop; anything more is a stop of its own. -->
- 

## Meals
- **Breakfast:** 
- **Lunch:** 
- **Dinner:** 

## Backup plan (weather / closure / delay)
- 

## Choices that bend the rules
<!-- One line per choice, then set rule_bends to the number: - **What we chose.** Why: the reason. Cost: what it costs, e.g. 15 min on city streets after dark. -->
- None.

## Notes
- 
