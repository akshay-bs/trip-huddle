---
type: day
day: 4
date: 2027-06-09
start_base: Lagos
end_base: Lagos
stay: "[[Example Guesthouse Lagos]]"
locations:
  - "[[Cliff Viewpoint (Example)]]"
  - "[[Fishing Harbour (Example)]]"
  - "[[Old Town Walk (Example)]]"
early_start: "05:00"
sunrise: "06:14"
sunset: "20:54"
daylight_hrs: 14.7
drive_hrs: 2.3
activity_hrs: 10
predawn_hrs: 1.3
total_walk_km: 5
rule_bends: 1
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

# Day 04 · Wed 9 Jun · Sunrise cliff, harbour boat trip, old town

> [!info] Made-up example
> This note shows what the plan-day skill writes. The places and the trip are invented. The sun times were worked out with `scripts/sun.mjs` for Lagos.

A loop from Lagos with the one early start of the trip, for sunrise at the cliff. Then a boat trip, a long lunch and an easy evening walk that ends before sunset. Part of [[Route]].

**Daylight and slack:** sunrise 06:14, sunset 20:54, so 14.7 hrs of daylight (computed for Lagos, time zone Europe/Lisbon). Drive 2.3 + activity 10 − 1.3 hrs before sunrise = 11 hrs in daylight. Slack 3.7 hrs: **ok**, with 1 rule bend (see below).

## Legs
| From | To | km | Drive time (estimate) | After dark | Road notes |
| ---- | -- | -- | --------------------- | ---------- | ---------- |
| Lagos | Cliff Viewpoint | ~30 | 0.7–0.8 hrs | avoid | Quiet coast road, no lights. Fine for the hired 7-seat van. Last 2 km is a gravel track: go slowly |
| Cliff Viewpoint | Fishing Harbour | ~20 | 0.5–0.7 hrs | avoid | Paved, a few villages, no street lights. Van OK |
| Fishing Harbour | Lagos | ~25 | 0.6–0.75 hrs | ok | Main road, lit near Lagos. Busier in the late afternoon |

*Drive times are researched estimates, not checked on the road. Basis: a routing site's free-flow time with 25% added for villages and traffic. Ask the driver to confirm the gravel track.*

## Schedule
| Time | What | Notes |
| ---- | ---- | ----- |
| 05:00 | Leave the guesthouse (before sunrise) | Coffee in flasks, jackets. Dawn is cool |
| 05:45 | Park at the gravel track, walk 10 min | Head torches |
| 06:14 | **[[Cliff Viewpoint (Example)]]**: sunrise | Level path, railings along the edge. Anyone can wait in the van |
| 07:15 | Breakfast at the café in the village | |
| 08:00 | Drive to the harbour | |
| 09:30 | **[[Fishing Harbour (Example)]]**: boat trip | **Book early.** June is busy and boats are small |
| 12:15 | Lunch at the harbour | |
| 14:00 | Drive back to Lagos | |
| 15:00 | Free time at the guesthouse | Not counted in activity_hrs |
| 17:00 | **[[Old Town Walk (Example)]]** | Flat, 5 km in all with the harbour. Done well before sunset |
| 19:30 | Dinner in the old town | |
| 20:54 | Sunset | |

## Meals
- **Breakfast:** village café after the viewpoint (opens at 07:00)
- **Lunch:** harbour restaurant, booked for the group
- **Dinner:** old town, many options

## Backup plan (weather / closure / delay)
- **Cloud at sunrise:** wait 30 minutes, then go on to the harbour and keep the boat trip.
- **Boat trip cancelled (sea too rough):** swap in a long lunch and spend the afternoon at the old town. Move the walk to 15:00.
- **Running late in the morning:** drop the café breakfast and eat at the harbour.

## Choices that bend the rules
- **Driving the coast road and the gravel track in the dark before sunrise.** Why: sunrise at the cliff is the reason for the early start, and it is the one early start of the trip. Cost: about 45 minutes on an unlit road, the last 2 km on gravel, so the driver goes slowly. The way back is in daylight.

## Notes
- **Stay tonight:** [[Example Guesthouse Lagos]] (same as last night).
- **Book ahead:** the boat trip (small boats, busy month) and the harbour lunch for the whole group.
- **Not in this plan:** [[Mountain Fort (Example)]] is selected but is 90 minutes inland, the opposite way from the harbour. It fits better on the day we leave for the next base.
