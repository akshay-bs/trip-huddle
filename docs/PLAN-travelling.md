# Plan: travelling skill (a plan for today, and a quick re-plan)

Status: proposal (not built).

## The problem
Once the group is on the road, the plan meets the real world. Two things come up again and again.

**Every morning** the group needs the same few answers, fast, often on a phone with one bar of signal:
- What is today? Where do we sleep tonight?
- When do we leave? When is sunset?
- What is booked today, and what do we have to carry or show?
- Which drive is the risky one?

**Mid-trip, something slips.** A road is closed. Someone is sick. It rains for a day. The morning ran late. A place is shut on the day we reached it. Now the group asks: what moves, what is at risk, and what does it cost?

Today the vault has no answer for this. `plan-day` builds days from scratch and `review-travel-times` checks them, but nothing says "it is Day 4, the road to Dawki is shut, what now?". Worse, a re-plan on the road is where mistakes cost real money: moving a night can break a booked stay, and nobody remembers the cancel date.

The vault needs: **a short brief for today, and a quick re-plan of the days that are left, that keeps everything the group has locked and never moves a booking without asking.**

## Two pieces
1. **Today:** a short brief for one day, made from the Day note, the stay and the bookings.
2. **Re-plan:** 2 or 3 options for the remaining days when something slips, each checked with the existing travel-time and sunset logic.

### New skill or more modes?
Recommendation: **one new skill, `on-the-road`, with the two pieces as its two modes.** It reuses `plan-day` and `review-travel-times` for all the arithmetic and does not copy them.

| Choice | For | Against |
|---|---|---|
| Add modes to `plan-day` | One skill less | `plan-day` is already 10 steps long and builds days from nothing. Re-planning has other rules (some days are done, locks matter more, the group is in a hurry). The two would pull against each other |
| Spread it over `plan-day`, `review-travel-times` and `group-decisions` | Nothing new to learn | The brief and the re-plan belong together and are asked for in the same words ("what's today", "the road is shut"). Three skills would each own a piece, and nobody the whole |
| **New skill `on-the-road`** | One place for "we are travelling". Short on purpose. It can be triggered by the stage and by plain words. The booking and lock rules are written once | A tenth skill. The existing ones must stay the only place for drive and sun arithmetic |

What it reuses, and does not copy:
- `plan-day`: the way a Day note is written (legs, schedule, meals, backup plan, slack and verdict), and `sun.mjs` for sunrise and sunset. A changed day is written by following `plan-day`'s steps 3 to 9, not by a second copy of them.
- `review-travel-times`: `travel.mjs check` for the verdict of every option.
- `group-decisions`: the locks, `references/booking.md` and its deadline fields. A booking that falls through goes through its lifecycle, not through this skill.
- `build-itinerary`: only the idea of options with "what it makes possible / red flags / what it costs". It does not rebuild the route.

## Hard rules
These do not bend, and the skill says them to the group in plain words when they matter.
- **The group decides.** The skill offers options and says which it would pick, if asked. It never chooses, and it never changes a note until the group says which option.
- **Locked means locked.** A locked decision (dates, arrival, departure, route, stay, vehicle, activity) is not moved, not offered as an ordinary fix, and not worked around. An option that would break one is shown apart, as "needs unlocking", with what unlocking costs. Only the group unlocks, through `group-decisions`.
- **Booked is not moved silently.** A booked or paid stay, the booked vehicle, and a booked place or activity stay where they are. Any option that touches one (a night moved, a stay dropped, a ticket missed) is marked "touches a booking", and the question to the group comes with its dates: `cancel_by` (was it passed?), `payment_due`, `balance_pending`, and what the cancellation policy says. If a date has passed, it says so plainly ("free cancellation ended on the 12th").
- **Never invent facts from the road.** A closed road, a shut place or a weather forecast comes from the user or from a source with its date. The skill says "you told me" or "reported on <date>", and "not known" when it does not know.
- **Past days are not rewritten.** A day that is `done` stays as it was. What really happened is added beside the plan, not over it.
- **The stage.** The skill runs when `trip.md` has `stage: travelling`. If the stage is still `booking` and the user asks for today, it answers, then asks whether to move the stage (the user says it; the skill never changes it alone). Before `travelling`, a re-plan is just `plan-day`.

## Piece 1: the Today brief
Asked as "what's today", "plan for today" or "morning brief". It is made from the Day note whose `date` is today (or the day number the user names), the Stay note for tonight, the Booking and Location notes with booking details, and `travel.mjs` / `sun.mjs` for the numbers.

