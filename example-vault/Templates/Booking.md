---
type: booking
booking_status: not-contacted
cost_agreed:
advance_paid:
balance_pending:
payment_due:
cancel_by:
confirmation:
tags:
  - booking
---
<!--
FIELD GUIDE
Name the note "Book - <short thing>", for example "Book - Flights" or "Book - Travel insurance". It lives in Bookings/ (a folders: {booking: ...} line in trip.md can change it).
Make one only for something with no note of its own: flights, trains, a regional permit, insurance. A stay, the vehicle or a place that needs tickets is booked on its own note, and shows on the booking list once it is selected.
booking_status: not-contacted | enquired | quoted | booked | paid | cancelled
cost_agreed / advance_paid / balance_pending: plain numbers in the trip currency (see trip.md); no symbol or text
payment_due: the date by which the next payment must be made (YYYY-MM-DD). When the full amount is due at once, this is that date; when there is an advance and a balance, update it to the balance deadline once the advance is paid
cancel_by: the last date to cancel without penalty (YYYY-MM-DD). Empty when the booking is non-refundable or not yet made
confirmation: a link to the voucher, ticket, reservation slip or pasted email, kept in Confirmations/, e.g. "[[Confirmations/flights.pdf]]"
booked means the advance is paid; booked with a confirmation is closed; paid means nothing is owed. A task that turns out not to be needed is deleted; cancelled is only for a booking that was made and then cancelled
To link it to a decision, list it in that Decision note's affects
-->

# {{title}}

<!-- One line: what this is, and what it holds up. -->

## Details
- 

## History
- 
