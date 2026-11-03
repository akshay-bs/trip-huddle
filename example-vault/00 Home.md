# Example: Assam & Meghalaya in December

## Trip facts
> [!info] This is an example vault
> It holds the research notes for 60 places, 6 stays and 3 restaurants and cafes in Assam and Meghalaya (north-east India), made for a group trip in mid-December. The trip dates, group details, names and private sources were removed, and every `decision` is reset to `considering`. All notes point to [[Example - Public research]] instead of the real sources.

- **Destination:** Assam and Meghalaya, India
- **Destination brief:** [[Destination Brief]] (safety, visas, when to go, budget, regions; ask Claude to "refresh the destination brief")
- **Season conditions:** in December, Shillong and Sohra nights are around 4–8 °C, sunset is around 4:30 pm (about 9.5 usable daylight hours), morning fog is common in Sohra, and waterfalls run thinner than after the monsoon.
- **Group, dates, transport:** fill in your own to try the `add-place` skill here.

## How this vault works
1. **An itinerary comes in.** Create a note in `Sources/` with the *Source Itinerary* template, and paste in the itinerary.
2. **Places from that itinerary:**
   - Create a note for each new place in `Locations/` with the *Location* template.
   - Add the source to the place's `recommended_by`.
   - Fill in the coordinates, the seasonal verdict and the walk details.
3. **Stays:** create one note per option in `Stays/` with the *Stay* template.
4. **Restaurants and cafes:** create one note per spot in `Food/` with the *Food Spot* template.
5. **Decide.** Set `decision` to considering, selected, backup or dropped. Always write a `decision_reason` for dropped items.
6. **Plan the route.** Fix the base towns and nights in `Itinerary/Route.md`, with one line per day under *Day by day*. Or ask Claude to "build the itinerary" (the `build-itinerary` skill): it builds two or three route options from what you selected, as `Itinerary/Route - Option A.md` and so on, each with what it makes possible, its red flags and what it costs.
7. **Plan the days.** Create `Itinerary/Day 01…` with the *Day Plan* template, and set `scheduled_day` on each selected place and food spot.
8. **Book.** Selected stays, the selected vehicle and selected places with `needs_booking` show up under *Bookings* by themselves. Move each one's `booking_status` from not-contacted → enquired → quoted → booked → paid, write the amounts on its own note, and link the voucher or email in `confirmation` (keep the files in `Confirmations/`). Things with no note of their own (flights, trains, insurance) get a small note in `Bookings/`.

New to the place? At setup `trip-init` writes a short [[Destination Brief]]: safety, visas, when to go, how long, the budget, the regions and the usual routes, each with its source and date. Then ask Claude to "shortlist places" (the `shortlist-places` skill): it asks what the group wants (saved as `group_wishes` in `trip.md`), lists the places worth a closer look by region, each marked fits, mixed or doesn't fit, and the group picks which ones to research properly. Ask Claude to "refresh the destination brief" before you book: safety and visa rules change.

With the trip-huddle plugin, paste or forward an itinerary, quote or friend's list and the `add-source` skill does steps 1–4. To add a single place, hotel, restaurant or cafe, ask Claude to "add <name> to the list" (the `add-place` skill). Both check the notes when they finish. Once places are selected, ask Claude to "plan the days" (the `plan-day` skill): it works out sunrise and sunset, drive times and slack for each day, writes the Day notes and sets `scheduled_day`. Then ask Claude to "check the travel times" (the `review-travel-times` skill): it checks each drive against map times, the kind of road and local reports, adds time for stops, and says for each day whether it works before dark and, if not, what to change. It can also check an agency's or a friend's itinerary before you plan from it. When you have two or more itineraries (agency quotes, a friend's plan, your own draft), ask Claude to "compare the itineraries" (the `compare-itineraries` skill): it writes a short Comparison note in `Sources/` with a side-by-side table, a recommendation with the reasons, the trade-offs and the questions to ask before deciding. It never scores them, and the group decides. Once the group picks a route, the `build-itinerary` skill plans every day and writes `Itinerary/Trip itinerary.md` (the whole trip on one page) and, on request, an *Operator brief* to send to tour operators or vehicle rentals for a quote. Road distances and drive times are kept in `Logistics/legs.json`, shared by the skills: facts about roads only, never what the group chose.

To insert a template by hand, use the Command palette → *Templates: Insert template*.

## Decisions pending
![[Locations.base#To decide]]

## Selected places not yet on a day
![[Locations.base#Selected but unscheduled]]

## Food to decide
![[Food.base#To decide]]

## Bookings
What the group still has to book, made from what it selected (stays, the vehicle, places that need tickets or permits) and the extra notes in `Bookings/`. Change a selection and the list follows. Ask Claude "what's left to book" (the `group-decisions` skill); booking something locks its decision.

### To book
![[Bookings.base#To book]]

### Booked, no confirmation yet
![[Bookings.base#No confirmation yet]]

### Stays: dates and rooms
![[Stays.base#Booking tracker]]

## Group decisions
Decision notes in `Decisions/` record what the group still has to decide and what it has fixed. A **locked** decision is a rule: no plan changes it unless the group unlocks it. Ask Claude to "update the group decisions" (the `group-decisions` skill).

### Open decisions
![[Decisions.base#Open]]

### Locked rules
![[Decisions.base#Locked]]

## Open questions for the group
- [ ] 

## Inbox: itineraries to process
- [ ] 

## Budget snapshot
- **Stays:** total and per-family split come from the *Booking tracker* summary above.
- **Transport:** 
- **Activities / entry fees:** 
- **Paid so far / still owed:** 

## Map
The location and stay notes store coordinates in the `location` property as `[lat, lng]`. To see them on a map, install either of these:
- **Maps** (official Obsidian plugin for Bases). Then open [[Locations.base]], choose *Add view → Map* and set the marker property to `location`. Add a filter `decision == "selected"` for a map of chosen places only.
- **Map View** (community plugin). It reads the `location` property automatically.
