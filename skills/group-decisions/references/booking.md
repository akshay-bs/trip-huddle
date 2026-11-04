# The booking list

This is how `group-decisions` handles bookings. The list is made from what the group has selected. It is not a set of notes Claude keeps alongside the selections. The booking details go on each item's own note, and booking something locks the Decision it belongs to.

## What is on the list
| Note | On the list when |
|---|---|
| Stay (`Stays/`) | `decision: selected` |
| Transport (`Logistics/`) | `decision: selected` |
| Location (`Locations/`) | `decision: selected` and `needs_booking: true` |
| Booking note (`Bookings/`) | always |

`Bases/Bookings.base` shows the list: **To book**, **No confirmation yet**, **Balance pending** and **All bookings** (with the totals and the share per cost-sharing unit). The home page's *Bookings* section embeds the first two. When a selection changes, the list follows without any extra step. Never copy an item into `Bookings/` to put it on the list.

Every item uses the same seven fields on its own note:
- `booking_status`: `not-contacted | enquired | quoted | booked | paid | cancelled`.
- `cost_agreed`, `advance_paid`, `balance_pending`: plain numbers in the trip currency.
- `payment_due`: the date by which the next payment must be made (YYYY-MM-DD). Update it to the balance deadline once the advance is paid.
- `cancel_by`: the last date to cancel without penalty (YYYY-MM-DD). Empty when non-refundable or not yet booked.
- `confirmation`: a link to the voucher, ticket, reservation slip or pasted email in `Confirmations/`.

A stay also keeps its `booking_ref`. A place has these fields only while `needs_booking` is `true`. To add them, put them right after `needs_booking`, in that order, with `booking_status: not-contacted`.

When the user says a booking is confirmed, or pastes a confirmation, look for payment due dates and cancellation cut-offs in the text and ask to set `payment_due` and `cancel_by`. When the user reports paying an advance, ask whether the balance has a due date and set `payment_due` to it.

## Booking notes (extra tasks)
Make a note in `Bookings/` only for something with no note of its own: flights, trains, a regional permit, travel insurance, anything else the group has to book. Never make one for a stay, the vehicle or a place: book those on their own notes.
- **File:** `Bookings/Book - <short thing>.md` (the folder is `folders.booking` in `trip.md`, default `Bookings`). Start from `Templates/Booking.md`: every property in order, the FIELD GUIDE kept, `{{title}}` replaced. Write one line on what it holds up, and keep *Details* and *History* short.
- **When:** the user names one ("add travel insurance to the list"), or you infer one and **ask first**. You can infer one when `arrival` or `departure` in `trip.md` names an airport or a station, when the interview or **Trip facts** say trains or flights, or when a Source or a place's `permits` says a regional permit is needed. Skip anything that already has a note. Never create a batch without asking.
- **Its decision:** if a Decision is about it (for example "How do we get there" with plain-text options), add the booking note to that Decision's `affects`. That is the link: the checker and this procedure find the Decision through it.
- **Not needed after all:** delete the note, after asking. `cancelled` is kept for a booking that was made and then cancelled.

## Which Decision an item locks
The Decision whose `decided_option` links to the item. If no Decision links to it that way, the one whose `affects` lists it while its chosen option is plain words or still empty. An item can have no Decision. That is fine: then booking it locks nothing.

## The lifecycle
Record only what the user says. Write amounts, references and confirmations only from the user or a document they gave you. Never estimate them.

| The user says | On the item's note | The Decision |
|---|---|---|
| "we need to book it" | `booking_status: not-contacted` | nothing |
| "we asked", "they sent a price" | `enquired`, then `quoted`. A quoted price is not `cost_agreed` until the group accepts it | nothing |
| "it fell through" (no room for the group, the rental withdrew) | Ask, then set `decision` to `dropped` or `backup`, with the reason in `decision_reason`. Set `cancelled` only if it had been booked. A Booking note: set `cancelled` if it had been booked, otherwise ask whether to delete it | Unlock it if it was locked, or set it back to `open` if it was only decided, after asking (section 4 of `SKILL.md`, *Unlock*). Then ask the group to pick again for that base or need. The new pick shows on the list once it is selected |
| "booked", "we paid the advance" | `booked`, `advance_paid`, `cost_agreed` and `balance_pending` if given | **Lock it right away** and tell the user it is now locked: `status: locked`, `decided_option` (the item, if still open), `locked_by: "[[<the item>]]"`, a line in *History*. If the item is not `selected`, ask before selecting it |
| "here's the voucher", "the confirmation came" | `confirmation` linked. Save a pasted email as a note in `Confirmations/` (a plain note, no properties) and link it. With `booked`, the item is closed | nothing |
| "paid in full", "balance settled" | `paid`, `balance_pending: 0` | nothing (it is already locked) |
| "they cancelled", "we cancelled" (after booking) | `cancelled` | Unlock it, after asking, as for "fell through" |

There is no separate "confirmed" value: booked with a confirmation linked is closed.

When the user pastes a confirmation with a reference, the reference stays on the item's own note (`booking_ref` on a stay) or in the confirmation file. Never put it in a Decision note, a Day note or the home page.

## What the checker says
- **booked, no confirmation yet**: `booked` or `paid` with `confirmation` empty.
- `paid` while `balance_pending` is above 0, and `advance_paid` + `balance_pending` not equal to `cost_agreed` (when all three are set).
- **payment overdue**: `payment_due` is in the past and `balance_pending` is above 0.
- **free cancellation expired**: `cancel_by` is in the past and `booking_status` is `booked` (not `paid`).
- **cancellation cut-off before payment due**: `cancel_by` is before `payment_due` on the same note.
- **date set but booking is not quoted or booked**: `payment_due` or `cancel_by` on a note that is not `quoted`, `booked` or `paid`.
- A booked item the group no longer has as `selected`.
- A booked item whose Decision is not locked, and a `locked_by` link to something that is not booked or paid.
- A place whose booking fields do not match `needs_booking`, and a `confirmation` link outside `Confirmations/`.

## In the summary
In the `booking` stage, lead with the list: what is still to book (each with its Decision's `deadline` if it has one), what is booked with no confirmation yet, and what is still owed (the sum of `balance_pending`). After the list, add a **Coming up** section: items with `payment_due` or `cancel_by` in the next 14 days, sorted by date, with the Decision `deadline` items mixed in (one timeline). Past-due items go at the top with a note. In the `travelling` stage, list only what is booked for the next days with no confirmation, and what is still owed on the road.
