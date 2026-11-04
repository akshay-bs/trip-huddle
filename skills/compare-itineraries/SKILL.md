---
name: compare-itineraries
description: Compare two or more itineraries for a trip-huddle trip and write a short Comparison note the group can decide from. The options are Source notes (an agency quote, a friend's plan, a blog itinerary) and/or Route notes (the group's own draft). Use whenever the user asks to compare the quotes, plans or options, "which itinerary is better", "agency A or B", "put the options side by side", "which one should we pick", "what should we ask the agencies". It works out nights, must-see places covered, driving per day, after-dark driving, stays and cost per share for each option, gives a recommendation with reasons and the questions to ask before deciding, and never scores them. When the group decides, it marks the chosen Route note agreed (or makes one from the chosen Source) and offers plan-day. It never changes a place decision or rewrites a day by itself.
---

# Compare the itineraries

A group usually ends up with two to four itineraries: agency quotes, a friend's plan, its own draft. They differ in many ways at once: which towns, how many nights in each, which places, how much driving, what they cost. People compare them by gut feeling, and the loudest voice wins. This skill gives the group four things: **a side-by-side view, the real trade-offs, a recommendation with reasons, and what to ask each agency before deciding.**

**The numbers are for you; the note is for the group.** Work with place priorities, road types, speeds and field names, but the Comparison note and the chat use plain words: no field names, codes or speeds ("one day too much", not `travel_verdict: too much`). Write it the way plan-day writes *Why this plan*.

Rules that do not bend:
- **No scores and no weights.** One score hides the trade-offs and starts arguments about the weights instead of the trip. Give a recommendation and the reasons; the group decides.
- **The group decides.** Recommending an option is not choosing it. Never set a place's `decision`, never change a stay, and never rewrite a Day note. If an option adds places, hand them to `add-source` and `add-place`; if a day needs changing, hand it to `plan-day` or `review-travel-times`, and ask first.
- **Estimates are marked as estimates.** A price you worked out, a drive time, a place count that rests on a guess: say so in the table ("est.") and in the last line of the note.
- **Never invent a number.** Something the option does not say is a finding: write "not said" and put it in *Ask before deciding*.
- **Prices stay with their source** and are compared only here. Never copy a price from one note into another.

The vault root is the current working directory.
**Pipeline:** read the trip → pick the options → work each option out → compare → write the note → validate → report with one question → on a decision, record it.

