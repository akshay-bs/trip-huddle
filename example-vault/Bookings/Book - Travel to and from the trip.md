---
type: booking
booking_status: not-contacted
cost_agreed:
advance_paid:
balance_pending:
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
confirmation: a link to the voucher, ticket, reservation slip or pasted email, kept in Confirmations/, e.g. "[[Confirmations/flights.pdf]]"
booked means the advance is paid; booked with a confirmation is closed; paid means nothing is owed. A task that turns out not to be needed is deleted; cancelled is only for a booking that was made and then cancelled
To link it to a decision, list it in that Decision note's affects
-->

# Book - Travel to and from the trip

Made up for this example: getting to the start of the trip and home again (flights or trains). It has no note of its own, so it is a task here. Once it is booked, the dates, arrival and departure are fixed.

## Details
- Nothing booked yet. The confirmation goes in `Confirmations/` once there is one.

## History
- Added to the booking list.
