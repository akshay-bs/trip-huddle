---
type: transport
vehicle:
driver:
contact_phone:
decision: considering
decision_reason:
quote:
booking_status: not-contacted
cost_agreed:
advance_paid:
balance_pending:
payment_due:
cancel_by:
confirmation:
max_km_per_day:
max_hrs_per_day:
tags:
  - transport
---
<!--
FIELD GUIDE
vehicle: what you will travel in, e.g. "7-seat hired van with driver", "own car", "trains and taxis"
driver: name of the driver or company (leave empty if you drive yourselves)
decision: considering | selected | backup | dropped   (the group selects the vehicle it books; one that falls through goes to dropped with a decision_reason, and another note is selected)
quote: total price for the whole trip, plain number in the trip currency (see trip.md); no symbol or text
booking_status: not-contacted | enquired | quoted | booked | paid | cancelled
cost_agreed / advance_paid / balance_pending: plain numbers in the trip currency, once booked
payment_due: the date by which the next payment must be made (YYYY-MM-DD)
cancel_by: the last date to cancel without penalty (YYYY-MM-DD). Empty when non-refundable or not yet booked
confirmation: a link to the booking confirmation or pasted email, kept in Confirmations/
max_km_per_day / max_hrs_per_day: the limits in the quote or agreement; the checker warns if a Day note's drive_hrs is over max_hrs_per_day
-->

# {{title}}

## What was agreed
- **Included (fuel, tolls, driver stay, parking):** 
- **Not included:** 
- **Extra km or hour charges:** 

## Daily limits
| Limit | Value | Notes |
| ----- | ----- | ----- |
| Km per day |  |  |
| Driving hours per day |  |  |

## Enquiry log
| Date | Who contacted | Channel | Quote / response |
| ---- | ------------- | ------- | ---------------- |
|      |               |         |                  |
