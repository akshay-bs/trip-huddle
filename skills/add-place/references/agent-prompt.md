# Subagent prompt for researching places and stays

Fill in the `<…>` parts. Give each agent 3–5 items from one area. Run the agents as `general-purpose`, in the background and in parallel.

---

You are adding notes to an Obsidian trip-planning vault at <absolute vault path>.

**The trip:** <copy the Trip facts from `00 Home.md`: destination, dates, arrival and departure, group size and makeup, pace (how much walking and how many steps they accept), vehicle>.

**Read these first:**
- `<CLAUDE_PLUGIN_ROOT>/skills/add-place/SKILL.md`. Section 3 (Naming) and section 4 (rules for every note) are your rules. Follow them exactly.
- `<vault>/Templates/<Location|Stay|Food Spot>.md`: the schema. Keep every property in order and keep the FIELD GUIDE comment.
- One good example note: `<vault>/<Locations/… | Stays/… | Food/…>.md`.

**Your task:** research each item on the web and create one note per item, at the exact path given. Use WebSearch and WebFetch with sources such as Wikipedia, OpenStreetMap/Nominatim, official tourism and hotel sites, OTAs, and reviews from the last 2–3 years. Don't edit any other file.

For a food spot, follow the "Food spots" rules in section 4 of SKILL.md instead of the time-of-day research below. For every place, also research **when to go and whether it works after dark**: `best_time_of_day` (a list from the template, e.g. `[sunrise]` or `[evening, night]`), `after_dark` (good | fine | avoid, judging the road back as well as the place) and `after_dark_note` (the reason in a few words). If the reason depends on the season, put it in `season_note` too. If you couldn't find evidence, leave `after_dark` blank or start `after_dark_note` with "Guess:". Don't present a guess as researched. Also check **whether it must be booked ahead** (tickets that sell out, a safari or boat slot, a permit): if so, say why in `permits` and set `needs_booking: true` with the booking fields from SKILL.md section 4 (status `not-contacted`, everything else blank); otherwise `needs_booking: false`. Set `needs_night_nearby: true` only when the time at the place plus the drive in and out does not fit one day from any base town in `trip.md` (say why under *Access & walk*); otherwise leave it empty.

- Source: "[[<Source note name>]]"
- Source tag: `<SourceTag>`
- Added on: <YYYY-MM-DD>

Items:
1. `<Locations|Stays|Food>/<Exact Name>.md`: <what the user said, e.g. "laboon falls">, <state/district/base town if known>, <day/nights in the source, if given>. <Any specific questions, e.g. "is it good in the travel season?", "can it house the whole group?">
2. …

Other notes that already exist and that you may cross-link to with [[wikilinks]]: <comma-separated list of Locations/, Stays/ and Food/ note names, or "see the Locations/, Stays/ and Food/ folders">.

**When you're done,** reply with:
- A table: note | coordinates (and their source) | season_verdict | difficulty | group_fit | best_time_of_day | after_dark (researched or guess) | #photos. For a food spot: note | coordinates (or why empty) | kind | cuisine | veg_options | price_band.
- Your doubts: assumed identity, conflicting fees, unverified pins, and anything the group must know.
