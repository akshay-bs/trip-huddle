---
name: add-place
description: Add new locations (places to visit) or stays (hotels, homestays, Airbnbs, resorts) to a trip-huddle Obsidian trip vault, consistently. Use whenever the user asks to add, include or put a named place, waterfall, viewpoint, activity, hotel or stay "to the list". Also use when the user mentions a place that might already exist (it adds the new source to the existing note instead of duplicating it). A pasted itinerary, quote, hotel list, link or friend's suggestions goes to the add-source skill first, which then hands the items to this one.
---

# Add a location or stay to the trip vault

The vault root is the current working directory (the Obsidian vault). Every new place or stay follows the same pipeline:
**source → dedupe → research → write the note → link back → validate → report**.
Never skip the dedupe or validate steps.

## 0. Before you start
- Read `00 Home.md` → **Trip facts**: dates, arrival and departure, group size and makeup, pace, vehicle. Judge every place and stay against them.
- Read `Memories/MEMORY.md` and the memories relevant to the task. Two defaults apply unless a memory says otherwise:
  - **Fixed dates are fixed.** If Trip facts say the travel dates are booked, judge timing against them and never propose moving them.
  - **Additions stay open for the group.** Add everything the user mentions, even if it's off-route, and leave it `considering`.
- Every file you create stays inside the vault. Scratch files go in `.claude/scratch/` and get deleted at the end.
- Read the locked decisions in `Decisions/` (the folder may not exist in an older vault). A decision with `status: locked` is a hard rule. Adding is still fine, and the item still goes in as `considering`, but flag it in the report and ask when it conflicts with a lock: a stay in a base whose stay is locked, a place that is far from or off the locked route, a place that needs a day the locked dates do not have, an activity at a time that clashes with a locked one. Do not change a locked decision or a note it points to.
- Read the current templates: `Templates/Location.md` and `Templates/Stay.md`. **The template is the schema:** use its property list, property order and FIELD GUIDE values. If the template has changed, follow the template, not this skill.
- If the vault's `Templates/Location.md` has no `after_dark` field (the vault is older than 0.6.0), run `node "${CLAUDE_PLUGIN_ROOT}/skills/add-place/scripts/migrate-after-dark.mjs"` from the vault root first. It adds the new fields empty and turns `best_time_of_day` into a list; run it with `--dry-run` to see what it would do.

## 1. Identify the source
Every addition must be traceable to a note in `Sources/`.
- **A new itinerary, quote, hotel list, link or set of suggestions:** run the `add-source` skill first. It writes the Source note and calls this skill with it. When you are called that way, the Source note and its tag are given: use them and skip the rest of this step.
- **Existing source:** if the request belongs to one (the same person, the same itinerary, a same-day follow-up), reuse it and its tag.
- **Just a named place or stay, no source yet:** create a minimal `Sources/<Who> - <Label>.md` from `Templates/Source Itinerary.md`, e.g. `Alex - Additions 2Oct`. Fill in `source_from`, `source_kind` and `received_on`, and paste the user's original wording under "Original text / attachment". Give it a short CamelCase tag with no spaces, e.g. `#Alex2Oct`.

## 2. Dedupe (always)
Before creating anything, search for the place or stay. The user's spelling is often off: "laboon" means Labon, "double root bridge" means Double Decker Living Root Bridge.
- Search note names in `Locations/` and `Stays/` (Glob).
- Search the `aliases:` in frontmatter: `Grep pattern "<word>" path Locations` (or `Stays`), case-insensitive. Try the key word on its own, e.g. "Labon", "Nongriat", "Sapphire".
- If it's ambiguous ("Blue Lagoon" could mean several places), pick the most likely one and say so in the note and the report. Ask only if the candidates lead to very different trips.

**If it already exists, don't create a new note.** Instead:
1. Add the source to its `recommended_by` (a quoted wikilink, appended to the list) and add the source tag to its `tags`.
2. In the source note's checklist, write `- [x] [[Existing Note]] (already on the list from [[Earlier Source]])`.
3. Correct facts only if the new source contradicts them; otherwise leave the research alone.

## 3. Naming
- File name = the H1 heading = the canonical English name in Title Case, e.g. `Krang Suri Falls.md`, `Hotel Sapphire Shillong.md`.
- Add a parenthetical when the bare name is ambiguous or generic: `Balancing Rock (Mawlynnong)`, `Blue Lagoon (Nongriat)`, `River Dolphin Point (Mayong)`.
- No `[ ] # ^ | : / \ ?` characters in names. Spellings the user used, and local names, go in `aliases`.
- Locations go in `Locations/` and stays go in `Stays/`. **Nothing goes in the vault root.** Only `00 Home.md` and `trip.md` live there.

## 4. Research and write the note
- **Several items:** with 3 or more new items, fan out to `general-purpose` subagents, 3–5 items per agent, grouped by area. Run them in the background, in parallel. Use the prompt in `${CLAUDE_PLUGIN_ROOT}/skills/add-place/references/agent-prompt.md`, filled in.
- **One or two items:** do them yourself, following the same rules.

**Rules for every note** (also given to agents):
- **Start from the template.** Keep **every property, in template order**, and keep the FIELD GUIDE comment block. Replace `{{title}}` with the name.
- **Values:**
  - Enum properties use the values from the FIELD GUIDE. Unknowns: blank, or `unknown` where the guide allows it.
  - Number, checkbox and date properties hold plain values only: no units, no "approx", no text (types are in `.obsidian/types.json`). Money fields (`entry_fee`, `price_per_night`, `est_total` and so on) are plain numbers in the trip currency from `trip.md`, with no symbol. Put caveats in the body.
  - Leave a value blank rather than guess. Say what's uncertain in the body.
