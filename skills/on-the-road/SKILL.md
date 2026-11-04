---
name: on-the-road
description: Help a trip-huddle group while it is travelling. Two things. Today brief ("what's today", "plan for today", "morning brief", "what's booked today", "when do we leave"): a short answer, built from the Day note, tonight's stay and the bookings, that fits a phone with one bar of signal. Re-plan ("the road to Dawki is shut", "Priya is sick, skip tomorrow", "we left two hours late", "it rains all day", "the place was closed"): two or three options for the days that are left, each checked for drive time and daylight, each saying which bookings it touches and their dates. It also records how a day went (done, changed, skipped, and a few lines of what happened). The group decides; it never moves a lock or a booking by itself.
---

# On the road

Once the group is travelling, the plan meets the real world. Every morning the group needs the same few answers, fast. And now and then something slips: a road is shut, someone is ill, it rains, the morning ran late. This skill gives **a short brief for today**, and **two or three options for the days that are left** when something slips, without breaking what the group locked or booked.

**The Day notes are the plan; the group's words are the news.** Everything in the brief is already in the Day note, which also opens offline in Obsidian. Turn the research fields into plain sentences. No field names, no tables, no raw values in the chat.

Rules that do not bend. Say them to the group in plain words when they matter.
- **The group decides.** You offer options and say which one you would pick, if asked. You never choose, and you never change a note until the group has said which option. Anyone in the group can ask for a re-plan. Whoever holds the vault says "go with option 2" after asking the group. Never take a vote and never count one.
- **Locked means locked.** A locked decision (dates, arrival, departure, route, stay, vehicle, activity) is not moved, not offered as an ordinary fix and not worked around. An option that would break one is shown apart, as "needs unlocking", with what unlocking costs. Only the group unlocks it, through `group-decisions`.
- **Booked is not moved silently.** A booked or paid stay, the booked vehicle, and a booked place or activity stay where they are. Any option that touches one (a night moved, a stay dropped, a ticket missed) is marked **touches a booking**, and the question to the group comes with its dates: `cancel_by` (has it passed?), `payment_due`, `balance_pending` and what the cancellation policy says. If a date has passed, say so plainly ("free cancellation ended on the 12th"). Moving a night or the vehicle is shown only like this, never as a default option. A booking that falls through goes through `group-decisions`, not through this skill.
- **Never invent facts from the road.** A closed road, a shut place or a forecast comes from the user or from a source with its date. Say "you told me" or "reported on <date>", and "not known" when you do not know. Never show a live road report you do not have, and say when a figure is old ("drive times checked on the 3rd").
- **Past days are not rewritten.** A day that is `done` stays as it was. What really happened is written beside the plan, in *What happened*, never over it.
- **The stage.** Work when `trip.md` has `stage: travelling`. If the stage is still `booking` and the user asks for today, answer, then ask whether the trip has moved on. Only the user says it; you never change `stage` yourself (the `trip-init` skill does, on request). Before `travelling`, a re-plan is just `plan-day`.

The vault root is the current working directory. Scratch files go in `.claude/scratch/` and get deleted at the end.

## 0. Read the trip
- `trip.md`: `stage`, `start_date`, `end_date`, `group_vehicle`, `planning_limits`, `road_cutoffs`, `group_wishes`. Read `Templates/Day Plan.md`. If it has no `day_status`, the vault is older than 0.15.0: tell the user what is new (a status and a skipped list on Day notes, a *What happened* section) and **ask before adding it** with the `trip-init` skill and `--add-travelling` (it touches no notes). Until then, work from the chat only.
- Every note in `Decisions/`, **locked ones first**. Read the Stay, Transport, Booking and Location notes the days use, with `booking_status`, `cancel_by`, `payment_due`, `balance_pending` and `cancellation_policy` (see `${CLAUDE_PLUGIN_ROOT}/skills/group-decisions/references/booking.md`). Never repeat a booking reference or a confirmation's contents in the chat.
- The Day notes: today's, and every later one for a re-plan. Which day is "today"? The Day note whose `date` is today, or the day number the user names. If no note matches, say so and ask.

## 1. Today brief
Asked as "what's today", "plan for today", "morning brief". At most about 15 lines, in this order, as short sentences (no tables):
1. **Day and place:** "Day 4, Shillong to Sohra. Sleeping at <stay>."
2. **Leave at:** the time of the first drive, and the latest safe time to leave (the Day note's `start_time`; the latest is that time plus the day's slack in the Itinerary base, so the day still ends before sunset).
3. **Sunset:** the time, and what the plan leaves spare ("1.5 hrs to spare"). Take sunrise and sunset from the Day note; if the date or the base changed, work them out again with `${CLAUDE_PLUGIN_ROOT}/skills/plan-day/scripts/sun.mjs`.
4. **The risky drive:** the one leg with an after-dark or road-cutoff note, and when it must end.
5. **Booked today:** each item with its time, the name it is booked under and where the voucher is (a link to the note in `Confirmations/`, never the reference).
6. **Next deadline:** the soonest `payment_due` or `cancel_by` in the next 3 days, if any.
7. **Backup:** the Day note's backup plan, in one line.
8. **Food:** the planned lunch or dinner spot, if one is selected.