It is short on purpose. At most about 15 lines, in this order, no tables:
1. **Day and place:** "Day 4, Shillong to Sohra. Sleeping at <stay>."
2. **Leave at:** the time of the first drive, and the latest safe time to leave.
3. **Sunset:** the time, and the slack the plan gives ("1.5 hrs to spare").
4. **The risky drive:** the one leg with an after-dark or road-cutoff note, and when it must end.
5. **Booked today:** each item with its time, the name on the booking and where the voucher is (a link, never the reference itself in chat if the group has said not to).
6. **Next deadline:** the soonest `payment_due` or `cancel_by` in the next 3 days.
7. **Backup:** the Day note's backup plan, in one line.
8. **Food:** the planned lunch or dinner spot, if one is selected.

Where it lives is open (see the questions). The recommendation is chat only, plus the normal Day note, which already holds the same facts. A phone with no signal can still open the Day note in Obsidian.

## Piece 2: the re-plan
Asked as "the road to Dawki is shut", "Priya is sick, skip tomorrow", "we left two hours late", "it rains all day".

### Step by step
1. **Read the trip.** `trip.md` (stage, dates, limits, cutoffs), every Decision note (the locked ones first), the Stay, Transport and Booking notes with their dates, and every Day note from today on. Days before today are not touched.
2. **Ask what happened,** in one short question if the message left it open: what slipped, until when, who is affected.
3. **Work out what moves.** The days left, the places on them, and which of those the user marked `must`. List what is **at risk** (a place that may be missed), what is **fixed** (locked, booked) and what is **free**.
4. **Build 2 or 3 options** from the list below. Always at least two. Always include "change nothing" when it is real (a late start that still fits the daylight).
5. **Check each option** with the existing logic, not with new arithmetic: `sun.mjs` for sunrise and sunset of each day, and `travel.mjs check` for drive, stops, after-dark minutes, cutoffs and the verdict (ok, tight, too much). An option that is too much, or breaks a cutoff, is shown with the reason and not offered as a fix.
6. **Show the options side by side,** short (see below). Say which bookings each one touches, with their dates.
7. **The group picks.** Only then are Day notes changed, through `plan-day`'s steps. The old plan is kept in the note's *History* line, not deleted.
8. **Record it** (below), validate, and report in a few lines.

### The kinds of option
| Option | What it does | What to check |
|---|---|---|
| Drop a nice-to-have | Removes a place that is not a `must` from the days at risk | Which bookings (a ticket) and which wishes it loses |
| Shorten a day | Keeps the base, cuts places or a long leg | Slack and verdict after the cut |
| Swap two days | Does the open day first, the shut one later | Whether either day has a booked place or a stay change; each leg and its cutoff |
| Move a place to the backup plan | The place goes into the Day note's backup section, `scheduled_day` is cleared, the decision is not changed | That it stays `selected` unless the group says otherwise |
| Push the rest of the trip | Moves every later day by one | Almost always touches a booking: every stay night, the vehicle's days. Offered only when no lock forbids it, and always with the dates |
| Rest day | Keeps the base and does nothing planned | The booked items of that day |

An option names its price in plain words: "loses Krem Chympe (a must), keeps all bookings" or "keeps every place, moves the Sohra night (booked, free cancellation ended on the 12th)".

### What the group sees
A short list, one block per option, readable on a phone. Each block is four lines: what changes, what we lose, what is touched (with dates), and the verdict of the changed days. Then one question: "Which one?"

## What gets recorded
Keep it small. The "After travel" item needs to know what really happened, but no new note type is needed.

**Day Plan template, two new properties and one section:**

| Property or section | Meaning |
|---|---|
| `day_status` | `planned` (default), `done`, `changed` (the day was re-planned or went differently), `skipped` (nothing planned happened) |
| `skipped` | Links to the places on this day's plan that did not happen. A list, empty by default |
| *What happened* (section) | A few plain lines: what we really did, when we arrived, what went wrong. Written by the user's words, never guessed |

- The plan is not overwritten. A changed day keeps its Schedule; the real story goes in *What happened*.
- A skipped place keeps `decision: selected`. Its `scheduled_day` is cleared so it shows in the Locations base's *Selected but unscheduled* view. A "would we go again" note is a later job (After travel).
- `day_status` is a closed value list in the Day template's FIELD GUIDE, so the checker reads it by itself.
- The skill sets `day_status` when the user says it ("we did Day 3 as planned" sets `done`). It does not ask for anything more than a word.
- Booking facts do not change here. A booking that falls through is handled by `group-decisions` (the item goes to `dropped` or `backup`, the Decision is unlocked with a reason).

