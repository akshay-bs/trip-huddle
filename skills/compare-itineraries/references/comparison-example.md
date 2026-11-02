---
type: comparison
options:
  - "[[Example Agency - Coast and Plains quote]]"
  - "[[Route - Option B]]"
compared_on: 2026-11-02
recommended: "[[Route - Option B]]"
status: draft
decided_option:
tags:
  - comparison
---
<!--
FIELD GUIDE
Name the note "Comparison - <short description>", for example "Comparison - Agency quote vs Own draft". It lives in Sources/ (the checker reads that folder for it; a folders: {comparison: ...} line in trip.md can change it).
options: the notes being compared, 2 or more, each a "[[Source note]]" (an agency quote, a friend's plan) or a "[[Route note]]" (the group's own draft), one per line
compared_on: date (YYYY-MM-DD) of the comparison. Prices and drive times are as they were that day
recommended: "[[option]]" that Claude recommends, one of options (leave empty if the options cannot be told apart yet)
status: draft | decided
decided_option: "[[option]]" the group chose, one of options. Only when status is decided
Write the note for the group, in plain words: no field names, codes or speeds. No scores and no weights. Mark every estimate as an estimate
-->

# Comparison - Agency quote vs Own draft

> [!info] Made-up example
> This note shows what the compare-itineraries skill writes. The trip, the quote and the draft are invented (see `example-context/` in this folder). The driving figures come from `skills/review-travel-times/scripts/travel.mjs`: the agency's Day 5 from `comparison-example-input.json`, our draft's busiest day from the checked example in the review-travel-times references.

Two ways to spend the nine nights: the agency's quote ([[Example Agency - Coast and Plains quote]]) and our own draft ([[Route - Option B]]).

## Side by side
| | Agency quote | Our own draft |
| - | - | - |
| Nights | Lisbon 2, Évora 2, Lagos 5 | Lisbon 3, Lagos 6 |
| Must-see places | 4 of 5 (misses Cork Oak Farm) | 5 of 5 |
| Driving | Busiest day about 7 hrs (est.): Day 5, one day too much | Busiest day about 5 hrs (est.), every day fine |
| After dark | Day 5 ends with about 50 minutes of hill road after sunset | None |
| Stays | Lisbon and Lagos hotels named, not looked into yet. Évora not named | None chosen yet |
| Cost per couple | €1,900 (quoted) | About €1,550 (est.), van not priced |
| Not said yet | Entry fees and lunches | The van, the hotels |

## Bottom line
Our own draft. It covers all five must-sees, has no day over about 5 hours of driving, nothing after dark, and costs less on paper. The agency's plan is the more complete package, but its Day 5 packs the move from Évora, the fort and the drive on to Lagos into one afternoon, and ends with a hill road in the dark. The one thing that could change this is the price of the van, which our draft does not have yet.

## Trade-offs
- The agency includes Évora, which our draft skips. Évora has none of our must-sees, so this is about the feel of the trip, not about what we see.
- The agency's price already includes the van with driver and breakfast hotels. Our draft is about €350 cheaper per couple (est.), but it leaves the van and every hotel for us to find and book, and the van could close that gap.
- Day 5 is the agency's weak point: it is the only day that does not work, and it is also the only day with a hill road after dark. Splitting it over two days would fix it, but that is a change to their plan, not ours.
- Our draft sees Cork Oak Farm and the agency does not; the farm is a lunch stop on the same day trip as the fort.

## Ask before deciding
- **Agency:** Which hotels in Évora and Lagos? Are entry fees and lunches included? Is the vehicle a 7-seat van with a driver for all ten days? Can Day 5 be split over two days, and can Cork Oak Farm be added?
- **Van company (for our draft):** What does a 7-seat van with a driver cost for nine nights?
- **Us:** How much do we want Évora? It is the main thing the agency has and we don't.

## What this is based on
*Compared on 2 Nov 2026. The agency's price is from its quote; our draft's price is an estimate from the stays we have looked at, without the van. Drive times are estimates from map times, typical speeds for each kind of road and recent local reports, worked out for 9 June; nobody has driven them. Not found: the agency's hotel names for Évora, and any price for the van.*
