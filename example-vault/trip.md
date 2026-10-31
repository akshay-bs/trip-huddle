---
schema_version: "0.2"
trip_name: Example - Assam and Meghalaya
destination: Assam and Meghalaya, India
start_date: ""
end_date: ""
dates_fixed: false
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
bases: [Guwahati, Shillong, Sohra, Dawki, Kaziranga]
categories: [waterfall, viewpoint, cave, village, root-bridge, lake-river, wildlife, temple, museum, market, tea-estate, activity]
map_box: {lat_min: 24, lat_max: 28.5, lng_min: 89, lng_max: 97}
field_packs: [cold-weather]
---
# Trip settings

The trip's facts, in one place. Every trip-huddle skill reads this note, so keep it current.

> [!info] Example vault
> Dates, group details and transport were removed from this example. Fill in your own to try the skills here.

- Run the `trip-init` skill to fill it in with an interview, or edit the properties above by hand.
- After changing anything above, ask Claude to "re-run trip-init settings". That updates the templates and Bases to match. Your notes are not touched.
- `map_box` is the rough area of the trip: `{lat_min, lat_max, lng_min, lng_max}`. The checker uses it to catch wrong coordinates. Leave it empty to skip that check.
