# Plan: the booking list, built from what the group selected

Status: built (v0.11.0).

## The problem
In the `booking` stage the group has things to close before it travels: the stays, a vehicle for the whole trip, a jeep safari, tickets or permits for a few places, flights or trains, insurance. Today only stays have booking fields, the vehicle has a `booking_status` and nothing else, and places have none. Nothing says what is booked, what was paid, what is still owed, or where the confirmation is, and nothing ties a booking to the Decision it fixes.

The vault needs: **one list of what is left to book, made from what the group has selected, so it changes when a selection changes; the booking details on each item's own note; and booking an item locks its Decision.**

## How the list is made
The list is mostly a Bases view, not a new set of notes. An item is on it when it is one of these:

| Note | On the list when |
|---|---|
| Stay | `decision: selected` |
| Transport (`Logistics/`) | `decision: selected` |
| Location | `decision: selected` and `needs_booking: true` (tickets, a permit, a safari slot) |
| Booking task (`Bookings/`) | always: it exists only to be booked |

Select a different stay and the list follows with no extra step. Extra task notes are only for things with no note of their own: flights, trains, a regional permit, insurance, anything else that comes up.

## Booking fields
The same five fields go on each item's own note. Two of them are already on the Stay.

| Property | Meaning |
|---|---|
| `booking_status` | The existing list: `not-contacted`, `enquired`, `quoted`, `booked`, `paid`, `cancelled` |
| `cost_agreed` | The agreed total for the group, plain number in the trip currency (`est_total` and `quote` stay as the estimate and the quote) |
| `advance_paid` | Amount paid so far (already on Stay) |
| `balance_pending` | Amount still owed |
| `confirmation` | A link to the voucher, reservation slip or pasted email, kept in `Confirmations/` |

- **Stay:** gains `cost_agreed`, `balance_pending` and `confirmation`. `booking_ref` stays.
- **Transport:** gains `decision` and `decision_reason` (so a rental that falls through can be dropped and another picked) and the four new fields. It goes in as `considering`, like every other note, and the group selects it.
- **Location:** gains one property, `needs_booking` (checkbox, default `false`). The five booking fields go on a place only when it is `true`, so the 60 places that need nothing stay as they are. `add-place` sets it when the research says tickets or permits must be booked ahead (the `permits` field). The user can also tick it in Obsidian, and the skill then adds the fields.
- **Booking task:** `Templates/Booking.md`, type `booking`, in `Bookings/`, named `Book - <thing>`. It has the five fields, `tags`, and a body with *Details* and *History*. It has no new properties beyond these.

No new value lists: selection is `considering | selected | backup | dropped`, bookings use `booking_status`, and decisions use `open | decided | locked`. A task that turns out not to be needed is **deleted**, not cancelled, so `cancelled` keeps one meaning: a booking that was made and then cancelled.

`Confirmations/` holds the files: PDFs, images, or a note with a pasted email. The checker does not check that folder. Its files are private: the repo ships only an empty folder.

## The lifecycle
| What happens | On the note | The Decision |
|---|---|---|
| To book | `not-contacted` | — |
| Asked | `enquired`, then `quoted` | — |
| Fell through (no room for the group, rental withdrawn) | The item goes back to `dropped` or `backup`, with the reason in `decision_reason`. `cancelled` is used only if it had been booked | Reopened or unlocked, after asking (the existing unlock step). The group picks again, and the new pick appears on the list |
| Booked (advance paid) | `booked`, `advance_paid` | Locked right away, and the user is told it is locked |
| Confirmed | `booked` with `confirmation` linked: closed | — |
| Paid in full | `paid`, `balance_pending` 0 or empty | — |

There is no separate "confirmed" value. **Which Decision:** the one whose `decided_option` links to the item, or, for a task (and plain-text options like "Flights"), the one whose `affects` lists it. When the skill makes a task for a Decision, it adds the task to that Decision's `affects`. On a lock, `locked_by` links to the booked note (`"[[Sohra Plaza]]"`, `"[[Book - Flights]]"`). Free text ("budget agreed") is still allowed when nothing was booked.

## Bases and the home page
`Bases/Bookings.base` (both vaults), filtered to the four kinds of item above:
- **To book:** not `booked` or `paid`, grouped by note type.
- **No confirmation yet:** `booked` or `paid` with `confirmation` empty.
- **Balance pending:** `balance_pending` above 0.
- **All bookings:** Sum on `cost_agreed`, `advance_paid` and `balance_pending`, plus a per-split formula that `trip-init` writes (the Bases cannot read `trip.md`, as with Stays).

In `00 Home.md`, *Stays to book* becomes **Bookings**, embedding `#To book` and `#No confirmation yet`. The Stays base keeps its *Booking tracker* for dates and rooms. The *Budget snapshot* uses `cost_agreed` where set, otherwise `est_total` or `quote`, and adds a line for advance paid and balance pending.

## The skill
**Extend `group-decisions`, not a new skill.** The list follows selections, which this skill already gathers and asks about. Booking is its lock step, and "fell through" is its unlock and reopen step. A second skill would compete for "the stay is booked" and duplicate both steps. The procedure goes in `skills/group-decisions/references/booking.md`, with a short step in `SKILL.md`. The description gains "what's left to book", "we paid the advance", "the hotel has no room" and "add insurance to the list".

