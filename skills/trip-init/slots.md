# Slots: the per-trip values in `vault-template`

`scripts/init.mjs` fills these in. It finds each line by its pattern, not its exact text, so re-running it with new answers works. If you add a slot, add it to `init.mjs` and here.

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
- Example text: `category: waterfall | viewpoint | cave | village | root-bridge | lake-river | wildlife | temple | museum | market | tea-estate | activity | …`
- Meaning: the kinds of place. The list ends in `…`, so it is open: the validator doesn't warn on other values.
- From: `categories`. `init.mjs` writes `category: a | b | c | …`.

### S7. Stay: base towns
- File: `Templates/Stay.md` (FIELD GUIDE comment)
- Template text: `base_town: base town the stay is in  (set your list at trip setup)`
- Example text: `base_town: Guwahati | Shillong | Sohra | Dawki | Mawlynnong | Kaziranga | Majuli | …`
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

- Map box: the shared checker (`scripts/validate.mjs`) reads `map_box` (`{lat_min, lat_max, lng_min, lng_max}`) from `trip.md` at the vault root. When `trip.md` or `map_box` is missing or empty, the coordinate box check is skipped. Nothing to replace.
- Value lists: the checker reads `regions`, `bases` and `categories` from `trip.md`. A Location's `state` must be in `regions` (the S4 list is then not checked). `bases` (S5, S7) and `categories` (S6) are only enforced when the template's list is closed; the lists `init.mjs` writes end in `…`, so they are open. Without `trip.md` lists it uses the FIELD GUIDE list. Optional extra `trip.md` properties, not written by `init.mjs`: `decision_values` (default: the template's `decision` list) and `folders` (e.g. `{location: Places}`, to override a template's folder).
- Checker hint: each template's first comment has a line `checker: folder=<Folder>; required=<field>, <field>`. `folder` is where notes of that type live; `required` lists fields that may not be empty (`recommended_by` is always required when the template has it). Keep this line when editing a template. `init.mjs` and the field packs leave it alone. Field pack properties are checked automatically: they are template properties, and their FIELD GUIDE lines give the allowed values.
- Trip facts in `00 Home.md`: `init.mjs` fills a line only while it still holds the starter text (`<...>` or empty). Hand-written lines are kept.
- Field packs (`field-packs/*.json`): extra properties added before `recommended_by:` and extra FIELD GUIDE lines, plus their types in `.obsidian/types.json`. Packs not chosen are taken out again; their types stay (harmless).

## Check

After filling the slots, these must still hold:
- `diff -r vault-template/Templates example-vault/Templates` shows only lines from S1 to S8.
- `diff -r vault-template/Bases example-vault/Bases` shows only lines from S9 to S12.
- `diff -r vault-template/.obsidian example-vault/.obsidian` shows nothing.
- `cd example-vault && node ../scripts/validate.mjs` reports 0 errors.
