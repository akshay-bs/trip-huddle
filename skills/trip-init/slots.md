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
- Meaning: default usable daylight hours for a day. It is only a fallback: the `plan-day` skill works out real sunrise, sunset and `daylight_hrs` for each date and place, and uses this number only when it has no coordinates. The Itinerary base computes slack from `daylight_hrs`.
- From: `daylight_hrs`

### S2. Day Plan: day start
- File: `Templates/Day Plan.md` (Schedule table)
- Template text: `| 08:00 | Breakfast / depart |  |`
- Example text: `| 07:00 | Breakfast / depart |  |`
- Meaning: usual start of the day. `plan-day` replaces it with the day's real start.
- From: `day_start`. Keep the `HH:MM` format.

### S3. Day Plan: sunset
- File: `Templates/Day Plan.md` (Schedule table)
- Template text: `| 18:00 | Sunset |  |`
- Example text: `| 16:30 | Sunset |  |`
- Meaning: sunset time in the travel season. `plan-day` replaces it with the sunset it works out for the date, and falls back to this value (with `daylight_hrs`) when it has no coordinates.
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

### S13. Itinerary base: the "ok" threshold of the verdict
- File: `Bases/Itinerary.base` (the `verdict` formula)
- Template text: `formula.slack_hrs < 1.5` (in `if(formula.slack_hrs < 0, "too much", if(formula.slack_hrs < 1.5, "tight", "ok"))`)
- Example text: the same, `1.5`
- Meaning: the slack, in hours, that a day needs to be "ok". A Base formula cannot read `trip.md`, so this is the one place where a `planning_limits` value is written into a file instead of being read. Everything else (`sun.mjs slack`, `travel.mjs`, the checker) reads `trip.md` itself.
- From: `planning_limits.slack_ok_hrs` (default 1.5). Replace only the number after `formula.slack_hrs < ` in the second comparison. The `< 0` never changes.

### S14. Bookings base: cost split count
- File: `Bases/Bookings.base`
- Template text: `  cost_per_split: if(cost_agreed, cost_agreed / 1, "")`
- Example text: `  cost_per_split: if(cost_agreed, cost_agreed / 4, "")`
- Meaning: the number of equal shares each agreed booking cost is split into, as in S9.
- From: `cost_split_units`. Replace only the number after `cost_agreed / `. A vault made before 0.11.0 has no Bookings base until `--add-bookings` adds it; until then the slot is skipped.

### S15. Bookings base: split column label
- File: `Bases/Bookings.base`
- Template text: `    displayName: Per person` (the line under `formula.cost_per_split:`)
- Example text: `    displayName: Per family ₹`
- Meaning: heading of the per-share cost column, as in S10.
- From: `cost_split_label` and `currency_symbol`, written the same way as S10.

## Not text slots (the code reads `trip.md` itself)

- Map box: `scripts/validate.mjs` reads `map_box` (`{lat_min, lat_max, lng_min, lng_max}`) from `trip.md` at the vault root. When `trip.md` or `map_box` is missing or empty, the coordinate box check is skipped. Nothing to replace.
- Regions: the validator reads `regions` (a list) from `trip.md` and warns when a Location's `state` is not in it. When absent, it falls back to the FIELD GUIDE list (S4). When `regions` is set, the S4 list is not checked.
- Trip facts in `00 Home.md`: `init.mjs` fills a line only while it still holds the starter text (`<...>` or empty). Hand-written lines are kept.
- Travel settings: `skills/review-travel-times/scripts/travel.mjs` reads the optional `road_speeds` (e.g. `{hill: {car: 30, group: 22}}`) and `stop_buffer` (`{min_per_hour: 10, min_per_stop: 15}`) from `trip.md`, and the vehicle class from `group_vehicle`. They are not in the starter `trip.md`; the answers file can carry them, `init.mjs` checks them (with `settingsProblems` from `travel.mjs`) and writes them after `field_packs`, and `--reconfigure` keeps the existing ones when the answers leave them out. Nothing to replace in the templates.
- Planning limits: `planning_limits` (`slack_ok_hrs` 1.5, `dark_drive_tight_min` 30, `late_finish_min` 60, `max_drive_hrs_day` 6) is in the starter `trip.md`. `scripts/trip-settings.mjs` reads it for `scripts/validate.mjs`, `skills/plan-day/scripts/sun.mjs` (`slack`), `skills/review-travel-times/scripts/travel.mjs` and `init.mjs`. Only `slack_ok_hrs` also has a text slot (S13, the Itinerary base). `init.mjs` merges the answers over the vault's current values (on `--reconfigure`) over the defaults, so giving one limit never resets the others, and it rejects values that are not numbers.
- Stage: `stage` (`planning`, `booking`, `travelling`, `after`) is in the starter `trip.md`. `scripts/validate.mjs` warns about any other word; `init.mjs` keeps the vault's current stage on `--reconfigure` when the answers leave it out, and refuses a bad one. Nothing to replace in the templates.
- Decision template: `Templates/Decision.md` and `Bases/Decisions.base` have no slot. They are copied with the rest of `vault-template` into a new vault, are the same in `example-vault`, and `--reconfigure` does not add them (or the `Decisions/` folder) to an older vault; the `group-decisions` skill asks before adding them.
- Booking list: `Templates/Booking.md` has no slot, and the booking fields in the Stay, Transport and Location templates are the same in both vaults. A new vault gets them, the `Bookings/` and `Confirmations/` folders and the *Bookings* section of `00 Home.md` with the rest of `vault-template`. `--reconfigure --add-bookings` adds them to a vault made before 0.11.0 (only adding, and only what is missing); existing notes get their new fields from `skills/group-decisions/scripts/migrate-bookings.mjs`.
- Destination brief and group wishes: `Templates/Destination Brief.md` has no slot, and is the same in both vaults (the brief itself, `Destination Brief.md` at the vault root, is written by the `trip-init` skill from research, not by `init.mjs`). `group_wishes` (`{must: [], nice: [], avoid: []}`, lists of short lines) is in the starter `trip.md`; `scripts/trip-settings.mjs` reads and checks it for `scripts/validate.mjs` and `init.mjs`. `init.mjs` writes it empty in a new vault; on `--reconfigure` each list the answers give replaces that list and the others are kept, and it refuses a bad shape. A `trip.md` with no `group_wishes` (a vault made before 0.13.0) only gets it with `--reconfigure --add-scout`, which also adds the template, `research` in the Source template's `source_kind` list, the `destination` and `checked_on` types, and the brief's line and paragraph on `00 Home.md` (only adding, and only what is missing). Nothing to replace in the templates.
- Comparison template: `Templates/Comparison.md` has no slot. It is copied with the rest of `vault-template` into a new vault, is the same in `example-vault`, and `--reconfigure` does not add it to an older vault (the `compare-itineraries` skill asks before adding it).
- Field packs (`field-packs/*.json`): extra properties added before `recommended_by:` and extra FIELD GUIDE lines, plus their types in `.obsidian/types.json`. Packs not chosen are taken out again; their types stay (harmless).

## Check

After filling the slots, these must still hold:
- `diff -r vault-template/Templates example-vault/Templates` shows only lines from S1 to S8.
- `diff -r vault-template/Bases example-vault/Bases` shows only lines from S9 to S15 (S13 matches while `slack_ok_hrs` is the default 1.5).
- `diff -r vault-template/.obsidian example-vault/.obsidian` shows nothing.
