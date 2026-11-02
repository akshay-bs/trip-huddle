# Example: Assam & Meghalaya in December

## Trip facts
> [!info] This is an example vault
> It holds the research notes for 60 places and 6 stays in Assam and Meghalaya (north-east India), made for a group trip in mid-December. The trip dates, group details, names and private sources were removed, and every `decision` is reset to `considering`. All notes point to [[Example - Public research]] instead of the real sources.

- **Destination:** Assam and Meghalaya, India
- **Season conditions:** in December, Shillong and Sohra nights are around 4–8 °C, sunset is around 4:30 pm (about 9.5 usable daylight hours), morning fog is common in Sohra, and waterfalls run thinner than after the monsoon.
- **Group, dates, transport:** fill in your own to try the `add-place` skill here.

## How this vault works
1. **An itinerary comes in.** Create a note in `Sources/` with the *Source Itinerary* template, and paste in the itinerary.
2. **Places from that itinerary:**
   - Create a note for each new place in `Locations/` with the *Location* template.
   - Add the source to the place's `recommended_by`.
   - Fill in the coordinates, the seasonal verdict and the walk details.
3. **Stays:** create one note per option in `Stays/` with the *Stay* template.
4. **Decide.** Set `decision` to considering, selected, backup or dropped. Always write a `decision_reason` for dropped items.
5. **Plan the route.** Fix the base towns and nights in `Itinerary/Route.md`.
6. **Plan the days.** Create `Itinerary/Day 01…` with the *Day Plan* template, and set `scheduled_day` on each selected place.
7. **Book.** Move each selected stay's `booking_status` from enquired → quoted → booked → paid.

With the trip-huddle plugin, paste or forward an itinerary, quote or friend's list and the `add-source` skill does steps 1–3. To add a single place or hotel, ask Claude to "add <place or hotel> to the list" (the `add-place` skill). Both check the notes when they finish. Once places are selected, ask Claude to "plan the days" (the `plan-day` skill): it works out sunrise and sunset, drive times and slack for each day, writes the Day notes and sets `scheduled_day`. Then ask Claude to "check the travel times" (the `review-travel-times` skill): it checks each drive against map times, the kind of road and local reports, adds time for stops, and says for each day whether it works before dark and, if not, what to change. It can also check an agency's or a friend's itinerary before you plan from it. When you have two or more itineraries (agency quotes, a friend's plan, your own draft), ask Claude to "compare the itineraries" (the `compare-itineraries` skill): it writes a short Comparison note in `Sources/` with a side-by-side table, a recommendation with the reasons, the trade-offs and the questions to ask before deciding. It never scores them, and the group decides.

To insert a template by hand, use the Command palette → *Templates: Insert template*.

## Decisions pending
![[Locations.base#To decide]]

## Selected places not yet on a day
![[Locations.base#Selected but unscheduled]]

## Stays to book
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

## Map
The location and stay notes store coordinates in the `location` property as `[lat, lng]`. To see them on a map, install either of these:
- **Maps** (official Obsidian plugin for Bases). Then open [[Locations.base]], choose *Add view → Map* and set the marker property to `location`. Add a filter `decision == "selected"` for a map of chosen places only.
- **Map View** (community plugin). It reads the `location` property automatically.
