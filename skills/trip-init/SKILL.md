---
name: trip-init
description: Set up a new trip-huddle Obsidian vault for a specific trip, or change an existing vault's trip settings. Use when the user wants to start planning a new trip, create or initialise a trip vault or folder, "set up trip-huddle", or change trip-wide facts such as dates, group size, cost split, vehicle, currency, season or regions ("we're now 5 families", "we switched to self-drive", "re-run trip-init settings").
---

# Set up a trip vault

A short interview, then a script does the file work. You never hand-edit templates or Bases in this skill: the script does it from the answers, so every vault comes out the same.

**Pipeline:** pick the mode → interview → confirm → write answers → run the script → check → next steps.

## 0. Pick the mode
- **New vault:** the working directory has no `trip.md`. Ask where the vault should go if the user hasn't said. The folder must be empty or not exist yet. Never set up a vault inside another vault, or on top of existing files.
- **Change settings:** the working directory has a `trip.md`. Read it, show the current values as defaults, and only ask about what the user wants to change. Notes are never touched in this mode; only `trip.md`, the templates, the Bases and the Trip facts in `00 Home.md`.

## 1. Interview
Ask in small groups, one group per message. Offer a sensible default for every question so the user can just say "fine". Accept "don't know yet": leave that value empty, and add it to the open questions.

1. **Basics:** trip name; destination; dates, and whether they're fixed (flights booked) or flexible; where the trip starts and ends.
2. **People:** how many people; how costs are split (per family, per couple, per person) and how many shares; ages or mobility needs that affect walking and pace; food needs.
3. **Getting around:** self-drive car, hired van with driver, public transport, or on foot. This decides the parking field and the travel-time notes.
4. **Place and season:** regions or states; likely base towns; the season in a word or two (e.g. "December", "monsoon", "summer"). **You suggest** daylight hours, a usual day start, sunset time, and a map box around the regions (rounded to half a degree, a little wider than the regions). The user confirms or corrects them. Say they are estimates.
5. **Money:** currency code and symbol. Suggest from the destination.
6. **What to track:** suggest place categories that fit the destination, and the field packs that fit the answers so far (see `${CLAUDE_PLUGIN_ROOT}/skills/trip-init/field-packs/`, one JSON file per pack, each with a `description` and `suggest_when`). The user picks.

Keep it to these six messages. Don't research places here; that's what `add-place` is for.

## 2. Confirm
Show one short summary of all answers, grouped as above, with the estimates marked. Ask for a yes before writing anything.

## 3. Write the answers
Write the answers as JSON to `.claude/scratch/trip-answers.json` inside the target folder (create the folder). Use exactly the property names in `${CLAUDE_PLUGIN_ROOT}/vault-template/trip.md`. Rules:
- Dates as `YYYY-MM-DD`; times as `"HH:MM"`; `daylight_hrs`, `travellers` and `cost_split_units` as numbers.
- `regions`, `bases`, `categories`, `field_packs` as lists. Categories in lowercase with hyphens (`lake-river`).
- `map_box` as `{"lat_min":…, "lat_max":…, "lng_min":…, "lng_max":…}`, or `null`.
- `cost_split_label` singular and lowercase: `family`, `couple`, `person`.
- Unknown values: `""` (or `[]` for lists).

## 4. Run the script
From the target folder:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/trip-init/scripts/init.mjs" --answers .claude/scratch/trip-answers.json
```
Add `--reconfigure` in the change-settings mode. The script:
- copies the empty vault (including the hidden `.obsidian/` and `.claude/` folders) when the folder is new,
- writes `trip.md`,
- fills the per-trip values into the templates and Bases (cost split, currency symbol, value lists, day defaults),
- adds or removes the chosen field packs in the templates and `.obsidian/types.json`,
- fills in **Trip facts** in `00 Home.md`,
- and prints every file it changed.

If it stops with an error, show the user the error in plain words and fix the answers file. Don't edit the vault by hand to work around it.

## 5. Check
Run the checker from the vault folder:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/add-place/scripts/validate.mjs"
```
It must report 0 errors. Delete `.claude/scratch/` afterwards.

## 6. Report and next steps
Tell the user, in a few short lines:
- where the vault is, and to open that folder in Obsidian as a vault,
- what was filled in, and which values are your estimates to double-check,
- the open questions (the "don't know yet" answers),
- what to do next, e.g. "Send me a friend's itinerary or a list of places, and I'll add them" (the `add-place` skill).
