# Plan: day trips, evenings, and rules the group bends

Status: built (v0.6.0).

## The problem
plan-day uses one rule: leave outdoor places before sunset, and keep the last drive short after dark. Real groups plan more finely than that:
- Some places are day-only. The place may be fine at dusk, but the road back is a long, unlit forest or hill road.
- Some places are better after dark. For example, a church or a market lit up for a festival.
- Evenings belong in cities and large towns, where walking around after dark is easy.
- People bend their own rules for things they love. The plan should say so, not hide it.

**Principle:** the place fields below are for the agent, which collects them and builds the route. The group mainly reads the plan and the reasons behind it, so plan-day turns the fields into a plain-language "Why this plan" section and never shows the raw values.

## Approach
Ask two questions, about the **place** and about the **road**:
1. Is this place good, fine, or best avoided after dark? Is there a best time to be there?
2. Is this drive fine after dark?

Each base town also says whether its evenings are easy. The skills fill these in. When a plan breaks a rule, the skill asks the user and writes the choice down.

## 1. Place notes (Location template)

`best_time_of_day` already exists but has no value list. Give it one, and add two fields after it:

```yaml
best_time_of_day: []        # any of: sunrise | morning | midday | afternoon | sunset | evening | night | any
after_dark: fine            # good | fine | avoid
after_dark_note: ""         # why, in a few words
```

Field guide lines:
```
best_time_of_day: when to be there; a list, e.g. [sunrise] or [evening, night]
after_dark: good = worth visiting after dark (lights, night market, festival)
            fine = no problem, nothing special
            avoid = closes, is unsafe or pointless after dark, or the way back is a bad night drive
after_dark_note: the reason, e.g. "lit up for the festival", "no lights, forest road back"
```

Examples (made up):
| Place | best_time_of_day | after_dark | after_dark_note |
|---|---|---|---|
| Hilltop viewpoint | [sunrise] | avoid | unlit track, cliff edge |
| City cathedral | [evening] | good | lit up in festival season |
| Border river town | [morning, midday] | avoid | 2 hrs of forest road back to base |
| Old-town market | [evening, night] | good | street food after 18:00 |

**add-place** fills these in during research, the same way it fills the season fields. When the reason depends on the season (a festival, the monsoon), put that in `after_dark_note` and in `season_note`.

## 2. Base towns (trip.md)

`bases` stays a plain list. Add one optional list:

```yaml
evening_bases: []   # bases where evenings out are easy: lit streets, food open late, short trips back to the stay
```

Example: `evening_bases: [Big City, Hill Capital]`. Small villages and forest stays are left out. trip-init asks one question: "Which of your bases are good for evenings out?"

## 3. Day notes (Day Plan template)

Legs table gets an **After dark** column:

```markdown
| From | To | km | Drive time (estimate) | After dark | Road notes |
| ---- | -- | -- | --------------------- | ---------- | ---------- |
| Base | Border town | ~80 | 2.5–3 hrs | avoid | Forest and hill road, no lights |
```

`ok` = lit highway or city streets. `avoid` = unlit, forest, hill, or bad surface.

A new section after Backup plan:

```markdown
## Choices that bend the rules
- **Staying late at City cathedral (till 19:30).** Why: it's lit up for the festival. Cost: 15 min on city streets after dark (ok).
```

One new property, so the Itinerary base can show it:
```yaml
rule_bends: 0   # how many choices above
```

## 4. How plan-day uses this

Default rules:
1. A day trip out of an `evening_base` is back on an `ok` road by sunset. The rest of its drive can run after dark only if every remaining leg is `ok`.
2. A place with `after_dark: avoid` is left by sunset (30 min before is better).
3. Evenings go to `evening_bases`. Places marked `after_dark: good` and `best_time_of_day: [evening]` are planned after sunset, and don't count towards `activity_hrs`.
4. A place with `best_time_of_day: [sunrise]` sets an `early_start`.

When a plan only works by breaking a rule:
- For a `must`-priority place, or one the user asked for by name: **ask**, briefly, in this shape: "Seeing X means driving 1 hr of forest road after dark. Do it anyway, move it to another day, or drop it?"
- If the user says do it: write it under *Choices that bend the rules*, set `rule_bends`. The verdict says why: "tight: 1 rule bend, see below".
- For a `maybe`-priority place: drop or move it without asking, and list it under Notes ("Didn't fit: …").
- Never quietly drop a `must` place.

## 5. Checker
- `after_dark` must be good, fine or avoid. `best_time_of_day` values must be from its list.
- Warning (not error): a Day schedules an `after_dark: avoid` place after sunset, or has an `avoid` leg after sunset, and `rule_bends` is 0. It reads the Schedule rows that start after sunset; an `avoid` leg counts when such a row mentions a drive and the leg's From or To. A stay that starts before sunset and runs past it is not caught.

## 6. Existing notes
The example vault's 60 places get the new fields. The script `skills/add-place/scripts/migrate-after-dark.mjs` adds them empty, so they pass the checker. It turns an old text `best_time_of_day` into a list only when every word is already a value from the list; any other text is kept as a bullet under *Tips* and the list is left empty. Filling them is a research job for add-place, done later or on request.
