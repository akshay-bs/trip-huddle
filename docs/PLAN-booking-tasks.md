# Plan: booking tasks that lock decisions

Status: planned (v0.11.0).

## The problem
In the `booking` stage the group has things to close before it travels: flights or trains, a vehicle for the whole trip, the stays, a jeep safari, permits for a few places, and whatever comes up. Only stays (`booking_status`, the *Booking tracker*) and the vehicle (`Logistics/Transport.md`) have a place for this today. The rest has no deadline, no cost and no link to the decision it fixes, and the user must remember to tell `group-decisions` to lock it.

The vault needs: **one checklist of what is left to book, each item with a deadline, a status and a cost, and closing an item locks the Decision it belongs to.**

## What already covers part of it
- **Stay notes** (`booking_status`, `booking_ref`, `advance_paid`, `cancellation_policy`, `est_total`) and **`Transport.md`** (`booking_status`, `quote`) stay the record of those bookings. A task for them links to the note and holds no cost or reference of its own.
- **`booking_status`** and its values are reused on the task, so "booked" means the same everywhere.
- **Decision notes** are unchanged: the task links to one, `locked_by` can link back, and `deadline` has one meaning on both.

So a task is the to-do around a booking: by when, who is on it, which decision it closes. Things with no note of their own (flights, a safari, a permit, insurance) keep their details on the task.

## The Booking note
New note type `booking`, from `Templates/Booking.md`, kept in a new `Bookings/` folder, named `Book - <short thing>` ("Book - Flights", "Book - Van", "Book - Kaziranga jeep safari").

