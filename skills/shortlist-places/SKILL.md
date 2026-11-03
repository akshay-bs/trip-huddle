---
name: shortlist-places
description: Turn what a trip-huddle group wants from a trip into a shortlist of places worth researching properly. Use after trip-init, when the vault has a destination brief and few or no places, or whenever the user asks "what should we see", "where should we go in X", "suggest places for us", "make a shortlist", "find more places in the south", "we have 3 more days, what else is there", "show me what we skipped". It asks for the group's must-haves, nice-to-haves and things to avoid (saved as group_wishes in trip.md), researches 20 to 25 candidates by region in the background, marks each one fits, mixed or doesn't fit with the reason, writes them as a research Source note, and hands the places the group picks for a deep dive to add-place. It never scores places and never decides for the group.
---

# Shortlist places

A group going somewhere new can't name places yet. It searches the web, reads ten blogs and ends up with a long list that ignores who is travelling, and the loudest voice picks. This skill does three things: **asks what the group wants, lists the places that suit it, region by region, and lets the group pick which ones to research properly.**

**The wishes are the group's; the reasons are for the group.** Write every wish in the group's own words, and every row in plain words: "doesn't fit: about 180 steep steps", not a field name or a number out of ten.

Rules that do not bend:
- **The group decides.** You fill in the table; the Pick column is the group's. Never set a place's `decision`: the deep dives go in as `considering`.
- **No scores, ranks or stars.** Like `compare-itineraries`, a place gets **fits**, **mixed** or **doesn't fit**, with the wish it matches or clashes with. A place that clashes with an *avoid* wish still goes on the list, marked doesn't fit with the reason.
- **Every must-have is covered** by at least one candidate, or the shortlist says plainly that the destination does not offer it in that season, and why.
- **One wish per line, in the group's words.** When different people want different things, each wish is its own line, with who asked for it when the user says so ("surfing (Ravi)"). Never merge two wishes into one.
- **Skip means skip.** A skipped place stays on the list with its reason, and a new run never suggests it again, unless the user asks to see the skipped ones.
- **Places already in the vault are marked, not repeated.**
- **Locked decisions are rules.** Read `Decisions/` first. A locked route, base, date or activity limits the regions and days; say so when a candidate would need it changed.

The vault root is the current working directory. Scratch files go in `.claude/scratch/` and get deleted at the end.
**Pipeline:** read the trip → what the group wants → the candidate list → write the shortlist → the group picks → deep dives to `add-place` → close → validate → report.

