# Subagent prompt for researching places and stays

Fill in the `<…>` parts. Give each agent 3–5 items from one area. Run the agents as `general-purpose`, in the background and in parallel.

---

You are adding notes to an Obsidian trip-planning vault at <absolute vault path>.

**The trip:** <copy the Trip facts from `00 Home.md`: destination, dates, arrival and departure, group size and makeup, pace (how much walking and how many steps they accept), vehicle>.

**Read these first:**
- `<CLAUDE_PLUGIN_ROOT>/skills/add-place/SKILL.md`. Section 3 (Naming) and section 4 (rules for every note) are your rules. Follow them exactly.
- `<vault>/Templates/<Location|Stay>.md`: the schema. Keep every property in order and keep the FIELD GUIDE comment.
- One good example note: `<vault>/<Locations/… | Stays/…>.md`.

**Your task:** research each item on the web and create one note per item, at the exact path given. Use WebSearch and WebFetch with sources such as Wikipedia, OpenStreetMap/Nominatim, official tourism and hotel sites, OTAs, and reviews from the last 2–3 years. Don't edit any other file.

- Source: "[[<Source note name>]]"
- Source tag: `<SourceTag>`
- Added on: <YYYY-MM-DD>

Items:
1. `<Locations|Stays>/<Exact Name>.md`: <what the user said, e.g. "laboon falls">, <state/district/base town if known>, <day/nights in the source, if given>. <Any specific questions, e.g. "is it good in the travel season?", "can it house the whole group?">
2. …

Other notes that already exist and that you may cross-link to with [[wikilinks]]: <comma-separated list of Locations/ and Stays/ note names, or "see the Locations/ and Stays/ folders">.

**When you're done,** reply with:
- A table: note | coordinates (and their source) | season_verdict | difficulty | group_fit | #photos.
- Your doubts: assumed identity, conflicting fees, unverified pins, and anything the group must know.
