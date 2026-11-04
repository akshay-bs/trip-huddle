---
name: group-decisions
description: Keep track of what a trip-huddle group still has to decide, and what it has fixed. Use whenever the user asks "what do we still have to decide", "what's open", "what's left before we book", "update the open questions", "where are we on the budget", or says something was decided, booked, paid or agreed ("flights are booked", "we booked the van", "we're going with the Sohra Plaza", "let's lock the dates") or asks to change something that was fixed ("can we unlock the dates"). Also use it for the booking list: "what's left to book", "we paid the advance", "here's the voucher", "the hotel has no room for us", "add travel insurance to the list". It gathers the open questions from the vault, creates and updates Decision notes in Decisions/, keeps the booking details on each selected stay, vehicle or place (and small notes in Bookings/ for flights, trains, permits and insurance), locks a decision when its booking is made, refreshes the home page's open questions and budget snapshot, and gives a short summary ordered by deadline. A decision can be open, decided or locked; a locked decision is a hard rule for every other skill. It never decides for the group and asks before unlocking anything.
---

# Group decisions

Early on, everything is open and the group argues about places. Later it books flights, a vehicle, a stay, a safari, and each booking hardens a decision. This skill keeps one honest list of what is still open, records what the group decided, and marks what is **locked** so every other skill treats it as a rule.

**The notes are for the group.** A Decision note and the summary use plain words and the group's own names for things. No field names or codes in the text the group reads.

Rules that do not bend:
- **The group decides.** Record what the user says; never choose. Do not turn an option into the decision because you prefer it, because it is the only one left, or because the deadline is near. Say what you recommend, if asked, and leave the status alone.
- **Locked means locked.** Only the user says a decision is locked (or confirms your proposal: "you've said the flights are booked; shall I lock the dates, arrival and departure?"). Never unlock one without asking, and write the reason down.
- **No private details in Decision notes.** Booking references, flight numbers, ticket details, amounts and confirmations stay on the booked item's own note (Stay, Transport, Location or a note in `Bookings/`) and in `Confirmations/`. A Decision note links to them.
- **Never invent a deadline or a cost.** A deadline comes from a source or from the user. A missing figure is "not known yet", not an estimate you make up.
- **Do not change other notes' decisions.** Moving a place or stay to `selected` or `dropped` is the user's call: ask, and do it only when told.

The vault root is the current working directory.
**Pipeline:** read the trip → gather what is open → create or update Decision notes → record what the user said (decide, lock, unlock, book) → refresh Home → validate → summarise.

## 1. Read the trip
- Read `trip.md`: `stage` (`planning`, `booking`, `travelling` or `after`; an older vault without it is `planning`), `start_date`, `end_date`, `dates_fixed`, `cost_split_units` and `cost_split_label` (the **cost-sharing unit**), `currency` and `currency_symbol`, `travellers`, `group_vehicle`, `bases`. Read **Trip facts** in `00 Home.md` and `Memories/MEMORY.md`.
- Read `Templates/Decision.md`. **The template is the schema:** use its property list, property order and section names. If it does not exist, the vault is older than 0.10.0: tell the user, and ask before you add `Templates/Decision.md`, `Bases/Decisions.base`, an empty `Decisions/` folder, the five types `question`, `locks`, `locked_by`, `affects` and `deadline` in `.obsidian/types.json`, the **Group decisions** section of `00 Home.md` and the **Locked decisions are rules** section of `.claude/CLAUDE.md`, copying them exactly from `${CLAUDE_PLUGIN_ROOT}/vault-template/`. If `trip.md` has no `stage`, treat it as `planning` and offer to add it (the `trip-init` skill does it: "re-run trip-init settings").
- Read every note in `Decisions/`. The locked ones are the rules of the trip; know them before you do anything else.
- Read `${CLAUDE_PLUGIN_ROOT}/skills/group-decisions/references/booking.md` (the booking list, its fields and the lifecycle). If `Templates/Booking.md` or `Bases/Bookings.base` is missing, the vault is older than 0.11.0: tell the user what is new and ask before running `trip-init` settings with `--add-bookings` and then `node "${CLAUDE_PLUGIN_ROOT}/skills/group-decisions/scripts/migrate-bookings.mjs"` (it only adds empty fields to existing notes). Until then, record bookings only on Stay notes.
- Check whether the Booking template has `payment_due`. If not, the vault is older than 0.13.0: tell the user that booking deadlines are now available (`payment_due` and `cancel_by` on every bookable note, a *By date* view on the Bookings base) and ask before running `trip-init` settings with `--add-deadlines` (it adds the fields to the templates and the view; no notes are changed), then `${CLAUDE_PLUGIN_ROOT}/skills/group-decisions/scripts/migrate-bookings.mjs` (it adds the two empty fields to the existing Stay, Transport and Booking notes). Until then, use Decision `deadline` for the nearest date.
- Everything you create stays inside the vault. Scratch files go in `.claude/scratch/` and get deleted at the end.

