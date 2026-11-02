---
schema_version: "0.2"
trip_name: Example - Assam and Meghalaya
destination: Assam and Meghalaya, India
start_date: ""
end_date: ""
dates_fixed: false
stage: planning
arrival: ""
departure: ""
travellers: ""
cost_split_units: 4
cost_split_label: family
traveller_notes: ""
pace: ""
food_needs: ""
group_vehicle: ""
currency: INR
currency_symbol: ₹
season: December
daylight_hrs: 9.5
day_start: "07:00"
sunset: "16:30"
regions: [Assam, Meghalaya]
bases: [Guwahati, Shillong, Sohra, Dawki, Mawlynnong, Kaziranga, Majuli]
evening_bases: []
categories: [waterfall, viewpoint, cave, village, root-bridge, lake-river, wildlife, temple, museum, market, tea-estate, activity]
map_box: {lat_min: 24, lat_max: 28.5, lng_min: 89, lng_max: 97}
field_packs: []
planning_limits: {slack_ok_hrs: 1.5, dark_drive_tight_min: 30, late_finish_min: 60, max_drive_hrs_day: 6}
---
# Trip settings

The trip's facts, in one place. Every trip-huddle skill reads this note, so keep it current.

> [!info] Example vault
> Dates, group details and transport were removed from this example. Fill in your own to try the skills here.

- Run the `trip-init` skill to fill it in with an interview, or edit the properties above by hand.
- After changing anything above, ask Claude to "re-run trip-init settings". That updates the templates and Bases to match. Your notes are not touched.
- `stage` is where the group is now: `planning`, `booking`, `travelling` or `after`. Tell Claude when it changes ("we're booking now") and it runs "re-run trip-init settings" to write it. The `group-decisions` skill puts different things first in each stage. A stage never locks anything: locks live in the Decision notes in `Decisions/`.
- `evening_bases` is the part of `bases` where evenings out are easy: lit streets, food open late, short trips back to the stay. Small villages and forest stays are left out. Optional; the `plan-day` skill plans evenings only in these towns.
- `map_box` is the rough area of the trip: `{lat_min, lat_max, lng_min, lng_max}`. The checker uses it to catch wrong coordinates. Leave it empty to skip that check.
- `planning_limits` are the default limits the skills plan and judge by. Change them as you plan. `slack_ok_hrs`: a day needs this many hours of daylight left over to be "ok" (under it, down to 0, is "tight"). `dark_drive_tight_min`: up to this many minutes on a road to avoid in the dark is "tight", more is "too much". `late_finish_min`: a day that ends this many minutes after sunset somewhere without evenings out is "tight". `max_drive_hrs_day`: `compare-itineraries` flags a day with more driving than this. The `plan-day`, `review-travel-times` and `compare-itineraries` skills and the checker read them from here. The Itinerary base cannot read this note, so after changing `slack_ok_hrs` ask Claude to "re-run trip-init settings": that writes the new number into `Bases/Itinerary.base`.
- Optional, add by hand if you need them: `decision_values` (a list, default `[considering, selected, backup, dropped]`) and `folders` (where each note type lives, default `{location: Locations, stay: Stays, day: Itinerary, source: Sources, comparison: Sources, decision: Decisions, food: Food, route: Itinerary, transport: Logistics}`). The checker reads both.
- Optional, for the `review-travel-times` skill: `road_speeds` (typical speeds in km/h for each road type and vehicle class, e.g. `{hill: {car: 30, group: 22}}`; road types are motorway, highway, rural, hill, city and track, and anything you leave out keeps the skill's default) and `stop_buffer` (`{min_per_hour: 10, min_per_stop: 15}`: minutes added per hour of driving and per stop for getting the group in and out). The vehicle class is `group` when `group_vehicle` names a van, bus, coach or a vehicle with 6 or more seats, otherwise `car`. `trip-init` keeps both when it rewrites the settings.
