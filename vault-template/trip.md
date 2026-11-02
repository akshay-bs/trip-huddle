---
schema_version: "0.2"
trip_name: ""
destination: ""
start_date: ""
end_date: ""
dates_fixed: false
arrival: ""
departure: ""
travellers: ""
cost_split_units: 1
cost_split_label: person
traveller_notes: ""
pace: ""
food_needs: ""
group_vehicle: ""
currency: ""
currency_symbol: ""
season: ""
daylight_hrs: 10
day_start: "08:00"
sunset: "18:00"
regions: []
bases: []
evening_bases: []
categories: [viewpoint, nature, old-town, museum, market, food, activity, beach, hike]
map_box:
field_packs: []
---
# Trip settings

The trip's facts, in one place. Every trip-huddle skill reads this note, so keep it current.

- Run the `trip-init` skill to fill it in with an interview, or edit the properties above by hand.
- After changing anything above, ask Claude to "re-run trip-init settings". That updates the templates and Bases to match. Your notes are not touched.
- `evening_bases` is the part of `bases` where evenings out are easy: lit streets, food open late, short trips back to the stay. Small villages and forest stays are left out. Optional; the `plan-day` skill plans evenings only in these towns.
- `map_box` is the rough area of the trip: `{lat_min, lat_max, lng_min, lng_max}`. The checker uses it to catch wrong coordinates. Leave it empty to skip that check.
- Optional, add by hand if you need them: `decision_values` (a list, default `[considering, selected, backup, dropped]`) and `folders` (where each note type lives, default `{location: Locations, stay: Stays, day: Itinerary, source: Sources, food: Food, route: Itinerary, transport: Logistics}`). The checker reads both.