## 2. Gather what is open
Look in these places, in this order. Each finding is one of: a decision that needs a note, a line for the summary, or a booking to close.

| Where | What counts |
|---|---|
| `00 Home.md`, *Open questions for the group* | Every unticked line. Keep the user's wording. |
| `Sources/` Comparison notes | `status: draft`: "choose between the options". |
| `Stays/` | Stays at `considering` for a base: one choice per base ("which stay in Sohra?") when the base has two or more candidates. A stay at `selected` whose `booking_status` is not `booked` or `paid`: a booking still to close (it is not a decision; it is on the booking list). |
| `Locations/` | Places at `considering`: **count them**, do not make a note for each. Say how many, and how many are `must`, with a pointer to the *To decide* view. A place gets a Decision note only when it has a deadline or a booking attached (a permit, a safari, a ticket that sells out). |
| `Itinerary/Route*.md` | A Route note that is `draft` while the group has no agreed route: "which route?" |
| `Sources/` | Source notes with `processed: false`: items nobody has looked at. |
| `Sources/` shortlist (`source_kind: research`) | Rows whose Pick is `maybe`: one open question, "places still marked maybe: <names>", with a link to the shortlist. Rows with no Pick yet: one line, "places on the shortlist still to pick". Never pick for the group. |
| `Destination Brief.md` | In the `booking` stage (and later), a brief whose `checked_on` is more than 3 months old: one open question, "check the destination brief again before booking (checked on <date>): safety and visa rules change", answered by `trip-init` ("refresh the destination brief"). |
| `Logistics/`, `trip.md` | The vehicle (no Transport note `selected`), arrival and departure, the dates: any that are empty while the stage is `booking` are open questions. |
| The booking list (`Bases/Bookings.base`) | Selected stays, the selected vehicle, selected places with `needs_booking: true`, and the notes in `Bookings/`: what is still to book, booked with no confirmation yet, and balances still owed. A booking is not a decision: list it, don't make a Decision note for it. |
| `Decisions/` | Open decisions already there. Update them; never make a second note for the same question. |

What the stage changes: in `planning` lead with open decisions, undecided comparisons and place counts; in `booking` lead with decisions that have a deadline, things decided but not booked, and locks that are missing; in `travelling` list only what blocks the next days and the locked rules that today's plan must keep (a Day note's `day_status` tells which days are over; for today's brief or a re-plan on the road, point to the `on-the-road` skill, which hands any booking or lock that has to change back here); in `after` list only what was never closed. The stage never locks or decides anything.

## 3. Create or update Decision notes
- **One note per real choice.** Good: "Which stay in Sohra", "How do we get there", "Which itinerary", "Do we do the safari". Not: one note per place.
- **File:** `Decisions/Decision - <short topic>.md` (the folder is `folders.decision` in `trip.md`, default `Decisions`). No `[ ] # ^ | : / \ ?` in the name. Start from the template: every property in template order, the FIELD GUIDE comment kept, `{{title}}` replaced.
- **Fill in:** `question` in the group's words; `options` (one per line; a link for a Stay, Place or Route note, plain words otherwise); `status: open`; `locks` with what the decision fixes when it is made (from the value list in the template's FIELD GUIDE); `affects` with links to the notes it touches; `deadline` only when a source or the user gave one. Under *Options* write a line for each: what it gives and what it costs. Keep it short.
- **Existing note:** update it in place. Keep what the user wrote. Add a line to *History* for what changed.
- Do not set `decided_option`, `decided_on` or a status other than `open` unless the user said so.
- Do not copy anything out of a Logistics, Booking or Confirmations note except a link.

## 4. Record what the user says
Only when the user says it. Do the matching step, then show the note's new state in one line.

