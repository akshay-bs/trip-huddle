# A re-plan, as the group sees it (made-up example)

Made-up Portugal trip, the morning of Day 05 (10 Jun 2026). The group says: "The hill road to Mountain Fort is shut by a landslide." The numbers come from `skills/review-travel-times/scripts/travel.mjs check` on the files `replan-option-1-input.json` and `replan-option-2-input.json` (same folder), and the sun times from `skills/plan-day/scripts/sun.mjs`. The changed Day note is `changed-day-example.md`.

What the skill says first, in the chat:

> Hill road shut: that is what you told me this morning (from the guesthouse owner; I have no report of my own, so tell me if it reopens). Today was Mountain Fort, then lunch at Cork Oak Farm. The fort is a "should", the farm lunch is booked and paid. Nothing is locked for today. Here are two ways through the day, and one I would not do without you:
>
> **Option 1: the farm by the main road, the fort goes to the backup plan.**
> - Changes: leave at 09:30, farm tour and lunch, home by 15:17.
> - Loses: the fort (a should). It stays selected, not scheduled.
> - Touches a booking: none. Lunch at the farm is kept.
> - Day check: drive 3.3 hrs, 8.9 hrs of slack. Verdict: ok.
>
> **Option 2: wait for news, then the original day starting at 11:00.**
> - Changes: we leave at 11:00, but only if the guesthouse hears by 10:30 that the road is open. Fort, then the farm for a late lunch, home by 20:19.
> - Loses: the farm lunch moves from 13:45 to about 16:00 (ask the farm today), and we are back 35 minutes before sunset, with the unlit hill roads done in daylight.
> - Touches a booking: the farm meal, moved by about two hours.
> - Day check: drive 4.8 hrs, 5.4 hrs of slack. Verdict: ok, but only if the road opens. If it does not, we are on option 1 at 11:00 with the morning lost.
>
> **Shown, not suggested: move the whole trip a day later.**
> - Touches bookings: every stay night and the van. Sohra Plaza (made-up) had free cancellation until 1 Jun: that date has passed. The balance is due 20 Jun.
> - It also needs the dates unlocked, and only the group does that.
>
> Which one?

When the group answers "1", the skill sets `day_status: changed` on Day 05, writes the group's own words under *What happened*, clears `scheduled_day` on the fort and runs the checker.
