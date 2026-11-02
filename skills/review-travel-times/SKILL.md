---
name: review-travel-times
description: Check the drive times of a trip-huddle trip and say whether each day is realistic before dark. Works on the Day notes made by plan-day, or on an itinerary in a Source note (an agency quote or a friend's plan) before any Day notes exist. Use whenever the user asks "are these drive times realistic", "can we really do this before dark", "check the travel times", "is this agency plan too much", "is this day too long". It checks each drive three ways (a map time, a typical speed for the kind of road, local reports), adds time for stops, compares the day with sunset, and gives each day a verdict: ok, tight or too much. It never rewrites a day by itself: it offers fixes, asks, and hands the chosen one to plan-day.
---

# Review the travel times

plan-day writes drive times as researched estimates, and they are usually optimistic. Map apps assume a car, not a loaded group vehicle on hill roads. They leave out toilets, tea, photos, loading ten people and waiting for one. They don't know about roadworks, landslides or a market-day jam. Agency itineraries are often worse: they cram in places to look good on paper. This skill gives the group one answer per day: **can we really do this before dark, and if not, what changes?**

**The numbers are for you; the answer is for the group.** Work with speeds, road types and field names, but the group reads a short table and plain reasons, then one question. Never show them a speed, a field name or a code (see section 10). Write it the way plan-day writes *Why this plan*.

Four rules that do not bend:
- **Estimates are marked as estimates.** Every checked time says what it was checked against and on what date. Nothing here has been driven. "No closures found" is not the same as "the road is clear": say what you searched.
- **The rules are guidelines, and the group may bend them.** A bend that is already written under *Choices that bend the rules* in a Day note is an agreed choice, not a new problem. Still report it if the checked times make it worse than what was agreed.
- **Never rewrite a day on your own.** Propose fixes in order, ask which to apply, then hand the chosen one to plan-day.
- **Never invent a number.** If you could not get a map time or a local report, leave it out and say so.

The vault root is the current working directory.
**Pipeline:** read the trip → pick what to check → three estimates per leg → sun times and bends → run the script → verdict → fixes and one question → write → validate → report.

## 1. Read the trip
- Read `trip.md`: `group_vehicle`, `bases`, `evening_bases`, `day_start`, the fallback `daylight_hrs` and `sunset`, and the optional `road_speeds` and `stop_buffer`. Read **Trip facts** in `00 Home.md` and `Memories/MEMORY.md`. Read `Logistics/Transport.md` if it exists (the vehicle, and the daily limits).
- Print the settings in force:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/scripts/travel.mjs" config
  ```
  It prints the vehicle class, the speeds for that class and the stops buffer. The defaults are below; `road_speeds` and `stop_buffer` in `trip.md` change them (any road type or setting left out keeps its default).
  | Road type (name in the script) | Car, km/h | Group vehicle, km/h |
  |---|---|---|
  | Motorway or 4-lane (`motorway`) | 70 | 55 |
  | Highway, 2-lane (`highway`) | 50 | 40 |
  | Rural road (`rural`) | 35 | 28 |
  | Hill or mountain road (`hill`) | 30 | 22 |
  | City traffic (`city`) | 20 | 15 |
  | Rough track (`track`) | 15 | 10 |

  **Stops buffer:** 10 minutes for each hour of driving, plus 15 minutes for each stop, to get a group in and out (`stop_buffer: {min_per_hour: 10, min_per_stop: 15}`).
- **Vehicle class** comes from `group_vehicle`: it is `group` when the text names a van, minibus, bus, coach or tempo traveller, or a vehicle with 6 or more seats, and `car` otherwise (also when `group_vehicle` is empty, which `config` says). The script prints which one it chose and why. If it chose wrongly, or an agency's quote names a different vehicle, pass `--vehicle car` or `--vehicle group` and say so in the report. Tell the user in one line when you had to assume the vehicle.
- Read `Templates/Day Plan.md`. **The template is the schema.** If it has no `travel_verdict` property, the vault is older than 0.7.0: tell the user, and ask before you add `travel_checked` and `travel_verdict` (after `rule_bends`), their FIELD GUIDE lines and the `travel_verdict` column of `Bases/Itinerary.base`, copying them exactly from `${CLAUDE_PLUGIN_ROOT}/vault-template/`. Add the two types to `.obsidian/types.json` the same way. Do not check Day notes until the template has them.
- Everything you create stays inside the vault. Scratch files (the script's input) go in `.claude/scratch/` and get deleted at the end.

## 2. Pick what to check
- **Day notes:** "check Day 3", "check the days", or no day named (all the Day notes, in order). Read each one: the Legs table, the Schedule, *Choices that bend the rules*, the properties. If there are no Day notes, ask whether to check an itinerary in a Source note instead.
- **A Source note:** "is this agency plan realistic?" Find the Source note in `Sources/` (ask which if there are several itineraries). Its **Day by day (as given)** is the input. If the itinerary is still only pasted text, run `add-source` first. Nothing is written to Day notes in this case.
- Leave out days with no driving (a rest day, a day on foot) and say so.

## 3. Three estimates for each leg
A leg is one drive: from a stay or place to the next. For each, get three estimates, in hours. Keep what you found out, with its source, for the basis line.

1. **Map time.** Web search for the route's distance and drive time between the two points (a routing site or a maps result). Take the distance (km) from there too. Use the time for a car; the road-type estimate covers the group vehicle. If a source gives a range, keep both ends. If you cannot reach any, leave it out and say "no map time" in the report. Never write a map time you did not find.
2. **Road-type time.** Split the leg into stretches by kind of road and give each its km: `motorway`, `highway`, `rural`, `hill`, `city`, `track`. A leg that is half motorway and half hill road has two stretches (`segments`). Use the Road notes, the place notes' `last_mile` and `road_condition`, and what the map search showed (a motorway, a ghat road). When unsure between two types, take the slower and say so. The script divides km by the speed for the vehicle class.
3. **Local reports.** Search for recent news and traveller reports about the road and the places, for the trip's dates: roadworks, landslides, a closed bridge, a one-lane stretch, a market-day or festival jam, a ferry that runs once a day. Use the last year or so, and say how recent. If a report gives a time ("takes 3 hrs now"), that is the third estimate. If a road is **closed**, put the reason in `blocked`. If you find nothing, say "nothing found in recent reports", not "clear".

**The script keeps the slowest of the three**, because a plan that works with the slowest credible time works on a bad day too. You may keep a different one only when the slowest is not credible: a map time for a different route, or a road type you classified too harshly. Then set `keep` to `road`, `map` or `reports`, and write the reason in `keep_reason`. Never keep a faster estimate just to make the day fit.

## 4. Sun times, the legs after dark and agreed bends
- **Day notes:** use the note's `sunrise`, `sunset` and `daylight_hrs`. If they are blank, work them out as plan-day does:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/plan-day/scripts/sun.mjs" times --date 2027-06-09 --lat 37.10 --lng -8.67 --tz Europe/Lisbon
  ```
- **A Source itinerary:** the dates may not be known. With a date, work the sun times out the same way for the day's base. Without one, use `sun.mjs times --date <any date in the season>` with no coordinates: it falls back to the trip's `daylight_hrs` and `sunset`, and says so. Say in the report that these are the trip's rough season defaults.
- **After dark:** each leg is `avoid` (unlit, forest, hill or bad surface) or `ok` (lit highway, city streets), as in the Legs table's *After dark* column. For a Source itinerary, judge it from the road type and the places' `after_dark` fields.
- **Start time:** when the first drive begins: the Schedule's first departure (or `early_start`) in a Day note; `day_start` from `trip.md` for a Source itinerary, unless the source says otherwise.
- **Time at the places:** `stay_hrs` on a leg is the hours spent where that leg ends before the next one starts (the place's `time_needed_hrs` plus any meal there). Take them from the Schedule. For a Source itinerary use `time_needed_hrs` from the place notes where they exist, or 1 hour a stop, and say you did.
- **Agreed bends:** read *Choices that bend the rules*. For each `avoid` leg a bend covers, set `"bent": true`, and `"agreed_dark_min"` to the minutes of dark driving the bend states (45 minutes, "about an hour"). If it states none, leave `agreed_dark_min` out. A bent leg is not counted as a problem, except for time beyond what was agreed.
- **Evenings:** set `"evening_base_end": false` when the day ends at a base that is not in `evening_bases`, otherwise `true` (leave it out if unknown).
- **Extra stops:** a lunch stop or photo stop in the middle of a leg is `"extra_stops": 1` on that leg.

## 5. Run the script
Write one JSON file per day in `.claude/scratch/`, then run it from the vault root. A complete input is in `${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/references/checked-example-input.json`; the fields are:
```json
{ "date": "2027-06-10", "start": "08:30", "sunrise": "06:14", "sunset": "20:54", "daylight_hrs": 14.7,
  "activity_hrs": 4.5, "predawn_hrs": 0, "evening_base_end": true,
  "legs": [ { "from": "Lagos", "to": "Mountain Fort", "after_dark": "avoid", "stay_hrs": 2,
              "segments": [ { "km": 15, "road": "rural" }, { "km": 30, "road": "hill" } ],
              "map_hrs": 1.2, "reports_hrs": null, "extra_stops": 0,
              "bent": false, "agreed_dark_min": null, "blocked": null, "keep": null, "keep_reason": null } ] }
```
`activity_hrs` and `predawn_hrs` are the Day note's own values. A leg with one road type can use `"km"` and `"road"` instead of `segments`. An estimate is a number of hours or `[low, high]`.
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/scripts/travel.mjs" check --input .claude/scratch/day-03.json
```
The output has, for each leg: the road-type time, the map time, the estimate kept and why, the checked range as text for the Legs table, how many minutes it is slower than the map, when the leg starts and ends, and minutes driven in the dark on an `avoid` leg. For the day it has: the drive hours (driving plus stops), the slack and its verdict (the same rule as the Itinerary base and plan-day), when the day ends, and `leave_earlier` (how much earlier to start so that no unagreed `avoid` leg is driven in the dark, if that is possible). If a flag looks wrong, fix the input and run again; never edit the output by hand.

## 6. The verdict
The day's verdict is the **worst** of these:
| Check | Result |
|---|---|
| Slack, from the drive hours (with stops), the activity hours and the daylight. Same thresholds as plan-day: 1.5 hrs or more is ok, 0 to under 1.5 is tight, below 0 is too much | ok / tight / too much |
| An `avoid` leg driven after sunset (or before sunrise) beyond what the group agreed to: up to 30 minutes is tight, more is too much | tight / too much |
| The day ends more than an hour after sunset at a base that is not in `evening_bases` | tight |
| A road that is closed | too much |

So the travel verdict is never kinder than plan-day's slack verdict for the same day: it uses the same slack rule on the checked drive hours, and adds the after-dark checks that slack cannot see (slack only counts hours, not when they fall). Bends that were agreed and are no longer worse do not change the verdict, but are named in the report.

## 7. Fixes: propose, never apply
For a **tight** or **too much** day, offer fixes **in this order**, and say what each saves. Test each one by changing the input and running the script again; offer only those that move the verdict at least one step better (the output's `leave_earlier` gives the first one's size).
1. **Leave earlier.** By how much, and the new start time. Only if the start is not already before sunrise, and the group agrees to early starts (plan-day does not plan two days of them running).
2. **Drop or move a `maybe` place** (or a `should` place that is furthest off the road). Never offer to drop a `must` place first, and never drop one quietly.
3. **Swap the order** to take an `avoid` road out of the dark.
4. **Split the day:** move places to a neighbouring day that has room.
5. **Change where the night is spent** (a base closer to tomorrow's places). If that means a change to the Route, suggest it and leave `Itinerary/Route.md` alone.

If a road is closed, the first fix is the detour: research its distance and time and run the script on it.

Do not write the chosen fix yourself. Ask (section 10), and when the user answers, invoke the **plan-day** skill for that day with the choice ("Plan Day 3 again, leaving at 7:00 instead of 8:30"). plan-day rewrites the day and clears the two travel properties. **Then run this skill again on that day**, so the new plan gets a new check and the properties are set again.

## 8. What to write
**Day notes, in place.** Keep what the user wrote by hand. Change only these:
- **Legs table:** the *Drive time (estimate)* cell becomes the checked range (`range.text`). When the kept time is 15 minutes or more over the map's, add "Slower than the map shows" to that leg's Road notes. Leave the other columns alone.
- **The line under the table** becomes: `*Drive times are estimates, checked on <d Mon yyyy> against a map search, a typical speed for each kind of road and local reports; not driven. Basis: <one sentence per leg: map time, road stretches with the speed used, what the reports said or "nothing found">. Stops add <buffer> hrs (<min_per_hour> min for each hour of driving and <min_per_stop> min for each of the <n> stops) and are included in the day's drive hours.*` Say which estimate was kept and why when it is not the slowest. Say plainly when a map time or a report could not be found. The speeds belong here, not in the chat. See the example.
- **Properties:** `drive_hrs` = the script's `drive_hrs` (the upper end of each range plus the stops), `travel_checked` = today's date, `travel_verdict` = the day's verdict. If the day has an `early_start`, also update `predawn_hrs` from the script's `predawn_drive_hrs` plus any time at places before sunrise.
- **Daylight and slack line:** rewrite the numbers with the new drive hours, as plan-day writes it: `Drive 4.8 (3.7 of driving and 1.1 for stops) + activity 4.5 = 9.3 hrs in daylight. Slack 5.4 hrs: **ok**.` The slack verdict here is plan-day's.
- **Notes:** one bullet, replacing any earlier one: `**Travel-time check, <d Mon yyyy>: <verdict>.**` and one or two plain sentences, with no speeds: what was slower than the map shows, whether the day ends before dark, and for a tight or too-much day the open choice ("Waiting for the group: leave at 7:00, or drop the boat ride").
- **Do not touch** the Schedule, *Why this plan*, *Choices that bend the rules* or `rule_bends`: they are plan-day's, and the group's. If the checked drive times are 15 minutes or more longer than the Schedule's, the Schedule is out of date: say so in the Notes bullet and in the report, and offer to have plan-day re-time it. Do not re-time it yourself.
- **Home:** for a tight or too-much day with no fix chosen yet, add a line under *Open questions for the group* in `00 Home.md`: `- [ ] Day 3 is too much on the checked drive times: leave at 7:00, or drop the boat ride? (see [[Day 03]])`. When a fix is applied and the new check is ok, remove the line.

**A Source itinerary.** Add a `## Travel-time check` section to the Source note, just before *Original text / attachment* (replace it if it exists). One line per day: `- **Day 3** (Shillong → Dawki → Shillong): too much. <the main reason in plain words>. Fix: <the first fix that works>.` Under the list, one italic line: what it was checked against and the date, the vehicle assumed and that these are estimates, not driven. Add no speeds. Change nothing else in the note, and do not set `processed`. Make no Day notes.

## 9. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
It checks the Day notes against the template, and warns when `travel_verdict` is better than the slack verdict (the check is out of date, or was written wrong) or when `travel_verdict` and `travel_checked` do not go together. Fix every error in the notes you wrote. Report problems in older notes; don't silently rewrite them. Delete `.claude/scratch/`.

## 10. Report to the user
Plain words, short. No speeds, field names or codes.
- One or two lines first: how many days work, and what is the main problem on the others.
- Then one table:

  | Day | Route | Verdict | Why |
  |---|---|---|---|
  | 3 | Shillong → Dawki → Shillong | too much | 5½ hrs of hill road, back 1 hr after dark |
  | 4 | Shillong → Sohra | ok | 2 hrs of driving, done by 15:30 |

  The *Why* is the main reason in plain words: how long the driving really is, the kind of road, when the day ends against sunset, a road closure. For a bend the group already agreed, say so ("the sunrise drive in the dark, as agreed, is now 20 minutes longer").
- Then **one question** about which fix to apply, for the tight and too-much days, one line per day with at most two choices each, first fix first: "Day 3: leave at 7:00 instead of 8:30, or drop the boat ride. Which one?" If no day needs a fix, ask nothing.
- Last, one line on how far to trust it: these are estimates from map times, typical speeds and recent local reports, checked on <date>; nobody has driven them. Name what you could not find (a leg with no map time, a road with no reports) and any assumption (the vehicle, a Schedule that now needs re-timing).

A finished Day note after a check is in `${CLAUDE_PLUGIN_ROOT}/skills/review-travel-times/references/checked-example.md` (made up, Portugal). It shows a leg that is much slower than the map says, and the basis line. Match its shape.