## 1. Read the trip
- Read `trip.md`: `start_date` and `end_date`, `cost_split_units` and `cost_split_label` (the **cost-sharing unit**: family, couple or person), `currency` and `currency_symbol`, `travellers`, `group_vehicle`, `season`, `bases`, `evening_bases`, `day_start`, `sunset`, `planning_limits` and `group_wishes` (`{must, nice, avoid}`, the group's wishes in its own words; may be empty or missing). Read **Trip facts** in `00 Home.md` and `Memories/MEMORY.md`. Everything about the group comes from here; never assume it.
- Print the limits and speeds in force:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/scripts/travel.mjs" config
  ```
  Besides the speeds, it prints `limits`: `slack_ok_hrs`, `dark_drive_tight_min`, `late_finish_min` and `max_drive_hrs_day`. These are defaults the group changes in `trip.md` as it plans. A day with more driving than `max_drive_hrs_day` is flagged in the comparison. Do not use any other fixed number.
- **Read the locked decisions** in `Decisions/` (it may not exist in an older vault). A decision with `status: locked` is a hard rule. Check every option against them (dates, arrival and departure, route and bases, stay, vehicle, activities already booked). An option that breaks one gets a row in the table, "Breaks a decision you locked: <which, in plain words>", and a question in *Ask before deciding*. Do not recommend it without saying so in the bottom line, and never suggest unlocking as if it were free: say what unlocking would undo. If every option breaks a lock, say that first and ask the user whether to unlock (the `group-decisions` skill does it).
- Read `Templates/Comparison.md`. **The template is the schema:** use its property list, property order and section names. If it does not exist, the vault is older than 0.8.0: tell the user, and ask before you add `Templates/Comparison.md` and the four types `options`, `compared_on`, `recommended` and `decided_option` to `.obsidian/types.json`, copying them exactly from `${CLAUDE_PLUGIN_ROOT}/vault-template/`.
- Everything you create stays inside the vault. Scratch files go in `.claude/scratch/` and get deleted at the end.

## 2. Pick the options
- **Options** are Source notes in `Sources/` that hold an itinerary or quote (a Route summary and a Day by day), and Route notes in `Itinerary/` (the group's own drafts, `Route - Option B`). The user names them, or says "compare the quotes": then take every Source note that holds an itinerary or quote, and every Route note whose status is `draft`. If that is more than four, ask which.
- **Fewer than two:** say so. One option cannot be compared; offer `review-travel-times` on it.
- **A Source that is still only pasted text** (no Route summary or Day by day filled in) goes to `add-source` first.
- **A Comparison note for these options already exists:** update it in place (new date, new figures, answers to the old questions) and keep its `status` and anything the user wrote. Make a new one only for a different set of options.

## 3. Work each option out
Do this for every option the same way, so the columns can be compared. Keep the working in `.claude/scratch/`; the note gets the result in plain words.

| Aspect | How |
|---|---|
| **Bases and nights** | From the option: a Source's *Route summary* and *Day by day*; a Route note's `bases` and `nights_per_base`. Add up the nights and compare with the trip length from `start_date` and `end_date`. A mismatch is a finding. |
| **Places covered** | Match each place the option names to a Location note (name and `aliases`, the way `add-place` does). Count the `priority: must` places covered and missed, then the `should` places. List a place the option includes that the group has `decision: dropped`, and a place it covers that is only `considering`. Places not in the vault yet are counted as "not on our list yet": do not add them (see section 8). For a **Route note**, use its *Day by day* table when it has one (the `build-itinerary` skill writes it), else the places of its Day notes if they exist, otherwise the places reachable from its bases (`nearest_base`), and say it is "reachable, not planned". |
| **Driving, day by day** | Run `review-travel-times` **in Source mode** on every day of the option: its sections 1 to 6 (three estimates per leg, sun times, the legs after dark, `travel.mjs check`). Use the trip dates if the Source gives them, and the season defaults if not (say so). Keep the script's output in the scratch folder. **Do not write the Travel-time check section, and write no Day notes**; the Comparison note is the output. For a Route note with a *Day by day* table, `node "${CLAUDE_PLUGIN_ROOT}/skills/build-itinerary/scripts/route.mjs" check --route <note>` gives the same figures per day from the shared distance file `Logistics/legs.json` (and the road cutoffs and doubling back too); say which links were only rough. For a Route note with no days, check only the drive between consecutive bases (the transfer days) and say that the days in between were not worked out. Note for each day: drive hours (with stops), verdict, when it ends against sunset, and `over_max_drive`. |
| **Group must-haves** | Only when `group_wishes.must` has lines. For each must-have, does the option cover it? From its places and days ("two beach days": count the days with a beach). Note any day that goes against the avoid list ("a second early start on Day 4"). |
| **Pace** | From the days: the longest day of driving and the average, how many days are ok, tight and too much, the early starts (a first drive before `day_start`), and the days over `max_drive_hrs_day`. |
| **After dark** | From the check: the drives on a road to avoid that run past sunset (how long), the days that end late away from an evening base, and places with `after_dark: avoid` scheduled late. Count days; do not list fields. |
| **Stays** | Match each stay the option names to a Stay note. For each: its `decision` and `booking_status`, whether the rooms fit the group (`room_config`, `rooms_needed` against `travellers`), and the comfort the season needs (`heating` and `hot_water` in a cold season; for a hot season, air conditioning if the notes say). A stay with no note is "not looked into yet". Hotels the option does not name are "not named". |
| **Cost** | A Source: the total it states (in its *Notes / opinions from the source*) divided by `cost_split_units`, as a figure **per** `cost_split_label`, in `currency_symbol`. What it says is included and what is extra (entry fees, guides, meals, flights, vehicle). A Route note has no price of its own: add up what the vault has (for each stay chosen or shortlisted for its bases, its `cost_agreed` once booked, otherwise its `est_total`; for the vehicle, the selected Transport note's `cost_agreed`, otherwise its `quote`), divide the same way, and mark the figure **est.**, saying what is missing. A quote in another currency stays in that currency: do not convert it unless the source gives a rate. |
| **Not said yet** | Whatever the option leaves open: the vehicle, the hotel names, what the price includes, the dates, the cancellation terms, the size of the group it was priced for. |

If a Source's own figures do not add up (the nights, the days, the price against the parts), say so under *Not said yet*.

## 4. Compare
- Put the options side by side for each aspect, and find the differences that matter: what one option gets that another misses, and what it costs to get it (a long day, a night drive, a higher price, a stay nobody has looked at).
- **Order of importance for a recommendation:** the `must` places and the group's must-haves first, then whether the days work (driving, daylight, after dark), then the cost per share, then comfort and the unknowns. State the reasons in that order, in plain words.
- **Recommend one option** when you can defend it in two sentences. If the options are close, or the answer depends on something no option has told you (a missing price, hotels not named), say so, name the one thing that decides it, and leave `recommended` empty. Never recommend by adding up points.
- **An option with a too-much day is not ruled out.** Say which day, why, and what could fix it ("splitting Day 5 over two days would work, but that is a change to their plan"). Do not change the plan yourself.
- **Trade-offs:** three to five bullets. Each says what one option gives up for what, with the place, day or amount.
- **Ask before deciding:** the questions to put to each agency or friend before the group commits, in the order of how much each answer could change the result. Draft them; the human sends them. Never contact anyone and never book.

## 5. Write the Comparison note
File: `Sources/Comparison - <short description>.md` (the folder is `folders.comparison` in `trip.md`, default `Sources`), for example `Comparison - Agency quote vs Own draft`. No `[ ] # ^ | : / \ ?` in the name. Start from the template: every property in template order, the FIELD GUIDE comment kept, `{{title}}` and `{{date}}` replaced.
- **Properties:** `options` (a list of quoted wikilinks, one per line, 2 or more), `compared_on` (today, `YYYY-MM-DD`), `recommended` (a quoted wikilink to one of the options, or empty), `status: draft`, `decided_option` empty, `tags` keeps `comparison`.
- **Opening line** under the heading: what is compared, in one sentence, with a link to each option.
- **Side by side:** one column per option, named in the group's words ("Agency quote", "Priya's plan", "Our own draft"), and the rows from the template: Nights, Must-see places, Driving, After dark, Stays, Cost per `<label>`, Not said yet. When `group_wishes.must` has lines, add a row **Group must-haves** after Must-see places: which must-haves each option covers, in the group's words ("2 of 3: misses the boat trip"). Add any other row only when it changes the decision (for example "Places you dropped"). Each cell is a few words: "9 of 11 (misses X, Y)", "up to 6 hrs a day, 2 days too much", "none", "52,000 (quoted)", "47,000 (est.)". Never put a field name, a speed or a code in a cell.
- **Bottom line:** the recommendation and the main reasons, two or three sentences. If there is no clear winner, say that and name what decides it.
- **Trade-offs** and **Ask before deciding**, as in section 4. Group the questions by who they are for (each agency, a friend, the group itself).
- **What this is based on:** one italic line: the date, where each figure came from, which are estimates, the sun dates used, and what could not be found. A drive time is "an estimate from map times, typical speeds and recent local reports; nobody has driven it".
- **Home:** while the status is `draft`, add one line under *Open questions for the group* in `00 Home.md`: `- [ ] Choose between the options: see [[Comparison - …]]`. If the line is there, leave it. The *Ask before deciding* questions stay in the Comparison note.
- A finished example is in `${CLAUDE_PLUGIN_ROOT}/skills/compare-itineraries/references/comparison-example.md` (made up, Portugal; the notes it compares are in `example-context/`). Match its shape and its tone.

## 6. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
For a Comparison note it checks that `options` has two or more links to Source or Route notes, that `status` is `draft` or `decided`, that `decided_option` is one of the options (and empty unless the status is `decided`, as a warning), and that `recommended` is one of the options. Fix every error in the notes you wrote. Report problems in older notes; don't silently rewrite them. Delete `.claude/scratch/`.

## 7. Report to the user and ask
Plain words, short. No field names, codes or speeds. **Lead with the answer, end with one question.**
- **First, the bottom line:** two or three sentences. The recommended option and the main reasons, or "no clear winner yet, and this decides it: …".
- **Then at most three bullets** for the trade-offs that could change the group's mind (what the recommended option gives up, what the other has). Do not repeat the table: link the note (`[[Comparison - …]]`).
- **Then one line on how far to trust it:** the figures are estimates from the quotes and from map times, typical speeds and recent local reports, compared on <date>; nobody has driven them. Name what you could not find (a price, hotel names, a leg with no map time) and any assumption (the sun dates, a Route note whose days were not worked out).
- **Last, one question.** If you can recommend: "Do you want to go with <option>?" If you cannot: the single question that decides it ("Can you ask Agency A which hotels are in the price?"). When the group answers a "go with it", do section 8. Do not record a decision from a recommendation, from "sounds good", or from the user asking for a re-check.

## 8. When the group decides
Only when the user says which option they chose. Then:
1. **The Comparison note:** `status: decided` and `decided_option` (a quoted wikilink to the chosen option). Leave `recommended` as it was: it is a record of what was advised.
2. **A Route note was chosen:** set that note's `status` to `agreed`. The other Route options stay `draft`; delete nothing.
3. **A Source was chosen:** make its route a Route note. If `Itinerary/Route.md` is still the empty starter (no bases), fill it in. Otherwise create `Itinerary/Route - <label>.md` from `Templates/Route.md`. Either way: `bases`, `nights_per_base` and `total_nights` from the Source's Route summary, `status: agreed`, the *Bases and nights* table (with *Getting there* where the Source says it), two or three plain bullets of *Why this route* from the Comparison's bottom line, and the unanswered questions about this option under *Open questions*. `plan-day` follows the Route note whose status is `agreed` (or `booked`).
4. **Home:** remove the *Choose between the options* line from *Open questions for the group*. Add a line for each *Ask before deciding* question about the chosen option that is still unanswered, for the group to follow up.
5. **Places the chosen option adds** that are not in the vault: offer `add-source` (for the Source note) and then `add-place`, and say they will come in as `considering`. **Places in it that the group dropped or has not selected:** list them and ask. Never change a `decision` yourself.
6. **Offer `plan-day`** for the days of the chosen route, in one line. If the chosen option has a day that was too much, say so and offer `review-travel-times` on it.
7. **Decisions:** if the chosen option settles a question in `Decisions/`, offer `group-decisions` to record it as decided. If it breaks a locked decision, do not go ahead until the user has unlocked it.
8. **Validate again** (section 6) and report in a few lines: what was recorded, what was offered.