**Why `Bookings/`, not `Logistics/`:** tasks are many and short-lived, while `Logistics/` holds a few reference notes (Transport, the group's own lists). Its own folder keeps the checklist easy to browse, parallels `Decisions/`, and keeps the checker's folder rule strict (a shared folder only warns about untyped notes). It is `booking: Bookings` in the default `folders` map, so `trip.md` can move it.

| Property | Meaning |
|---|---|
| `kind` | `travel` (flights, trains, buses), `vehicle`, `stay`, `activity` (safari, boat, tickets), `permit` (permits, reservations), `other` |
| `books` | Links to the notes it books (a Stay, `Transport`, a Location); empty for flights |
| `locks_decision` | A link to the one Decision it closes, or empty |
| `booking_status` | `not-contacted`, `enquired`, `quoted`, `booked`, `paid`, `cancelled`, `not-needed`. Done is `booked` or `paid`; closed is done or `not-needed` |
| `deadline` | The date by which it must be closed (on a Decision: decided; here: booked), only if a source or the group gave one |
| `cost` | Total for the group, plain number. Empty when `books` is a Stay or Transport (their `est_total` or `quote` counts) |
| `advance_paid` | Same name and meaning as on a Stay |
| `provider` | Who it is booked with (airline, agency, park office), in words |
| `booking_ref` | As on a Stay; never copied to a Decision |
| `booked_on` | Date it was booked |
| `who` | Who in the group is handling it, in words |
| `tags` | includes `booking` |

Body: one line on what it holds up, *Details* (what is included, how to pay) and *History*. `kind` maps to the usual `locks` (travel: dates, arrival, departure; permit: place; the others by name) for when the skill makes a Decision for a task.

## Closing a task locks the decision
The existing "Locked" step of `group-decisions`, run when the user says something is booked or paid:
1. Set the task's `booking_status`, `booked_on` (only when the user says it was booked now) and a *History* line.
2. If `locks_decision` is set, lock that Decision with `locked_by: "[[Book - …]]"`. If it is still `open`, `decided_option` is the option matching `books`, or ask; never guess. Then the existing follow-ups (`dates_fixed`, the stage), on a yes.
3. A task for a Stay or Transport also moves that note's `booking_status`, on a yes.
4. `cancelled` after booking: the lock rests on nothing, so run the existing unlock step (ask first).
5. `not-needed`: nothing is locked.

`locked_by` stays free text for locks with no task ("budget agreed"); when it is a link, it must be a Booking note.

## Bases and the home page
`Bases/Bookings.base` has three views: **To do** (not closed, sorted by `deadline`), **Done** (booked or paid, with Sum on `cost`, `advance_paid` and a per-split formula that `trip-init` writes, like the Stays base) and **All** (grouped by `kind`). `00 Home.md` gets **Bookings to close** (`![[Bookings.base#To do]]`) just before *Stays to book*, which stays. The *Budget snapshot* gets an **Other bookings** line: the `cost` of tasks not cancelled or not-needed (stay and vehicle tasks have no cost, so nothing counts twice).

## The skill
**Extend `group-decisions`, not a new skill.** Its triggers already are the booking phrases ("flights are booked", "what's left before we book"), its `booking` stage already leads with "decided but not booked", and its lock step is the one a task calls. A second skill would compete for the same requests and duplicate both steps. The task procedure goes in `skills/group-decisions/references/booking-tasks.md`, with a short step in `SKILL.md` and new phrases in the description ("what's left to book", "add the permits to the list").

It proposes tasks and asks; it never creates a batch silently:
- when a decision becomes `decided` and its `locks` need a booking: one task linked to it;
- when the stage moves to `booking`, or on "what do we need to book": the usual set from the vault (travel, the vehicle if Transport is not booked, selected stays not booked, selected places whose `permits` says one is needed), minus what has a task;
- when the user names one ("add travel insurance").

Deadlines and costs come only from a source or the user. In the `booking` stage the summary lists open tasks and open decisions together, nearest deadline first.

## The checker
`bookingChecks`, like `decisionChecks`. `booking: Bookings` joins the default `FOLDERS`.

Errors: `booking_status` not one of the seven; `locks_decision` set but not a single link.

Warnings (only what can be read reliably): `locks_decision` is not a Decision note; a booked or paid task whose Decision is not locked; a `locked_by` link to anything but a booked or paid Booking note; a task and its Stay or Transport disagreeing on whether it is booked; a task that books a `dropped` note; `cost` on a task for a Stay or Transport; `advance_paid` over `cost`; an open Decision whose `deadline` is after its open task's (it must be decided before it can be booked). Nothing that depends on today's date.

## Tests (scripts/test.mjs)
- Template, base, types and home section identical in both vaults; the home page embeds `Bookings.base#To do`.
- The example's Booking notes pass cleanly and hold no dates, refs, providers or costs.
- Each error and warning above fires on a changed copy of the example and goes quiet once fixed; a text `locked_by` still passes.
- A Booking note outside `Bookings/` is an error; `folders: {booking: Logistics}` moves it.
- `trip-init`: a new vault gets the files and passes; the `Bookings.base` split follows `cost_split_units`; `--reconfigure` leaves the example unchanged; `--add-bookings` upgrades a 0.10 copy, then changes nothing.
- `group-decisions` names booking tasks and `locks_decision`; the roadmap and this plan say built.
- The broken vault gains a Booking note with a bad `booking_status`.
- Update the existing tests that rely on `locked_by: van booked` and on the example's decision count.

## trip-init and older vaults
A new vault gets `Templates/Booking.md`, `Bases/Bookings.base`, `Bookings/`, the home section and the new types (`books` multitext, `locks_decision`, `provider`, `who` text, `cost` number, `booked_on` date; the rest exist). The script writes the `Bookings.base` split on every run. A vault made before 0.11.0 gets them with `trip-init --reconfigure --add-bookings` (like `--add-food`: adds files and sections, touches no notes); `group-decisions` notices a missing `Templates/Booking.md` and asks before running it. The vault `.claude/CLAUDE.md` rule and the Decision template's `locked_by` guide line say "link to the Booking or Stay note that holds the details".

## Example vault (privacy rules apply)
Made up, with no dates, names, providers, references or prices:
- `Book - Van for the trip`: kind vehicle, `booked`, `locks_decision: "[[Decision - How we get around]]"`, which now has `locked_by: "[[Book - Van for the trip]]"`.
- `Decision - Kaziranga jeep safari` (decided, locks activity, affects the park) and `Book - Kaziranga jeep safari`: kind activity, `not-contacted`, books `[[Kaziranga National Park]]`, linked to that decision. Its *Details* point to the park note's public `permits` line only.

## Version
0.11.0 in `.claude-plugin/plugin.json` and `marketplace.json`; roadmap item ticked with a pointer here; this plan's status set to built; the repo `CLAUDE.md` (folders, the Checks paragraph) and `README.md` updated.

## Made easy for the next step: booking deadlines
- Cancellation cut-offs and payment due dates can be added as `cancel_by` and `pay_by` on the task (and later on Stay and Transport); no name here clashes.
- Tasks and Decisions share `deadline`, so one **By deadline** view can filter `type == "booking" || type == "decision"` and sort on one column.

## Not in this version
No reminders, overdue warnings, cut-offs or payment due dates (next item). No splitting who paid what (that is *After travel*). No automatic task for every selected place. No moving booking fields off the Stay or Transport notes.

## Open questions
1. `Bookings/` (recommended) or `Logistics/` for the tasks?
2. Should stays get a task each once their decision is decided, or stay only in the Stays *Booking tracker*?
3. Is `who` (who in the group handles it) wanted, or too personal for a shared vault?
4. When the user says "it's booked" and the task has a Decision, lock it straight away and report (as `group-decisions` does today for "flights are booked"), or always ask first?
5. Is `not-needed` the right extra status, or should a task that is not needed just be deleted?
