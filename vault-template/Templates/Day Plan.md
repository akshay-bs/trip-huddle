---
type: day
day:
date:
start_base:
end_base:
stay:
locations: []
early_start:
sunrise:
sunset:
daylight_hrs: 10
drive_hrs:
activity_hrs:
predawn_hrs:
total_walk_km:
rule_bends: 0
tags:
  - day
---
<!--
FIELD GUIDE
Name the note "Day 01", "Day 02", …
stay: "[[Stay note]]" for tonight
locations: list of "[[Location note]]" visited today (also set scheduled_day on each Location)
early_start: "HH:MM", only when the day starts before sunrise (leave empty otherwise)
sunrise, sunset: local time "HH:MM" on this date at the day's base (the plan-day skill works them out with scripts/sun.mjs)
daylight_hrs: real daylight, sunset − sunrise. It is not the length of your day. If the sun times are unknown, the default from trip.md is used
drive_hrs: sum of the legs below, using the upper end of each range;  activity_hrs: time at the day's locations (time_needed_hrs) + meals and rests. Leave out after-dark activities
predawn_hrs: the part of drive_hrs + activity_hrs that happens before sunrise (empty if none). It is counted separately and does not use up daylight
rule_bends: how many choices are listed under "Choices that bend the rules" (0 if none)
Legs table, After dark column: ok = lit highway or city streets; avoid = unlit, forest, hill or bad surface
Slack = daylight_hrs − (drive_hrs + activity_hrs − predawn_hrs), computed in the Itinerary base. Verdict: ok = 1.5 hrs or more, tight = 0 to 1.5 hrs, too much = below 0
-->

# {{title}}

<!-- One line: the shape of the day, and the Route or itinerary note it belongs to. -->

**Daylight and slack:** 

## Legs
| From | To | km | Drive time (estimate) | After dark | Road notes |
| ---- | -- | -- | --------------------- | ---------- | ---------- |
|      |    |    |                       |            |            |

*Drive times are researched estimates, not checked on the road. Basis: *

## Schedule
| Time | What | Notes |
| ---- | ---- | ----- |
| 08:00 | Breakfast / depart |  |
|  |  |  |
| 18:00 | Sunset |  |

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