## 1. Read the trip
- `trip.md`: `destination`, `start_date`, `end_date`, `season`, `regions`, `bases`, `categories`, `travellers`, `traveller_notes`, `pace`, `food_needs`, `group_vehicle`, `planning_limits` (`max_drive_hrs_day`), `stage` and `group_wishes` (`{must: [], nice: [], avoid: []}`). Read **Trip facts** in `00 Home.md` and `Memories/MEMORY.md`. Never assume anything about the group.
- `Destination Brief.md` at the vault root: the regions, how the dates fit each one, the kinds of experiences, getting around. If there is none, offer to write it first (the `trip-init` skill: "refresh the destination brief"); on a no, carry on from the `regions` in `trip.md` and say the list rests on less. If its `checked_on` is more than 3 months old, say so in one line.
- If `trip.md` has no `group_wishes`, or `Templates/Destination Brief.md` is missing, the vault is older than 0.13.0: tell the user what is new (the brief, the group's wishes in `trip.md`, this shortlist) and **ask before adding it** with `trip-init` settings and `--add-scout` (see the `trip-init` skill; it touches no notes). Until then, keep the wishes in the shortlist note only.
- Read `Templates/Source Itinerary.md`. **The template is the schema** for the shortlist note.
- What is already there: the notes in `Locations/` (names and `aliases`) and any shortlist in `Sources/` (`source_kind: research`). Its skipped rows are never suggested again; its other rows are kept.

## 2. Step 1: what the group wants
A short interview, **one group of questions per message**, each with a default the user can take by saying "fine". Draw the defaults from `traveller_notes`, `pace` and the brief (its kinds of experiences and how the dates fit). Skip a message when `group_wishes` already answers it and the user only wants more places.
1. **Must have:** the experiences the trip fails without ("at least two beach days", "see elephants").
2. **Nice to have:** "a tea estate", "one night somewhere remote".
3. **Avoid:** "long hikes", "no more than one early start", "crowded beaches".
4. **Pace:** places per day, how many base changes, hours of driving a day.

Short plain lines, one wish each. Accept "nothing" for a list.

**Save them** with the `trip-init` script, so they are checked: copy every property of `trip.md`'s frontmatter into `.claude/scratch/trip-answers.json` (the same names, as in the `trip-init` skill, section 3), set `group_wishes` to the three lists, put the pace answers in `pace` (in words: "easy walks, 2 or 3 places a day, 3 bases at most") and the driving hours in `planning_limits.max_drive_hrs_day` when they changed, then from the vault folder:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/trip-init/scripts/init.mjs" --answers .claude/scratch/trip-answers.json --reconfigure
```
It should change only `trip.md` (and the home page's Trip facts if the pace changed). If it stops with an error, show it in plain words and fix the answers. Every later skill reads the wishes: `build-itinerary` lists a must-have a route misses under *Red flags*, `compare-itineraries` adds a row with the must-haves each option covers, `plan-day` treats the avoid list as guidelines.

## 3. Step 2: the candidate list
**How many:** about **20 to 25** candidates by default; **10 to 15** for a small destination (an island, one city and its surroundings); for a big country, **in rounds by region**, up to about 30 in all: first the regions that cover the must-haves (or the ones the user names), then ask which regions to do next. "Find more places in the south" or "we have 3 more days" is a new round for those regions only, added to the same shortlist.

**Research in the background:** one `general-purpose` agent **per region**, in parallel, on a cheaper model than yours, with the prompt in `${CLAUDE_PLUGIN_ROOT}/skills/shortlist-places/references/agent-prompt.md`, filled in. Give each agent its share of the count, the wishes, and the names to leave out (the vault's places and the skipped rows). Tell the user in one line that the research is running; never make them wait in silence.

**When they are back,** merge the tables:
- Drop doubles and anything already in the vault or skipped before. Places already in the vault go in a line under their region: "Already in the vault, so not repeated: [[A]], [[B]]".
- **Grouped by region, not one long list.** The region decides the route: a beach 6 hours from everything else is a different choice from one on the way. Use the brief's regions.
- **Check every must-have** against the rows. One not covered: search once more, yourself; still nothing, write it plainly ("whale watching: not in June; the season is December to April").
- Check each row's **Season** (good, mixed or poor for the dates, with a word on why) and **Fits the group** (fits, mixed or doesn't fit, with the wish it matches or clashes with). A row with a score in it is rewritten.

## 4. Write the shortlist
File: `Sources/Shortlist - <destination>.md` (the folder is `folders.source` in `trip.md`), from `Templates/Source Itinerary.md`: every property in template order, the comment kept, `{{title}}` and `{{date}}` replaced. One shortlist per destination: a new round **updates it**, adding rows and keeping every pick and every skipped row.
- **Properties:** `source_from: trip-huddle research (shortlist-places)`, `source_kind: research`, `received_on` today, `processed: false`, `tags` keeps `source` and adds a short CamelCase tag such as `ShortlistPortugal` (`add-place` copies it onto each place).
- **Route summary:** one line: not an itinerary, a shortlist made from the group's wishes and the [[Destination Brief]], grouped by region.
- **Wishes covered** (a section after *Day by day*): one bullet per wish, in the group's words: the candidates that cover it, or why the destination does not offer it then. For an avoid wish, the places that clash with it.
- **Places mentioned:** a `### <Region>` heading per region, one line on the region (how far, how it fits the dates), then a table with exactly these columns: `| Place | Region | Type | Why go | Season | Time needed | Fits the group | Pick |`. Type is one of the trip's `categories`. **Pick** is empty until the group decides. A place is **plain text** until it has a note; once `add-place` has made it, it becomes a link `[[Name]]`. Never link a place that has no note (it would make an empty note when clicked).
- **Stays mentioned** and **Restaurants and cafes mentioned:** "None." (stays and food come later, with `add-place`).
- **Notes / opinions from the source:** that the rows are research, not checked on the ground; what could not be found.
- **Original text / attachment:** every source the agents used, with its date.

A finished example: `${CLAUDE_PLUGIN_ROOT}/skills/shortlist-places/references/shortlist-example.md` (made up, Portugal). Match its shape and tone.

## 5. Step 3: the group picks
Show the list in the chat, region by region, a line per place (name, why go, fits or doesn't fit), and ask the group to mark each one **deep dive**, **maybe** or **skip**. They can answer in the chat ("deep dive the winery and both beaches, skip the palace") or edit the Pick column themselves. Write what they say in the Pick column: `deep dive`, `maybe`, or `skip: <the reason>`.
- **Deep dive:** hand the places to **`add-place`**, which researches each one in full and creates a Location note with `decision: considering` and this shortlist in `recommended_by`. Tell it the source is `[[Shortlist - <destination>]]` with its tag, so it skips its own source step, and give it each place's row (region, why go, time needed). With 3 or more places, `add-place` fans out to background subagents as usual. When it is done, turn each Place cell into a link to the note it made.
- **Maybe:** stays on the list, Pick `maybe`. `group-decisions` lists "places still marked maybe" as an open question.
- **Skip:** stays on the list with the reason, and is never suggested again unless the user asks to see the skipped ones.

The shortlist is **processed** (`processed: true`) when every row is deep dive (with its note) or skip. While rows are still unpicked, keep one line in `00 Home.md` under *Inbox: itineraries to process*: `- [ ] [[Shortlist - <destination>]]: <N> places to pick`. Remove it once no Pick is empty.

## 6. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
For a research Source it checks that *Places mentioned* has a table with a Place and a Pick column, that every Pick is deep dive, maybe or skip (or empty), that every "Fits the group" starts with fits, mixed or doesn't fit, and, once `processed: true`, that no row is still maybe or empty and that every deep dive row links a note that lists this shortlist. It also checks `group_wishes` in `trip.md` (three lists of short lines; a bad shape is an error). Fix every error in the notes you wrote. Delete `.claude/scratch/`.

## 7. Report to the user
Plain words, short. No field names or raw agent output.
- **First:** the wishes, in one line each list, and that they are saved for the other skills.
- **Then the list:** how many places, per region, and each must-have with how many places cover it, or that it is not available then, and why.
- **After the picks:** which places went to a deep dive (with links to the new notes), how many are still maybe, how many were skipped.
- **Last, one question or the next step:** while rows are unpicked, "Which of these should we look into properly?"; once the deep dives are done, offer `build-itinerary` when the group has selected places, or `add-place` for stays in the regions it likes.
