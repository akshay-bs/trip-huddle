# Plan: compare-itineraries skill

Status: built (v0.8.0).

How it was built, where it differs from the proposal below:
- **`planning_limits` has one shared reader**, `scripts/trip-settings.mjs` (it also holds the `trip.md` reader that used to live in `travel.mjs`). `sun.mjs slack` (`slack_ok_hrs`), `travel.mjs` (`slack_ok_hrs`, `dark_drive_tight_min`, `late_finish_min`, and an `over_max_drive` flag for `max_drive_hrs_day`), the checker (`slack_ok_hrs`, for the `travel_verdict` warning) and `trip-init` read it. The checker warns about a bad value and uses the default instead; the scripts stop with the problem.
- **The Itinerary base hardcoded 1.5**, and a base cannot read `trip.md`. `trip-init` now writes `slack_ok_hrs` into the base's formula (slot S13 in `slots.md`), so the example stays identical at the default. After a change in `trip.md` the group asks for "re-run trip-init settings" for the base to follow. The Day Plan template's guide line no longer says 1.5; it names `slack_ok_hrs`.
- **`trip-init` merges `planning_limits`:** defaults, then the vault's current values (on `--reconfigure`), then the answers, so changing one limit never resets the others. `--reconfigure` does not add `Templates/Comparison.md` to an older vault; the skill asks first and copies it (and the four types) from `vault-template/`.
- **Checker for Comparison notes:** fewer than 2 `options` and a `decided_option` that is not one of them are errors; the rest are warnings (a valid `status`, `decided_option` set while the status is not `decided`, `decided` with no `decided_option`, `recommended` not one of the options, an option that is not a Source or Route note, the same option twice). There is no `checker:` hint in templates: the folder comes from the checker's folder defaults (`comparison: Sources`), which `folders.comparison` in `trip.md` can change.
- **No Comparisons view** was added to a Base. The Sources folder has no Base, and a view with its own filter could not be tested here.
- **The driving check does not write to the Source notes.** The skill follows `review-travel-times` in Source mode but keeps its results in the scratch folder, so the Comparison note is the only thing written. A Route option with no day-by-day gets only its base-to-base drives checked.
- **`plan-day` reads the Route note whose status is `agreed`** (or `booked`), then `Itinerary/Route.md`, because several Route options can now exist. `late_finish_min` also replaces the fixed hour in plan-day's rule for a day that ends away from an evening base.
- **The made-up example** is in `skills/compare-itineraries/references/`, with the two notes it compares in `example-context/` and the input for the agency's long day. The tests check that its driving figures and prices match the travel script and the quote.

---


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
