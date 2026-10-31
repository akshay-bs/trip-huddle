# Slots: the per-trip values in `vault-template`

Everything in `vault-template/Templates`, `Bases` and `.obsidian` is neutral except the lines below. `trip-init` (and `trip-init --reconfigure`) fills each one with the trip's values by exact find/replace.

How to use this file:
- "Template text" is the literal text in `vault-template/`. It appears exactly once in the named file. Replace the whole line shown, not just the changed words.
- "Example text" is what `example-vault/` has in the same place. It is one valid result of the fill-in, and it is what the example must keep.
- `example-vault/Templates`, `Bases` and `.obsidian` are identical to `vault-template/` except for the lines in this file. Check that after any template change.
- Values come from `trip.md` (property names in the "From" column).
- Paths are relative to the vault root. A template file has no trailing spaces except where a table row is shown.

## Slots in the Templates

### S1. Day Plan: daylight hours
- File: `Templates/Day Plan.md` (frontmatter)
- Template text: `daylight_hrs: 10`
- Example text: `daylight_hrs: 9.5`
- Meaning: default usable daylight hours for a day. The Itinerary base computes slack from it.
- From: `daylight_hrs`

### S2. Day Plan: day start
- File: `Templates/Day Plan.md` (Schedule table)
- Template text: `| 08:00 | Breakfast / depart |  |`
- Example text: `| 07:00 | Breakfast / depart |  |`
- Meaning: usual start of the day.
- From: `day_start`. Keep the `HH:MM` format.

### S3. Day Plan: sunset
- File: `Templates/Day Plan.md` (Schedule table)
- Template text: `| 18:00 | Sunset |  |`
- Example text: `| 16:30 | Sunset |  |`
- Meaning: sunset time in the travel season.
- From: `sunset`. Keep the `HH:MM` format.

### S4. Location: region list
- File: `Templates/Location.md` (FIELD GUIDE comment)
- Template text: `state: region, state or province the place is in  (set your list at trip setup)`
- Example text: `state: Assam | Meghalaya`
- Meaning: allowed values of `state`. The template line has no `|`, so the validator treats it as an open list. If you write a `|` list (no `…`), the validator treats it as a closed list and warns on other values.
- From: `regions`. Write `state: A | B | C` (add `| …` to keep it open).

### S5. Location: base towns
- File: `Templates/Location.md` (FIELD GUIDE comment)
- Template text: `nearest_base: base town you would stay in to visit this place  (set your list at trip setup)`
- Example text: `nearest_base: Guwahati | Shillong | Sohra | Dawki | Mawlynnong | Kaziranga | Majuli | …`
- Meaning: the base towns a place can belong to. Keep the trailing `| …` so the list stays open (the validator does not enforce lists that contain `…`).
- From: `bases`. Write `nearest_base: A | B | C | …`.

### S6. Location: category list
- File: `Templates/Location.md` (FIELD GUIDE comment)
- Template text: `category: viewpoint | nature | old-town | museum | market | food | activity | beach | hike | …`
- Example text: `category: waterfall | viewpoint | cave | village | root-bridge | lake-river | wildlife | temple | museum | market | tea-estate | activity`
- Meaning: the kinds of place. The template list ends in `…`, so it is open. The example list has no `…`, so it is a closed list and the validator warns on other values. Either is fine.
- From: `categories`. Write `category: a | b | c` (add `| …` to keep it open).

### S7. Stay: base towns
- File: `Templates/Stay.md` (FIELD GUIDE comment)
- Template text: `base_town: base town the stay is in  (set your list at trip setup)`
- Example text: `base_town: Guwahati | Shillong | Sohra | Dawki | Kaziranga | …`
- Meaning: the base towns a stay can be in.
- From: `bases`. Write `base_town: A | B | C | …`.

### S8. Food Spot: price band
- File: `Templates/Food Spot.md` (FIELD GUIDE comment)
- Template text: `price_band: low | mid | high`
- Example text: `price_band: ₹ | ₹₹ | ₹₹₹`
- Meaning: how expensive a place is, as 1 to 3 currency symbols.
- From: `currency_symbol`. With a symbol S write `price_band: S | SS | SSS`. With no symbol, leave the template text.

## Slots in the Bases

### S9. Stays base: cost split count
- File: `Bases/Stays.base`
- Template text: `  cost_per_split: if(est_total, est_total / 1, "")`
- Example text: `  cost_per_split: if(est_total, est_total / 4, "")`
- Meaning: the number of equal shares the total is split into (families, couples or people).
- From: `cost_split_units`. Replace only the number after `est_total / `.

### S10. Stays base: split column label
- File: `Bases/Stays.base`
- Template text: `    displayName: Per person` (the line under `formula.cost_per_split:`)
- Example text: `    displayName: Per family ₹`
- Meaning: heading of the per-share cost column.
- From: `cost_split_label` and `currency_symbol`. Write `Per <label>` and, if there is a symbol, add a space and the symbol (`Per couple €`).
- Note: `    displayName: Per person` appears once in the file. The other two `displayName` lines are S11 and S12.

### S11. Stays base: total column label
- File: `Bases/Stays.base`
- Template text: `    displayName: Total` (the line under `est_total:`; it ends the line, with nothing after it)
- Example text: `    displayName: Total ₹`
- Meaning: heading of the total-cost column.
- From: `currency_symbol`. Write `Total` and, if there is a symbol, a space and the symbol.

### S12. Stays base: nightly price label
- File: `Bases/Stays.base`
- Template text: `    displayName: Per night` (the line under `price_per_night:`)
- Example text: `    displayName: ₹ / night`
- Meaning: heading of the nightly-price column.
- From: `currency_symbol`. With a symbol S write `S / night`. With no symbol leave `Per night`.

## Not text slots (the code reads `trip.md` itself)

- Map box: `skills/add-place/scripts/validate.mjs` reads `map_box` (`{lat_min, lat_max, lng_min, lng_max}`) from `trip.md` at the vault root. When `trip.md` or `map_box` is missing or empty, the coordinate box check is skipped. Nothing to replace.
- Regions: the validator reads `regions` (a list) from `trip.md` and warns when a Location's `state` is not in it. When absent, it falls back to the FIELD GUIDE list (S4). When `regions` is set, the S4 list is not checked.
- Not covered here (Phase 4 fills these in): the placeholder text in `vault-template/00 Home.md`, and optional field blocks (heating, hot water, veg food, and so on) that the init skill may add or remove.

## Check

After filling the slots, these must still hold:
- `diff -r vault-template/Templates example-vault/Templates` shows only lines from S1 to S8.
- `diff -r vault-template/Bases example-vault/Bases` shows only lines from S9 to S12.
- `diff -r vault-template/.obsidian example-vault/.obsidian` shows nothing.