- **Records** what the user says, using the table above. It writes amounts only from the user or a document, and links a confirmation the user gives. When the user pastes an email, it saves the email as a note in `Confirmations/` and links it.
- **Tasks:** made when the user asks, or proposed (then asked) from what it can infer. For example, `arrival` or `departure` in `trip.md` names an airport or station, or the interview said public transport, or a source says a regional permit is needed. It skips what already has a task.
- **In the `booking` stage** the summary leads with the list: what is still to book, booked with no confirmation, and balances owed.
- It never copies a confirmation, reference or amount into a Decision note.

## The checker
`booking: Bookings` joins the default `FOLDERS`, so a task outside `Bookings/` is an error. A bad `booking_status` is reported through the template's value list. Warnings:
- `booked` or `paid` with `confirmation` empty: "booked, no confirmation yet".
- `paid` while `balance_pending` is above 0. `advance_paid` + `balance_pending` not equal to `cost_agreed` when all three are set.
- A `booked` or `paid` Stay, Transport or Location that is not `selected` (cancel the booking or select it again).
- A booked or paid item whose Decision is not locked. A `locked_by` link to a note that is not booked or paid.
- A place with `needs_booking: true` and no booking fields, or booking fields while `needs_booking` is false. A `confirmation` link that does not resolve.

`transportLimit` reads the daily limits from the selected Transport note (or the only one).

## Tests (scripts/test.mjs)
- Template, base, types and home section are the same in both vaults. The base's filters cover the four kinds of item.
- The example passes. It holds no confirmations, booking refs or amounts, and has an empty `Confirmations/`.
- Each warning above fires on a changed copy of the example and goes quiet once fixed. A text `locked_by` still passes.
- A task outside `Bookings/` is an error.
- `trip-init`: a new vault gets the files and passes. The per-split formula follows `cost_split_units`. `--reconfigure` leaves the example unchanged, and `--add-bookings` upgrades a 0.10 copy and then changes nothing.
- The migration script brings a 0.10 copy to what the starter vault has, and does nothing the second time.
- `group-decisions` names the list, `confirmation` and the lifecycle. The roadmap and this plan say built.
- The broken vault gains a booked Stay with no confirmation and a bad `booking_status`.

## trip-init and older vaults
A new vault gets `Templates/Booking.md`, the changed Stay, Transport and Location templates, `Bases/Bookings.base`, `Bookings/`, `Confirmations/`, the types (`cost_agreed`, `balance_pending` number; `confirmation` text; `needs_booking` checkbox) and the home section. The starter `Transport.md` has `decision: considering`. For a vault made before 0.11.0, `group-decisions` notices that `Templates/Booking.md` is missing, says what is new and asks. On a yes it runs `trip-init --reconfigure --add-bookings` (templates, base, folders, types and home, with no notes touched), then `skills/group-decisions/scripts/migrate-bookings.mjs` (safe to run twice). The script:
- adds the empty Stay fields;
- adds `decision` to Transport notes: `selected` when the note is already `booked` or `paid`, otherwise `considering`;
- adds `needs_booking: false` to every Location.

## Example vault (privacy rules apply)
- The migration adds `needs_booking: false` to the 60 places and the empty new fields to the 6 stays.
- `Kaziranga National Park` gets `needs_booking: true` (its public `permits` line says safaris are booked per slot), with `not-contacted` and every amount empty. It stays `considering`, so it is not on the list.
- One made-up task, `Book - Travel to and from the trip`, `not-contacted`, with nothing else filled in.
- No `Logistics/` note, no confirmations, no references, no amounts, no dates. `Decision - How we get around` keeps its text `locked_by`.

## Version
0.11.0 in `.claude-plugin/plugin.json` and `marketplace.json`. The roadmap item is ticked with a pointer here, and the repo `CLAUDE.md` (folders, the Checks paragraph) and `README.md` are updated.

## Made easy for the next step: booking deadlines
Payment due dates and cancellation cut-offs become two date fields beside `balance_pending` on the same notes, so the same base gains a **By date** view. Decisions already have `deadline`, so one view can sort both.

## Not in this version
No due dates, cut-offs or reminders (next item). No comparing quotes from several rental companies. No who-paid-what or settle-up (*After travel*). No reading amounts out of a confirmation file.

## Decided
1. Transport gains `decision` (`considering | selected | backup | dropped`), so a rental can fall through and be replaced by another selected Transport note.
2. Stays keep `booking_ref` as a separate field next to `confirmation`.

## Choices made while building
- *Stays to book* on the home page became **Bookings**, which embeds `#To book`, `#No confirmation yet` and the Stays *Booking tracker* (as "Stays: dates and rooms"), so the budget line that points to the tracker still holds. The budget gets a **Paid so far / still owed** line.
- Booking task notes have the five booking fields only: no `booking_ref` (the reference is on the confirmation). A task is linked to a Decision through that Decision's `affects`.
- `Confirmations/` is a fixed folder name, not part of `folders` in `trip.md`, because the checker treats every `folders` entry as a folder of trip notes, and a pasted email there has no type.
- The checker also warns when a `confirmation` link points outside `Confirmations/`, and when a `locked_by` link points to a note that does not exist.