- **Location fields:**
  - `location` is `[lat, lng]`, decimal degrees with 4 decimals, as a YAML list. Verify it with OpenStreetMap (Nominatim), Wikipedia or an official page. For places, use the spot the group actually stands at (viewpoint, ghat, trailhead); give other points in the body.
  - `maps_link` is `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, or a name query for stays.
- **Planning fields:**
  - `decision: considering`. Leave `priority`, `decision_reason`, `decided_on` and `scheduled_day` blank. Stays also get `booking_status: not-contacted`. **Never set selected or dropped.** That's the group's call.
  - `recommended_by` is a list of quoted wikilinks to source notes: `- "[[Alex - Additions 2Oct]]"`.
  - `tags` keeps `location` or `stay`, plus the source tag.
- **Judging fit:**
  - `season_verdict`, `difficulty` and `group_fit` are honest judgements for the group in Trip facts (ages, fitness, how much walking and how many steps they accept, vehicle size). `season_verdict` is about the travel season in Trip facts: weather, water levels, daylight, closures and crowds on those dates.
  - Walk distance and duration are **round trip**.
- **Time of day and after dark** (research these, don't leave them blank when sources exist):
  - `best_time_of_day` is a **list** from the template's values (`sunrise | morning | midday | afternoon | sunset | evening | night | any`), e.g. `[sunrise]` or `[evening, night]`. Details such as "before the tour buses arrive" go in the body.
  - `after_dark` is `good` (worth visiting after dark: lights, night market, festival), `fine` (no problem, nothing special) or `avoid` (closes, is unsafe or pointless after dark, or the way back is a bad night drive). Judge the road back as well as the place, using `last_mile` and the distance to the nearest `evening_base` in `trip.md`.
  - `after_dark_note` is the reason in a few words ("lit up for the festival", "no lights, forest road back").
  - When the reason depends on the season (a festival, the monsoon, short winter days), also say so in `season_note`.
  - **Mark guesses honestly.** If you could not find evidence, leave `after_dark` blank (blank means unknown) or write the value and start the note with "Guess:", and say why in the body. Never present a guess as researched.
- **Stays:**
  - Size `room_config` and `rooms_needed` for the group in Trip facts.
  - Seasonal essentials (`heating`, `hot_water`, `power_backup` for a cold-season trip) come from reviews, or are `unknown`.
  - Note red flags honestly: capacity, location vs. the claimed town, scam listings, cleanliness.
- **Body:** fill every template section concisely.
  - Directly under the H1, add the group-decision callout:
    ```
    > [!question] Group decision: open
    > Added from [[<Source>]] (<date>). The group hasn't discussed it yet. Keep `decision: considering` until the group decides.
    ```
  - Add a `> [!warning]` callout for anything that changes the decision: dry in season, closed on the trip dates, strenuous, needs a 4x4, the hotel is too small.
  - Cross-link related Location and Stay notes with `[[wikilinks]]`. Only link to notes that exist (or that you're creating in this same run).
  - **Places:** end with "Sources & links": the source wikilinks (with the day, if given) plus 2–4 web references.
  - **Stays:** end with "Links": "Proposed in [[Source]] (Day X, N nights)", related locations, and web references.
  - Never put hotel-to-place distances in a location note. Distances belong in Day Plans.
- **Photos:** 2–3 real images.
  - **Places:** Wikimedia Commons direct `upload.wikimedia.org` URLs (`/thumb/.../1280px-` is fine). Take each URL from the Commons file page or API.
  - **Stays:** the official site, or an OTA image CDN, verified to load.
  - Embed as `![Caption|700](URL)` with a credit line, and set `cover:` to the first URL.
  - Never download files. Never invent URLs. If you can't find any, say "No openly licensed photos found" in the Photos section.

## 5. Link back
After the notes are written:
1. **Source note:**
   - Tick each item in "Places mentioned" or "Stays mentioned" as `- [x] [[Name]]` (with "(new)" or "(already on the list from …)").
   - Add "Our observations" bullets for the important findings (strenuous, dry, off-route, capacity).
   - Set `processed: true` once every item is linked.
2. **`00 Home.md`, under "Open questions for the group":** add one `- [ ] Group decision on …` line. Use one line per item for one or two items, or one grouped line per source for more (follow the existing lines there). List anything the group needs to answer.
3. **Don't touch** `Itinerary/Route.md`, the Day notes or any `decision` fields unless the user asks.

## 6. Validate (required)
Run the validator from the vault root. It reads the vault's own `Templates/` folder, so it checks every note type and any fields added at setup: missing and unknown properties, property types, FIELD GUIDE values, coordinates (against `map_box` in `trip.md`, if set), link resolution, back-links, duplicates and stray files in the root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
- **Errors:** fix every error in the notes you created or edited. Errors in older notes you didn't touch: report them, don't silently rewrite them.
- **Warnings** (non-enum values, a missing back-link, an alias clash): fix the ones in your notes, or explain them.
- **Stray files:** if the validator reports empty stray `.md` files in the vault root, they were created by clicking a link before its note existed. Delete them once you've confirmed they're empty.

## 7. Report to the user
If the new item conflicts with a locked decision (section 0), say which one in the first lines, plainly, and ask whether the group wants to unlock it or keep the item as a backup. Do not unlock anything yourself.

Keep it short:
- A table: note | new or existing | Season verdict | difficulty | group_fit | photos.
- Then the flags that matter for the group's decision.
- Then the doubts: assumed identities, unverified coordinates or fees.
- Mention anything you added to the home page's open questions.
