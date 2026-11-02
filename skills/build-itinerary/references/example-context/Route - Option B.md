---
type: route
bases: [Pobitora, Jowai, Dawki, Sohra, Shillong]
nights_per_base: [1, 2, 1, 1, 1]
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

# Route - Option B

> [!info] Made-up example
> The reverse of the standard loop, with Jowai as a night stop instead of a day trip. Same places, same number of nights. The places are real notes in the example vault; the choices, the road figures (`legs.json`) and the road cutoff are made up for the example (see `../example-setup.json`). No dates and no group details.

## Bases and nights
| # | Base | Nights | Getting there | Notes |
| - | ---- | ------ | ------------- | ----- |
| 1 | Pobitora | 1 | Road from the airport | Morning safari next day |
| 2 | Jowai | 2 | Straight after the safari | A full day for Krem Chympe |
| 3 | Dawki | 1 | Via Krang Suri, in the morning | |
| 4 | Sohra | 1 | Via Nohkalikai | |
| 5 | Shillong | 1 | Short drive | |

## Day by day
| Day | Start | Main stops | End | Night |
| --- | ----- | ---------- | --- | ----- |
| 1 | 13:00, Guwahati |  | Pobitora | Pobitora |
| 2 | 07:00, Pobitora | [[Pobitora Wildlife Sanctuary]] | Jowai | Jowai |
| 3 | 07:00, Jowai | [[Krem Chympe Falls]] | Jowai | Jowai |
| 4 | 08:00, Jowai | [[Krang Suri Falls]] → [[Umngot River (Dawki)]] | Dawki | Dawki |
| 5 | 08:00, Dawki | [[Nohkalikai Falls]] | Sohra | Sohra |
| 6 | 08:00, Sohra |  | Shillong | Shillong |
| 7 | 08:00, Shillong |  | Guwahati | — |

## Why this route
- The standard loop run backwards, so the hard area near Jowai comes early and is done in the mornings.
- The safari ends by mid-morning: a good start for the one long drive of the trip.

## What it makes possible
- Krem Chympe Falls gets a full day from Jowai, back by 3:45 pm: no driving near Jowai after 4 pm on any day.
- Krang Suri Falls and the river at Dawki are done in short morning legs on the way to Dawki.
- No road is driven twice: about 630 km in all.

## Red flags
- Day 3 is a big day the group has to accept: 5 hrs at the falls leaves under an hour of daylight to spare (tight). If the 4x4 to the falls is late, the drive back gets close to the 4 pm cutoff. Start at 7.
- No stay looked at yet in Jowai (two nights) or Pobitora.

## What it costs
- Day 2 is the long day: nearly 6 hrs on the road after the safari, including stops, done by about 2:45 pm.
- Shillong gets only the last night.

## Open questions
- Where do we stay in Jowai? No stay has been looked at there yet.
