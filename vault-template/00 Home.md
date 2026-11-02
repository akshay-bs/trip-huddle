# <Trip name>

## Trip facts
<!-- Claude reads this section before judging any place or stay. Keep it current. -->
- **Destination:** 
- **Dates:** <first day> – <last day>, <N> nights. Fixed (flights booked) or flexible?
- **Arrival / departure:** <airport or station, time> / <airport or station, time>
- **Group:** <how many people, how many families or cost-sharing units, age bands>
- **Pace:** <how much walking is fine; treks or steep step-climbs OK or not>
- **Season conditions:** <temperatures, daylight hours, fog or rain, crowds>
- **Transport:** <vehicle type and size>. See [[Logistics/Transport|Transport]].
- **Food:** <dietary needs, e.g. vegetarian>

## How this vault works
1. **An itinerary comes in.** Create a note in `Sources/` with the *Source Itinerary* template, and paste in the itinerary.
2. **Places from that itinerary:**
   - Create a note for each new place in `Locations/` with the *Location* template.
   - Add the source to the place's `recommended_by`.
   - Fill in the coordinates, the seasonal verdict and the walk details.
3. **Stays:** create one note per option in `Stays/` with the *Stay* template.
4. **Restaurants and cafes:** create one note per spot in `Food/` with the *Food Spot* template.
5. **Decide.** Set `decision` to considering, selected, backup or dropped. Always write a `decision_reason` for dropped items.
6. **Plan the route.** Fix the base towns and nights in `Itinerary/Route.md`.
7. **Plan the days.** Create `Itinerary/Day 01…` with the *Day Plan* template, and set `scheduled_day` on each selected place and food spot.
8. **Book.** Move each selected stay's `booking_status` from enquired → quoted → booked → paid.

With the trip-huddle plugin, paste or forward an itinerary, quote or friend's list and the `add-source` skill does steps 1–4. To add a single place, hotel, restaurant or cafe, ask Claude to "add <name> to the list" (the `add-place` skill). Both check the notes when they finish. Once places are selected, ask Claude to "plan the days" (the `plan-day` skill): it works out sunrise and sunset, drive times and slack for each day, writes the Day notes and sets `scheduled_day`. Then ask Claude to "check the travel times" (the `review-travel-times` skill): it checks each drive against map times, the kind of road and local reports, adds time for stops, and says for each day whether it works before dark and, if not, what to change. It can also check an agency's or a friend's itinerary before you plan from it. When you have two or more itineraries (agency quotes, a friend's plan, your own draft), ask Claude to "compare the itineraries" (the `compare-itineraries` skill): it writes a short Comparison note in `Sources/` with a side-by-side table, a recommendation with the reasons, the trade-offs and the questions to ask before deciding. It never scores them, and the group decides.

To insert a template by hand, use the Command palette → *Templates: Insert template*.

## Decisions pending
![[Locations.base#To decide]]

## Selected places not yet on a day
![[Locations.base#Selected but unscheduled]]

## Food to decide
![[Food.base#To decide]]

## Stays to book
![[Stays.base#Booking tracker]]

## Open questions for the group
- [ ] 

## Inbox: itineraries to process
- [ ] 

## Budget snapshot
- **Stays:** total and per-unit split come from the *Booking tracker* summary above.
- **Transport:** 
- **Activities / entry fees:** 

## Map
The location and stay notes store coordinates in the `location` property as `[lat, lng]`. To see them on a map, install either of these:
- **Maps** (official Obsidian plugin for Bases). Then open [[Locations.base]], choose *Add view → Map* and set the marker property to `location`. Add a filter `decision == "selected"` for a map of chosen places only.
- **Map View** (community plugin). It reads the `location` property automatically.
