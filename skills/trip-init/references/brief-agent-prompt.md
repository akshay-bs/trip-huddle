# Subagent prompt for the destination brief

Fill in the `<…>` parts. Run **one** `general-purpose` agent, in the background, on a cheaper model than yours (set the agent's model to `haiku` where you can). Start it right after interview message 1 (*Basics*) and carry on with the interview: never wait for it.

---

You are researching a destination for a group trip. You write **nothing** to disk; you reply with the brief as text.

**The trip:** destination <destination>; dates <start date> to <end date>, or "<month or season>" if there are no dates yet; starts in <arrival> and ends in <departure>, if known. Nothing else about the group is known yet, so don't guess it.

**Read first:** `<CLAUDE_PLUGIN_ROOT>/vault-template/Templates/Destination Brief.md` (the sections and the rules in its FIELD GUIDE), and the finished example `<CLAUDE_PLUGIN_ROOT>/skills/trip-init/references/destination-brief-example.md` (match its length and tone).

**Your task:** research the destination on the web (WebSearch and WebFetch) and write the body of the brief, section by section, in plain, short sentences:
- **At a glance:** 3 to 5 lines: what the place is like, and who it suits.
- **Safety and rules:** safety advice from official travel advisories (a government's travel advice page), visa, health (vaccines, water), money (cards, cash, ATMs), and local customs that matter. **Every line ends with its source and the date you checked it**, e.g. "(UK FCDO, Portugal travel advice, checked 2026-11-03)". If you could not check something, say so; never fill a gap from memory.
- **When to go:** the best months, and how the trip's dates fit **each region** (monsoons, heat, festivals, crowds).
- **How long:** the usual trip length as a range, and what a short, a usual and a long trip covers.
- **Kinds of experiences:** the kinds of places (beach, hill country, caves, wildlife, ruins, food) and which regions have them.
- **Regions:** one line per region: what it is known for, and how it fits the dates.
- **Common routes:** 2 or 3 routes people usually take, one line each, as `Town A (2N) → Town B (2N) → Town C (3N)`, each with the page it came from (name, link, date published or checked).
- **Budget:** a daily range per person for budget, mid-range and comfort travel, in <currency, or the local currency>, and what drives the cost. Ranges only, never one number; mark them as estimates.
- **Getting around:** the usual choices (driver, train, self-drive, buses) and what fits a group.
- **Sources:** every source you used, with its link and date.

Rules:
- **The destination, not single places.** Name regions, base towns and usual routes. Never a list of sights, beaches or hotels to visit: that is a later step.
- **A trip across two countries** gets a short `### <Country>` subsection inside each section where the answers differ (visa, money, safety), in the same brief.
- **Plain words.** No field names. Mark every estimate as an estimate.

**Then, for the interview, reply with these suggestions** (each one a value plus a few words on why):
- regions (3 to 7, the names people use), and likely base towns,
- the season in a word or two, and the season verdict for the dates in each region,
- for the dates and the main region: usable daylight hours, a usual day start, the sunset time,
- a map box around the likely regions: `lat_min`, `lat_max`, `lng_min`, `lng_max`, rounded to half a degree and a little wider than the regions,
- the currency code and symbol, and the mid-range daily budget per person,
- 6 to 12 place categories that fit the destination, lowercase with hyphens (`beach`, `wildlife`, `tea-country`, `heritage`),
- any area where people say not to drive after a set time (a border road, a forest closed at dusk), with its source.

**When you're done,** reply with the brief body (from `## At a glance` to `## Sources`), then the suggestions, then your doubts: what you could not check, and what conflicted between sources.
