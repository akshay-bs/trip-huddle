---
type: route
bases: [Pobitora, Shillong, Sohra, Dawki, Shillong]
nights_per_base: [1, 1, 1, 1, 2]
total_nights: 6
status: draft
tags:
  - route
---
<!--
FIELD GUIDE
Name the note "Route" (one per trip, or one per option, e.g. "Route - Option B")
bases: the base towns in the order you stay in them, e.g. [Town A, Town B, Town C]
nights_per_base: nights at each base, same order as bases, e.g. [2, 3, 2]
total_nights: the sum of nights_per_base (should match the trip length in trip.md)
status: draft | agreed | booked
Day by day: one row per day, so total_nights + 1 rows (the last day has no night). Start = the time of the first drive and where, e.g. "07:30, Jowai". Main stops = the places in order, e.g. "[[Place A]] → [[Place B]]". End = where the day's driving ends. Night = the base town slept in, "—" on the last day. The nights per town must match bases and nights_per_base (the checker compares them)
-->

# Route - Option A

> [!info] Made-up example
> The standard loop that `build-itinerary` always tries first: the order most agency quotes use. The places are real notes in the example vault; the choices, the road figures (`legs.json`) and the road cutoff are made up for the example (see `../example-setup.json`). No dates and no group details.

## Bases and nights
| # | Base | Nights | Getting there | Notes |
| - | ---- | ------ | ------------- | ----- |
| 1 | Pobitora | 1 | Road from the airport | Morning safari next day |
| 2 | Shillong | 1 | After the safari | |
| 3 | Sohra | 1 | Via Nohkalikai | |
| 4 | Dawki | 1 | Via the river | |
| 5 | Shillong | 2 | Via Krang Suri; Jowai as a day trip | |

## Day by day
| Day | Start | Main stops | End | Night |
| --- | ----- | ---------- | --- | ----- |
| 1 | 13:00, Guwahati |  | Pobitora | Pobitora |
| 2 | 07:00, Pobitora | [[Pobitora Wildlife Sanctuary]] | Shillong | Shillong |
| 3 | 08:00, Shillong | [[Nohkalikai Falls]] | Sohra | Sohra |
| 4 | 08:00, Sohra | [[Umngot River (Dawki)]] | Dawki | Dawki |
| 5 | 08:00, Dawki | [[Krang Suri Falls]] | Shillong | Shillong |
| 6 | 07:00, Shillong | Jowai → [[Krem Chympe Falls]] → Jowai | Shillong | Shillong |
| 7 | 08:00, Shillong |  | Guwahati | — |

## Why this route
- The order the agency quotes use: the capital first, then the waterfall town and the river, with Jowai left to the end as a day trip from Shillong.

## What it makes possible
- Every must-see place is on the plan, and Shillong gets three nights for a slow end to the trip.
- The first five days are easy: each one ends by about 3 pm, well before the 4 pm cutoff near Jowai and before sunset.

## Red flags
- **Day 6 does not work.** Over 9 hrs on the road plus 5 hrs at Krem Chympe Falls is more than the daylight. The drive back from the falls runs about 1 hr 45 min past the 4 pm cutoff on the roads near Jowai, and the road on to Shillong is driven in the dark until about 9:30 pm.
- Day 6 drives the same 64 km between Shillong and Jowai twice.
- No stay looked at yet in Pobitora or Shillong.

## What it costs
- To keep it, Krem Chympe Falls has to go, or Day 6 becomes a night in Jowai (which is close to Option B).
- About 780 km on the road in all, about 150 km more than Option B.

## Open questions
- Is there a stay near the sanctuary for the first night?
