# Plan: destination brief and place shortlist

Status: built (v0.13.0).

How it was built, where it differs from the proposal below:
- **The background research** is one `general-purpose` agent on a cheaper model, started right after interview message 1, with the prompt in `skills/trip-init/references/brief-agent-prompt.md`. It writes nothing to disk: it replies with the brief body and its suggestions (regions and bases, the season verdict per region, daylight and sunset, a map box, the currency and a daily budget range, categories, and any road cutoff it found). The interview uses them once they are back and plain defaults before; the user confirms every value. A cutoff it found is only suggested, never added without asking.
- **The note** is `Destination Brief.md` at the vault root, from `Templates/Destination Brief.md` (properties `destination` and `checked_on`; sections as in the table below, plus *History*). The "Checked on" line is the first line of the body. The checker learns the type from the template, allows it only at the vault root, refuses a second one (an error), and warns when `checked_on` is empty or a line under *Sources* has no date. It does not check each safety line for a source: the skill does.
- **The usual routes as Sources** are written by `trip-init` with `processed: true` while they name only towns. The example vault's brief points its routes to [[Example - Public research]] instead (the example's notes link only that note); the made-up Portugal brief in `skills/trip-init/references/` has two route Sources in `example-context/`.
- **`group_wishes`** is read by `scripts/trip-settings.mjs` (flow or block YAML). A bad shape is a checker **error**, not a warning, since three skills read it. A wish is at most 120 characters. `trip-init` writes it empty in a new vault; on `--reconfigure` a list the answers give replaces that list and the others are kept. An older `trip.md` without it gets it only with `--add-scout` (asked first), which also adds the template, `research` in the Source template, the `destination` and `checked_on` types and the brief's line and paragraph on the home page. No note migration is needed.
- **The shortlist table** is one table per region under a `### <Region>` heading in *Places mentioned*, with the columns below. A place is plain text until `add-place` has made its note, then a link, so the table never links a note that does not exist; places already in the vault go in one line per region instead of a row. Pick is `deep dive`, `maybe` or `skip: <reason>`. The shortlist has a *Wishes covered* section. The checker warns about a Pick or a "Fits the group" outside the words, a research Source with no Place and Pick table, and, once `processed`, a maybe or empty row or a deep dive with no note that lists the shortlist in `recommended_by`.
- **Saving the wishes** goes through the `trip-init` script (the answers with every current value plus `group_wishes`, `--reconfigure`), so they are checked like every other setting. The pace answers go in `pace` and `planning_limits.max_drive_hrs_day`.
- **The example vault** has the made-up brief and three neutral wishes (`trip-init --reconfigure` keeps them, so the example stays unchanged). The made-up shortlist is in `skills/shortlist-places/references/` for the Portugal answers, not in the example vault.


## The problem
Every trip-huddle skill starts once the group already knows the destination well enough to name places. A group going somewhere new ("Sri Lanka?") does not. Before they can add a single place they need answers to:
- Is it safe? What about visas, health, money?
- What is it like: beaches, hills, caves, wildlife, old towns, food?
- When is a good time, and does our month work everywhere or only in some regions?
- How many days do people usually spend? What does a typical route look like?
- Roughly what will it cost per day, for our kind of travel?
- Which places are worth a closer look, and which of those suit *this* group?

Today they search the web, read ten blogs and end up with a long list that ignores who is travelling. The loudest voice picks.

The group needs: **a short destination brief at setup, then a guided step that turns what the group wants into a shortlist of places to research properly.**

Two pieces:
1. **Destination brief**, inside the `trip-init` interview (new vault mode only).
2. **`shortlist-places`**, a new skill: the group's wishes, a candidate list, and the group's choice of what to research next.

## Piece 1: the destination brief (in `trip-init`)

### When it runs
After interview message 1 (*Basics*: destination and dates). The research runs in the background (one research subagent on a cheaper model) while the interview continues with *People*, *Getting around* and the rest. It never holds up a question. If it is not back by the confirm step, `trip-init` writes the vault without it and adds the brief when it lands.

`trip-init` keeps its rule "don't research places here": the brief is about the destination, not individual places. It names regions and typical routes, never a list of places to visit.

### What it feeds back into the interview
The brief improves the suggestions `trip-init` already makes:
- *Place and season*: regions, likely base towns, the season verdict for the dates, daylight and sunset, the map box.
- *Money*: currency, and a daily budget range to show the group.
- *What to track*: categories that fit the destination (a Sri Lanka trip gets `beach`, `wildlife`, `tea-country`, `heritage`, …).

The user still confirms every value. The brief only makes the defaults better.

### The note
`Destination Brief.md` at the vault root (new note type `destination`, `Templates/Destination Brief.md`). One per vault. Sections:

| Section | What goes in it |
|---|---|
| At a glance | 3 to 5 lines: what the place is like and who it suits |
| Safety and rules | safety advice from official travel advisories, visa, health (vaccines, water), money (cards, cash, ATMs), local customs that matter |
| When to go | best months, and how the group's dates fit each region (monsoons, heat, festivals, crowds) |
| How long | typical trip length, and what a short, usual and long trip covers |
| Kinds of experiences | the types of places (beach, hill country, caves, wildlife, ruins, food) and which regions have them |
| Regions | one line per region: what it is known for, how it fits the dates |
| Common routes | 2 or 3 routes people usually take, as a line each (`Colombo → Kandy (2N) → Ella (2N) → …`), with where they came from |
| Budget | a daily range per person for budget, mid-range and comfort travel, in the trip currency; what drives the cost (vehicle, stays, park fees) |
| Getting around | the usual choices (driver, train, self-drive, buses) and what fits a group |
| Sources | every source with its date |

