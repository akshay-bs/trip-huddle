# Plan: compare-itineraries skill

Status: proposal, not built yet.

This is a reusable process for any trip. Every number below is a default that a group changes in `trip.md` as it plans.

## The problem
A group usually ends up with 2 to 4 itineraries: agency quotes, a friend's plan, its own draft. They differ in many ways at once: which towns, how many nights each, which places, how much driving, what they cost. People compare them by gut feel, and the loudest voice wins.

The group needs: **a side-by-side view, the real trade-offs, a recommendation with reasons, and what to ask each agency before deciding.**

## Input
2 or more **options**. Each option is one of:
- a Source note (agency quote, friend's plan, blog itinerary), or
- a Route note for the group's own draft (`Route - Option B`).

## What the agent works out (not shown raw)
For each option, using the skills already built:
| Aspect | How |
|---|---|
| Bases and nights | Read from the option. Total nights against the trip dates in `trip.md` |
| Places covered | Match each place to Location notes. Count `must` and `should` places covered and missed. List places in the option that the group has `dropped` |
| Pace | Hours of driving per day (max and average), early starts, days that end after dark |
| Doability | review-travel-times run on the option (Source mode). Count of ok, tight and too much days |
| After dark | `avoid` places or roads planned after sunset |
| Stays | Named stays matched to Stay notes: capacity for the group, heaters or AC as needed, decision status |
| Cost | Total, per cost-sharing unit (from `trip.md`), and what is included or extra (entry fees, guides, meals) |
| Unknowns | Anything the option doesn't say: vehicle, hotel names, what's included |

## What the human sees
A Comparison note, short:

```markdown
# Comparison - <date>

## Side by side
| | Option A (agency) | Option B (friend) | Option C (own draft) |
|---|---|---|---|
| Nights | Town1 2, Town2 3, Town3 2 | ... | ... |
| Must-see places | 9 of 11 (misses X, Y) | 11 of 11 | 10 of 11 |
| Driving | up to 6 hrs a day, 2 days too much | up to 4 hrs | up to 5 hrs, 1 tight |
| After dark | 1 forest drive after sunset | none | none |
| Cost per family | 52,000 | not quoted | 47,000 (est.) |
| Unknowns | hotel names, vehicle | everything about stays | none |

## Bottom line
Option C. It covers 10 of 11 must-sees with no long drives after dark,
and it costs less. Option A sees more but has two days that won't work.

## Trade-offs
- A gets X and Y, but only by driving 6 hrs on day 4 ...
- B is the most relaxed, but has no stays chosen yet ...

## Ask before deciding
- Agency A: which hotels? Is the vehicle a 12-seater? Are entry fees included?
- ...
```

No scores and no weights. A single score hides the trade-offs and makes arguments about the weights, not the trip. The skill gives a recommendation and the reasons, and the group decides.

## What it writes
- A new **Comparison** note type (template in both vaults): `options` (links), `compared_on`, `recommended` (link), `status` (draft / decided), `decided_option` (link). Folder: `Sources`.
- When the group decides: the skill sets the chosen option's Route note to `agreed`, or creates a Route note from the chosen Source. It then offers to run plan-day for the days.
- Never changes place decisions on its own. If an option adds places, it hands them to add-place.

## Defaults the group can change (trip.md)
These change in real planning. Collect them in one place:
```yaml
planning_limits:
  slack_ok_hrs: 1.5         # plan-day and the travel check
  dark_drive_tight_min: 30  # travel check
  late_finish_min: 60       # travel check
  max_drive_hrs_day: 6      # compare: a day over this is flagged
```
plan-day, review-travel-times and the checker read these instead of fixed numbers. The values today stay the defaults.

## Checker
- Comparison notes: `options` has 2 or more links, `status` is a valid value, and `decided_option` is one of `options`.

## Tests
- A made-up comparison of two Portugal options in `references/`, passing the checker.
- `planning_limits` overrides change the slack and travel verdicts.

## Not doing
- No scoring or weighting.
- No booking or contacting agencies. "Ask before deciding" is a list for the human.