**Decided** ("we're going with Sohra Plaza"): `status: decided`, `decided_option` (one of the options; add it as an option first if the user names a new one), `decision_reason` (the user's words), `decided_on` (today). A *Stay* or *Place* option: ask whether to also mark that note `selected`, and do it only on a yes.

**Locked** ("flights are booked", "the van is confirmed and paid"): `status: locked`, `decided_option`, `locked_by` (what happened, in words), and `locks`. Use this table for the usual cases, and ask when it is unclear:

| The user says | `locks` | `locked_by` |
|---|---|---|
| flights (or trains) booked | dates, arrival, departure | flights booked |
| the vehicle or driver is booked | vehicle | vehicle booked |
| a stay is booked or paid | stay | stay booked |
| the route is agreed with the agency / paid | route, stay, dates | route booked |
| a safari, jeep, boat or ticket is booked | activity | name of it, booked |
| a permit or reservation for a place | place | permit booked |
| the budget is agreed | budget | budget agreed |

When the lock comes from a booking on the list (a stay, the vehicle, a place or a note in `Bookings/`), `locked_by` is a link to that note (`"[[Sohra Plaza]]"`, `"[[Book - Flights]]"`) and the lock is made right away: tell the user it is now locked. Free text is for locks with nothing booked ("budget agreed").

Add a line to *History*. Then, only on a yes: set `dates_fixed: true` in `trip.md` when dates are locked (run `trip-init` settings; the checker warns if dates are locked and `dates_fixed` is false), set `booking_status` on the Stay note, and move `stage` to `booking` (or on) with `trip-init` settings. Flag anything the lock now breaks (see section 7).

**Unlock** ("can we change the hotel?", "the dates moved"): ask first, in one message, with what it affects:
- what would become free again (the `locks`),
- what depends on it (`affects`, plus the Day notes and bookings that use it),
- the reason.

Only on a clear yes, with a reason: `status: decided` (or `open` if the group is reopening the whole question), clear `locked_by`, and write the reason under *History* ("Unlocked: the reason. Was locked by: …"). Keep `decided_option` when the status is `decided`; clear it when it goes back to `open`. Then say which Day notes, comparisons or stays now need another look and offer `plan-day` or `review-travel-times`. Do not change them yourself.

**Booked, paid, fell through, confirmed** ("we paid the advance for the van", "the hotel has no room for the group", "here's the voucher"): follow the lifecycle in `references/booking.md`. The details go on the item's own note; a booking locks its Decision as above; a booking that falls through sends the item back to `dropped` or `backup` (after asking) and its Decision back through *Unlock*, so the group picks again. Extra notes in `Bookings/` only for things with no note of their own, and only after asking.

## 5. Refresh Home
In `00 Home.md`:
- **Open questions for the group:** one unticked line per open decision, nearest deadline first: `- [ ] <question> (by <deadline>), see [[Decision - …]]`. Keep other unticked lines the user or other skills wrote (they are still questions). Remove a line only when its decision is `decided` or `locked`; tick nothing yourself. Leave one empty `- [ ] ` line if nothing is left.
- **Budget snapshot:** fill the three lines from the vault, as a total and per cost-sharing unit (`total / cost_split_units`, in `currency_symbol`), and say what is missing:
  - **Stays:** for every Stay at `selected`, its `cost_agreed` once booked, otherwise its `est_total`. Say how many selected stays have neither.
  - **Transport:** the selected Transport note's `cost_agreed`, otherwise its `quote`, or "no quote yet". Add the `cost_agreed` of the notes in `Bookings/` on a line of their own when there are any.
  - **Activities / entry fees:** the `entry_fee` of every selected place, per person, times `travellers` when that is a number; say that other fees (`other_fees`) are not included and which places have none recorded.
  - **Paid so far / still owed:** the sum of `advance_paid` and of `balance_pending` over the booking list (a `paid` item counts its `cost_agreed` as paid).
  - Mark the figures as estimates ("est.") where any part is missing, and never convert between currencies.
- **Group decisions** section (open and locked views) and the **Bookings** section: leave them; the Bases fill themselves.
- Do not touch the other sections.

## 6. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
For a Decision note it checks that `status` is `open`, `decided` or `locked`; that `decided_option` is one of the options and only set once decided or locked; that a locked note has `locked_by`; and it warns about a few conflicts it can read: a locked stay or place that is not `selected`, a locked route that is not agreed or booked, a dropped note in `affects`, and locked dates while `dates_fixed` is false. For the booking list it warns "booked, no confirmation yet", and about amounts that do not add up, a booking on something no longer selected, a booked item whose Decision is not locked, a `locked_by` link to something not booked, and a place whose booking fields do not match `needs_booking`. Fix every error in the notes you wrote. Report problems in older notes; don't silently rewrite them. Delete `.claude/scratch/`.

## 7. Report to the user
Plain words, short, ordered by deadline (nearest first, then those with no deadline). **Lead with what needs the group soonest; end with one question.**
- **First line:** the stage, and the count: "Booking stage: 3 open, 2 decided, 4 locked."
- **Then the open decisions** as a short list, each with its deadline and the options in a few words. At most five; link the rest.
- **Then what is decided but not booked or not locked yet**, and the bookings still to close (selected stays without a booking).
- **Then the booking list**, in the `booking` stage first of all: how many items are still to book (nearest Decision deadline first), which are booked with no confirmation yet, and what is still owed. Never list a reference or a confirmation's contents.
- **Then the locked rules** in one line ("Locked: dates, arrival and departure (flights booked); vehicle (van booked)").
- **Then the budget in one line** with what is missing.
- **Then anything a lock now breaks**, for example a selected stay whose dates fall outside the locked dates, a Day note that plans a place on a locked day differently, an option in a Comparison that breaks it. Say which, and ask. Never fix it yourself.
- **Last, one question**: the one decision that is nearest its deadline or holds up the most ("Can you tell me which stay in Sohra the group wants, so we can book before the deadline?"). Use the date from the note, never one you guessed.