**Which files change** (both `vault-template/` and `example-vault/`, together, as CLAUDE.md says):
- `Templates/Day Plan.md`: the two properties after `rule_bends`, FIELD GUIDE lines, the *What happened* section after *Backup plan*.
- `.obsidian/types.json`: `day_status` (text) and `skipped` (list).
- `Bases/Itinerary.base`: a `day_status` column in the *Days* view. Optionally a *Today* view (`date` is today).
- `00 Home.md`: only if the group wants a Today section (see the questions).
- `trip.md`: no new setting. `stage` already has `travelling`.

The example vault has no Day notes, so it only gets the template, types and base changes. No real dates or names go into it.

## Phone and no signal
- The brief is short and ordered by what is needed first. No tables, no field names.
- Everything in it also lives in the Day note, so it can be read offline in Obsidian.
- The skill says when a figure is old ("drive times checked on the 3rd") and never shows a live road report it does not have.
- A printable or exported version is not part of this version (see the questions).

## The checker
Errors: none new. A wrong `day_status` is already caught by the value list.

Warnings (only what can be read reliably):
- `day_status` is `done`, `changed` or `skipped` and the `date` is in the future.
- `stage` is `travelling` and a Day note with a `date` before today has no `day_status` ("record what happened on this day").
- `day_status: skipped` or `skipped` lists a place that still has `scheduled_day` pointing at that day.
- `skipped` links a note that is not in the day's `locations`.
- `day_status: changed` and the *What happened* section is empty.
- `day_status: done` while `travel_verdict` is `too much` and `rule_bends` is 0 is fine: it happened. No warning.

## Tests (scripts/test.mjs)
- Both vaults have the same Day template, types and Itinerary base for the new fields; the example still has 0 errors.
- Each new warning fires on a changed copy and goes quiet once fixed. The broken vault gains a Day note with a skipped place that is still scheduled.
- `trip-init --reconfigure` leaves the example unchanged. A new vault gets the fields and passes. `--add-travelling` upgrades a 0.14 copy and then changes nothing.
- The `on-the-road` skill file mentions the rules: locks, bookings with `cancel_by` and `payment_due`, the 2 or 3 options, and that it reads `travel.mjs`.
- A made-up re-plan in `skills/on-the-road/references/` (a closed road on a made-up Portugal day, as `plan-day` and `review-travel-times` already use) passes the checker, and its verdicts match `travel.mjs`.
- Both manifests have the same version.

## trip-init and older vaults
A new vault gets everything. A vault made before 0.15.0 gets it with `trip-init --reconfigure --add-travelling`, after asking:
- adds `day_status` and `skipped` to the Day Plan template and the FIELD GUIDE, the *What happened* section, the types, and the Itinerary base column;
- adds the Today section to the home page, if the group chose one;
- changes no existing Day note. A Day note with no `day_status` reads as `planned`.

A migration script is not needed. There are no values to compute. `on-the-road` checks for `day_status` in `Templates/Day Plan.md` and offers the upgrade if it is missing.

## Version and other files
- 0.15.0 in `.claude-plugin/plugin.json` and `marketplace.json`.
- `docs/ROADMAP.md`: tick the item with a pointer here. `README.md` and `docs/SKILLS.md`: a "Travel" line and the tenth skill. `CLAUDE.md`: the skill list, and a "Travelling (v0.15.0)" paragraph under Checks.
- `skills/group-decisions` reads `stage: travelling` already ("only what blocks the next days"). It gets one line: it points to `on-the-road` for today.

## Privacy
The example vault gets only empty fields and the template changes. No trip dates, no group, no names, no booking details. The made-up re-plan in `references/` uses an invented place and invented dates, like the other made-up Day notes.

## Not in this version
No live data: no weather, traffic or road-closure feed. No alarms or reminders. No automatic stage change. No expense log or "would we go again" note (After travel). No rebuilding of the whole route: a large change goes back to `build-itinerary`.

## Questions for you
1. **New skill or extend `plan-day`?** Suggested: a new skill, `on-the-road`, with a Today mode and a Re-plan mode, reusing `plan-day`, `travel.mjs` and `group-decisions`.
2. **Where does "today" live?** A note, a home-page section, or chat only? Suggested: chat only, built from the Day note, which is already readable offline. No new note.
3. **How much do we record about what happened?** Suggested: only `day_status`, a `skipped` list and a few lines under *What happened* on the Day note. No times, no costs, no ratings (those are After travel).
4. **Offline or printable version?** Suggested: not in this version. The brief is short enough for a phone, and the Day note opens offline in Obsidian.
5. **Who can ask for a re-plan?** Anyone in the group can ask for options. Who says "go with option 2"? Suggested: whoever holds the vault, after asking the group; the skill never takes a vote.
6. **How far can a re-plan reach?** Suggested: it may move places and days inside the trip, but moving a night or the vehicle is shown only as "touches a booking" with its dates, and never a default option.