A line with nothing to say is left out. The brief lives **in the chat only**; do not write a note for it. If the Day note's drive times were checked a while ago, say when. If the user adds news ("the bridge is out"), go to section 2.

## 2. Re-plan
Asked as "the road to Dawki is shut", "Priya is sick, skip tomorrow", "we left two hours late", "it rains all day".

1. **Ask what happened,** in one short question if the message left it open: what slipped, until when, who is affected. Record it as what the user told you.
2. **Work out what moves.** The days left (today included, if it is not over), the places on them, and which of those the group marked `must` in `priority`. List what is **at risk** (a place that may be missed), what is **fixed** (locked, booked) and what is **free**. Days before today are not touched.
3. **Build 2 or 3 options** from the table below. Always at least two. Include "change nothing" when it is real (a late start that still fits the daylight).
4. **Check each option with the existing scripts, not with new arithmetic.** Sunrise and sunset of each day with `${CLAUDE_PLUGIN_ROOT}/skills/plan-day/scripts/sun.mjs`, and drive, stops, after-dark minutes, cutoffs and the verdict (ok, tight, too much) with `${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/scripts/travel.mjs check --input <file>`; the input and the way to read the output are in the `review-travel-times` skill, section 5. A road told to be shut is `"blocked"` in the input. An option that is **too much**, or that breaks a cutoff, is shown with the reason and is not offered as a fix.
5. **Show the options side by side,** short (below). Say which bookings and locks each one touches, with their dates.
6. **The group picks.** Only then change Day notes, and only the days from the next one on, by following `plan-day` steps 3 to 9 (`${CLAUDE_PLUGIN_ROOT}/skills/plan-day/SKILL.md`), not a second copy of them. Keep the old plan in one line under *Notes* ("Re-planned on <date>: was <the old plan>") and set `day_status: changed`. A day that is already underway or over keeps its plan; use section 3.
7. **Record it** (section 3), run the checker, and report in a few lines.

| Option | What it does | What to check |
|---|---|---|
| Drop a nice-to-have | Takes a place that is not a `must` off the days at risk | The bookings (a ticket) and the wishes it loses |
| Shorten a day | Keeps the base, cuts places or a long leg | Slack and verdict after the cut |
| Swap two days | Does the open day first, the shut one later | A booked place or a stay change on either day; each leg and its cutoff |
| Move a place to the backup plan | The place goes into the Day note's backup plan and `scheduled_day` is cleared. The decision does not change | That it stays `selected` unless the group says otherwise |
| Push the rest of the trip | Moves every later day by one | It almost always touches a booking (every stay night, the vehicle's days). Show it apart, with the dates, only when no lock forbids it; it is never a default option |
| Rest day | Keeps the base and plans nothing | The booked items of that day |

An option names its price in plain words: "loses Krem Chympe (a must), keeps all bookings" or "keeps every place, moves the Sohra night (booked, free cancellation ended on the 12th)".

**What the group sees:** one block per option, readable on a phone, each four lines: what changes, what we lose, what is touched (with dates), and the verdict of the changed days. Then one question: "Which one?" A made-up example is in `${CLAUDE_PLUGIN_ROOT}/skills/on-the-road/references/replan-example.md`. Match its shape and tone.

If the change is large (the route itself), say so and send the group to `build-itinerary` rather than rebuilding it here.

## 3. Record how a day went
Keep it small. Set it when the user says it ("we did Day 3 as planned" is `done`); ask for nothing more than a word.
- **`day_status`:** `planned` (default, nothing recorded yet), `done`, `changed` (the day was re-planned or went differently) or `skipped` (nothing planned happened).
- **`skipped`:** links to the places on the day's plan that did not happen. Clear `scheduled_day` on each, so it shows in the Locations base as selected but unscheduled. It keeps `decision: selected`; whether the group would go again is a later job.
- **What happened** (the section after *Backup plan*): a few plain lines, in the group's words: what we really did, when we arrived, what went wrong. Say where it came from ("told by the group on 10 Jun"). Never guess. No times, costs or ratings.
- The plan is not overwritten. A changed day keeps its Schedule; the real story goes in *What happened*. A made-up note is in `${CLAUDE_PLUGIN_ROOT}/skills/on-the-road/references/changed-day-example.md`.
- Booking facts do not change here. A booking that falls through goes to `group-decisions` (the item becomes `dropped` or `backup`, the Decision is unlocked with a reason).

## 4. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
Besides the usual checks, it warns when a day is `done`, `changed` or `skipped` and its date is still ahead, when the stage is `travelling` and a past day is still `planned`, when `skipped` lists a place that is not in the day's `locations` or one that still has `scheduled_day` on that day, and when a `changed` day has nothing under *What happened*. Fix every error and warning in the notes you wrote. Delete `.claude/scratch/`.

## 5. Report to the user
Short plain words, for a phone. No field names or raw checker output.
- After a brief: the brief itself, nothing before it.
- After a re-plan: which option was chosen, which days changed, and what the old plan was. Anything that touches a booking and the next date to act on. Anything the user told you that still needs checking.
- Offer `group-decisions` when a booking or a lock has to change, once, in one line.
