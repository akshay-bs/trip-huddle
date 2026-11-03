# Plan: booking deadlines

Status: built (v0.13.0).

## The problem
The group has bookings to make before it travels: stays, a vehicle, permits, flights. Some have a cancellation cut-off (free cancellation until a date), and some need payment by a date. Today the booking list shows *what* to book but not *when*. The Decision notes have `deadline` (when the group has to decide) but the bookable items have no dates for when money is due or when a free cancellation expires. The group can miss a cut-off or a payment and not know until it is too late.

The vault needs: **payment due dates and cancellation cut-offs on each bookable item, shown in one timeline view alongside Decision deadlines, so the group sees everything that is coming up.**

## Two new date fields
Two date properties go on every bookable note type (Stay, Transport, Location with `needs_booking`, Booking task), beside `balance_pending`:

| Property | Meaning |
|---|---|
| `payment_due` | The date by which the next payment must be made. When the full amount is due at once, this is that date. When there is an advance and a balance, it starts as the advance deadline and is updated to the balance deadline once the advance is paid |
| `cancel_by` | The last date to cancel without penalty. Empty when the booking is non-refundable or not yet made |

Both are date type (no time, just a calendar date). They are empty until the user or a confirmation gives a date. `cancellation_policy` on Stay stays as free text for the policy wording; `cancel_by` is the date it names.

### Template changes

**Booking.md:** add `payment_due` and `cancel_by` after `balance_pending`, before `confirmation`.

**Stay.md:** add `payment_due` and `cancel_by` after `balance_pending`, before `cancellation_policy` (so the date is right next to the policy text).

**Transport.md:** add `payment_due` and `cancel_by` after `balance_pending`, before `confirmation`.

**Location.md:** no template change. When `needs_booking` is true and the booking fields are added, `payment_due` and `cancel_by` are added with them, in the same position (after `balance_pending`).

## types.json
Add `payment_due`: date and `cancel_by`: date. Both vaults.

## Bookings base: new view
`Bases/Bookings.base` gains a fifth view:

**By date:** every item that has `payment_due` or `cancel_by` set, sorted by the earliest of the two dates (ascending), with columns: file name, type, booking status, payment due, cancel by, balance pending, confirmation. Items with no date set are excluded. The soonest deadline is at the top.

The existing four views are unchanged. `payment_due` and `cancel_by` columns are added to **All bookings** as well.

## Combined deadline view on the home page
In `00 Home.md`, the **Bookings** section gains an embed of the new `#By date` view from the Bookings base, after the existing `#To book` embed. Below it, the existing embed of Decisions `#Open` (which already sorts by `deadline`) stays. The user sees one scroll: booking deadlines, then open decisions with their deadlines.

## The checker
New warnings in `validate.mjs`:

- `payment_due` is in the past and `balance_pending` is above 0: "payment overdue since {date}".
- `cancel_by` is in the past and `booking_status` is `booked` (not `paid`): "free cancellation expired on {date}, balance still owed".
- `cancel_by` is before `payment_due` on the same note: "cancellation cut-off is before payment is due — check these dates".
- `payment_due` or `cancel_by` is set on a note that is not `booked` or `quoted`: "date set but booking is {status}" (a warning, not an error: the user may set the date from a quote before booking).

No warning for a `payment_due` that is today — that is still on time.

## The skill (group-decisions)
Extend the booking procedure in `skills/group-decisions/references/booking.md`:

- When the user says a booking is confirmed, or pastes a confirmation, look for payment due dates and cancellation cut-offs in the text and ask to set them.
- When the user reports paying an advance, ask whether the balance has a due date and set `payment_due` to it.
- In the booking-stage summary, after the "still to book" list, add a **Coming up** section: items with `payment_due` or `cancel_by` in the next 14 days, sorted by date, with the Decision `deadline` items mixed in (one timeline). Past-due items go at the top with a note.

The five other skills that read locked decisions (`plan-day`, `review-travel-times`, `compare-itineraries`, `add-place`, `add-source`) are unchanged — they read locks, not dates.

## trip-init and older vaults
A new vault gets the two fields on every template and in `types.json`, the updated base and home page. For a vault made before this version, `group-decisions` notices the fields are missing (check `types.json` for `payment_due`) and offers `trip-init --reconfigure --add-deadlines`. The reconfigure:

- Adds `payment_due` and `cancel_by` to `types.json`.
- Adds the two fields to the four templates (after `balance_pending` in each).
- Adds the *By date* view to `Bases/Bookings.base`.
- Adds the `#By date` embed to the home page.
- No notes are touched: existing bookings just have empty dates until the user fills them.

A migration script is not needed — there are no values to compute from existing data.

## Tests (scripts/test.mjs)
- Both vaults have the same templates, base and types for the new fields.
- The example passes. Its bookings have empty `payment_due` and `cancel_by`.
- Each new warning fires on a changed copy and goes quiet once fixed.
- `payment_due` in the past with balance > 0 fires. `cancel_by` in the past with status `booked` fires. `cancel_by` before `payment_due` fires.
- `trip-init`: a new vault gets the fields and passes. `--reconfigure` leaves the example unchanged. `--add-deadlines` upgrades a 0.11 copy and then changes nothing.
- The `group-decisions` references mention the two fields, the "coming up" summary, and the date extraction from confirmations.
- The broken vault gains a stay with a past `payment_due` and balance, and a booking with `cancel_by` before `payment_due`.

## Example vault
- The 6 stays and the one booking task get empty `payment_due` and `cancel_by` fields (the migration adds them). No dates are filled in — the example has no real booking dates (privacy rules).
- `Kaziranga National Park` keeps `needs_booking: true` with empty dates.

## Version
0.13.0 in `.claude-plugin/plugin.json` and `marketplace.json`. The roadmap item is ticked with a pointer here.

## Made easy for the next step: travelling
The "coming up" summary and the past-due warnings are the foundation for a travelling-stage view: what is due today, what to pay this week, where to check in.

## Not in this version
No reminders or notifications (the vault has no notification system). No reading dates out of a PDF confirmation automatically. No recurring payments. No currency conversion.