Rules:
- **Every safety, visa and health line has a source and a date.** These change. The note says "checked on <date>" at the top, and `group-decisions` lists the brief as an open question if it is older than 3 months when the stage moves to `booking`.
- **Ranges, not single numbers**, for budget and trip length.
- **Common routes are kept as Sources.** Each common route also becomes a Source note (`source_kind: blog`), so `compare-itineraries` and `build-itinerary` can use it later like any other itinerary.

### Change settings mode
The brief is not rebuilt on "re-run trip-init settings". The group asks for it again ("refresh the destination brief"), which rewrites the note and keeps the old version's date in its history line.

## Piece 2: the `shortlist-places` skill

### When it runs
After `trip-init`, when the vault has a brief and few or no Location notes. `trip-init` offers it as the next step. It can also run again later ("find more places in the south", "we have 3 more days, what else is there").

### Step 1: what the group wants
A short interview, one group of questions per message, with defaults drawn from `trip.md` (`traveller_notes`, `pace`) and the brief:
- **Must have:** experiences the trip fails without ("at least two beach days", "see elephants").
- **Nice to have:** "a tea estate", "one night somewhere remote".
- **Avoid:** "long hikes, we have a 4-year-old", "no more than one early start", "crowded beaches".
- **Pace:** places per day, how many base changes, drive hours a day (feeds `planning_limits.max_drive_hrs_day`).

Different people in the group often want different things. The skill writes each wish with who asked for it when the user says so ("Ravi wants surfing"), and never merges two wishes into one.

The wishes are saved in `trip.md` as `group_wishes: {must: [], nice: [], avoid: []}` (lists of short plain lines). Saved there, every later skill can read them:
- `build-itinerary` checks each route option against the must-haves and lists any it misses under *Red flags*.
- `compare-itineraries` adds a row: which must-haves each option covers.
- `plan-day` reads the avoid list as guidelines, like the after-dark rules.

### Step 2: the candidate list
Research (background subagents on a cheaper model, one per region, each returning a short table) gives about 20 to 25 candidates. Each row:

| Column | Meaning |
|---|---|
| Place | name |
| Region | from the brief's regions |
| Type | the trip's categories (beach, hill station, cave, waterfall, wildlife, heritage, …) |
| Why go | one line |
| Season | good / mixed / poor for the group's dates, with a word on why |
| Time needed | half day, full day, or nights |
| Fits the group | **fits**, **mixed** or **doesn't fit**, with the wish it matches or clashes with ("fits: elephants"; "doesn't fit: 4-hour climb") |
| Pick | deep dive / maybe / skip (empty until the group decides) |

Rules:
- **Grouped by region, not one long list.** The region decides the route; a beach 6 hours from everything else is a different choice from one on the way.
- **No scores or ranks.** Like `compare-itineraries`, it gives "fits" with a reason, never points.
- **Every must-have is covered by at least one candidate**, or the skill says plainly that the destination does not offer it in that season.
- **Places already in the vault are marked**, not repeated.

The list is written as a Source note, `Sources/Shortlist - <destination>.md` (`source_kind: research`), so it uses the same tracking as any other source. The table goes in *Places mentioned* with the extra columns above.

### Step 3: the group picks
The user marks each row deep dive, maybe or skip (in chat, or by editing the table). Then:
- **Deep dive:** handed to `add-place`, which researches the place in full and creates a Location note with `decision: considering` and this shortlist in `recommended_by`. Several places at once go to background subagents, as `add-place` already does.
- **Maybe:** stays on the list, unticked. `group-decisions` lists "places still marked maybe" as an open question.
- **Skip:** stays on the list with the reason. Running the skill again never suggests a skipped place again, unless the user asks to see skipped ones.

The Source is `processed` when every row is deep dive (with a note) or skip.

## Changes to existing pieces
- `trip-init`: background brief after message 1; better defaults from it; offers `shortlist-places` at the end. The new vault mode only.
- `vault-template/` and `example-vault/`: `Templates/Destination Brief.md`; `trip.md` gets `group_wishes` (empty by default); `source_kind` value list gets `research`; the home page links the brief.
- Checker: knows type `destination` (only one per vault); checks `group_wishes` has the three lists; a Source with `source_kind: research` may have the extra columns and `skip` rows without failing the `processed` check.
- `build-itinerary`, `compare-itineraries`, `plan-day`: read `group_wishes` as described above.
- `group-decisions`: lists "maybe" places and an out-of-date brief.
- Example vault: a made-up brief and shortlist for the example's region, with public sources only (privacy rules apply: no group makeup in the wishes, use neutral wishes like "one easy-walk day").
- An older vault gets the template and the empty `group_wishes` with `trip-init --reconfigure --add-scout`, after asking, like the earlier upgrades.

## Tests
- A new vault from the Portugal answers plus a brief passes the checker.
- `trip-init --reconfigure` leaves the example unchanged, and keeps `group_wishes`.
- The checker refuses a bad `group_wishes` and a second Destination Brief.
- A shortlist Source with skip rows can be `processed`.
- `--add-scout` brings an older vault up to date and then changes nothing.

## Decisions
The open questions, settled by the owner:
1. **Where the wishes live:** in `trip.md`, as `group_wishes: {must: [], nice: [], avoid: []}` (lists of short plain-text lines).
2. **One brief per vault.** A trip across two countries gets a short subsection per country inside the same note.
3. **How many candidates:** about 20 to 25 by default; 10 to 15 for a small destination; for a big country, in rounds by region (up to about 30 in all). This is guidance in the skill.
4. **When the brief is rebuilt:** only on request ("refresh the destination brief"), not on "re-run trip-init settings". If the destination changes in the change-settings mode, `trip-init` suggests refreshing it but does not do it unasked.
