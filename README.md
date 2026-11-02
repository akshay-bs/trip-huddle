# trip-huddle
Tired of losing great trip ideas in a 200-message group chat? Trip-Huddle turns Claude into your group’s travel assistant — it collects every link, suggestion, and stay, tracks who recommended what, and gives everyone one clean view of what’s decided and what’s still up for debate.

> **Status: v0.1 seed.** This is the setup from one real group trip (Assam and Meghalaya, December), with the private details removed. Some trip-specific parts still need generalizing. See [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works
Trip-Huddle is a Claude plugin (for Cowork and Claude Code) plus an Obsidian vault layout:

1. **Every suggestion has a source.** A friend's message, an agency quote or a hotel list becomes a note in `Sources/`. Every place, stay, restaurant and cafe links back to the sources that recommended it (`recommended_by`).
2. **No duplicates.** Before adding anything, Claude searches names and aliases, so "laboon falls" finds the existing *Labon Falls* note and just adds the new source to it.
3. **The template is the schema.** `Templates/Location.md`, `Templates/Stay.md` and `Templates/Food Spot.md` define every property, its order and its allowed values (the FIELD GUIDE comment). A validator checks every note against them.
4. **Honest research.** Coordinates are checked against OpenStreetMap or Wikipedia, and each note gets a seasonal verdict, walk difficulty, group fit and openly licensed photos.
5. **The group decides.** New items go in as `considering` and are listed under "Open questions" on the home page. Obsidian Bases views show what's pending, the booking list with cost per family, and a map.
6. **From choices to a trip.** Claude builds two or three route options from what the group selected, tries the order the agencies use and its reverse, and says what each makes possible and where it breaks (a road nobody drives after 4 pm, the same road twice). Once the group picks one, every day is planned and the whole trip fits on one page, with a brief to get quotes.
7. **Book from what was chosen.** Once the group selects a stay, a vehicle or a place that needs tickets, it shows on the booking list by itself. The status, the amounts and a link to the voucher sit on its own note, and booking it locks the decision.

## What's in the repo
| Path | What it is |
|---|---|
| `.claude-plugin/` | Plugin manifest, plus a marketplace file so this repo can be added as a marketplace |
| `skills/add-source/` | The skill that takes in a pasted itinerary, quote, hotel list, link or friend's suggestions: it writes the Source note, lists what is new and what is already in the vault, hands the items (places, stays, restaurants and cafes) to `add-place`, and keeps the Home inbox up to date |
| `skills/plan-day/` | The skill that builds Day notes: legs with drive-time ranges, a schedule, meals, a backup plan, real sunrise and sunset for the date (`scripts/sun.mjs`, no dependencies), and the slack between daylight and the day's driving and activities, with an ok / tight / too much verdict. It plans around each place's `after_dark` and `best_time_of_day`, each leg's After dark column and the trip's `evening_bases`, and writes down any rule the group chose to bend. It prefers the group's selected restaurants and cafes near each day's route for meals (otherwise it only suggests some), and sets `scheduled_day` on the places and food spots it uses |
| `skills/review-travel-times/` | The skill that checks drive times and answers "can we really do this before dark?" for each day, on Day notes or on an agency's or friend's itinerary in a Source note. Each leg gets three estimates (a map time, a typical speed for the kind of road, recent local reports), the slowest credible one is kept, time is added for stops, and the day gets an ok / tight / too much verdict that is never kinder than the slack verdict. `scripts/travel.mjs` (Node, no dependencies) does the arithmetic, reading optional `road_speeds` and `stop_buffer` from `trip.md`. The limits it and `plan-day` judge by (`planning_limits` in `trip.md`: hours of slack for an "ok" day, minutes of dark driving, late finish, driving hours a day) are defaults the group changes as it plans. It never rewrites a day: it offers fixes, asks, and hands the choice to `plan-day` |
| `skills/compare-itineraries/` | The skill that compares two or more itineraries (agency quotes, a friend's plan, the group's own draft) and writes a short Comparison note in `Sources/`: a side-by-side table (nights, must-see places covered, driving, after-dark driving, stays, cost per cost-sharing unit, what the option doesn't say), a bottom line with reasons, the trade-offs, and the questions to ask before deciding. It reuses the travel-time check and the sun times for the driving, and never scores or weights the options. When the group decides it marks the chosen Route note `agreed` (or makes one from the chosen Source) and offers `plan-day`; it never changes a place decision or rewrites a day |
| `skills/build-itinerary/` | The skill that turns the group's choices into two or three route options (`Itinerary/Route - Option A.md`, …), always trying the standard order, its reverse, a base change and a "big day" version, each with a day-by-day table and what it makes possible, its red flags and what it costs, and hands them to `compare-itineraries`. Once the group chooses, it has `plan-day` plan every day, then writes a one-page *Trip itinerary* and an *Operator brief* to get quotes from tour operators or vehicle rentals (no reasons, budget, food choices, names or booking references). `scripts/route.mjs` (Node, no dependencies) keeps the shared distance file `Logistics/legs.json` (road facts only: rough straight-line links for every pair, researched ones where a day could use them), lists the places that fit a day between two bases from the trip's own limits, and checks a route for driving, road cutoffs (`road_cutoffs` in `trip.md`), after-dark driving and doubling back |
| `skills/group-decisions/` | The skill that keeps track of what the group still has to decide and what it has fixed. It gathers the open questions from the vault, writes Decision notes in `Decisions/` (open, decided or locked), refreshes the home page's open questions and budget snapshot (per cost-sharing unit), and summarises by deadline. A **locked** decision ("flights booked", "van booked") is a hard rule: `plan-day`, `review-travel-times`, `compare-itineraries`, `add-place` and `add-source` read it first, never plan against it, and ask before anything breaks it. `trip.md` has a `stage` (planning, booking, travelling, after). It also keeps the **booking list** (`Bases/Bookings.base`): every selected stay, the selected vehicle and selected places with `needs_booking`, plus small notes in `Bookings/` for flights, trains, permits and insurance. Each has `booking_status`, `cost_agreed`, `advance_paid`, `balance_pending` and a `confirmation` link to a voucher in `Confirmations/`. Booking something locks its decision; a booking that falls through sends the group back to pick again. `scripts/migrate-bookings.mjs` adds the new fields to an older vault's notes. It never decides for the group and asks before unlocking |
| `skills/add-place/` | The skill that adds places, stays, restaurants and cafes: the pipeline and a subagent prompt for researching many items in parallel, including when to go and whether the place works after dark. `scripts/migrate-after-dark.mjs` brings an older vault's places up to the 0.6.0 fields |
| `skills/trip-init/` | The skill that sets up a vault for your trip: a short interview, then `init.mjs` (Node, no dependencies) writes `trip.md` and fills the templates and Bases. Optional field sets live in `field-packs/`. `--reconfigure --add-food` brings a vault made before 0.9.0 up to the restaurants-and-cafes category, and `--reconfigure --add-bookings` a vault made before 0.11.0 up to the booking list, and `--reconfigure --add-itinerary` a vault made before 0.12.0 up to what `build-itinerary` needs |
| `scripts/` | `validate.mjs`, the checker every skill calls (Node, no dependencies): it reads the vault's own `Templates/` folder, so fields added at setup are checked too. `trip-settings.mjs` is the shared reader for `trip.md` and the planning limits. `test.mjs` runs all the repo's checks |
| `vault-template/` | An empty starter vault: templates, Bases views (Locations, Stays, Food, Itinerary, Decisions, Bookings), Obsidian property types, a home page with a **Trip facts** section, and vault rules for Claude |
| `example-vault/` | A filled example: 60 places, 6 stays and 3 restaurants and cafes in Assam and Meghalaya, researched for a December trip |

## Quick start
1. **Install the plugin.**
   - In Claude Code, add this repo as a marketplace, then install `trip-huddle`:
     ```
     /plugin marketplace add akshay-bs/trip-huddle
     /plugin install trip-huddle@trip-huddle
     ```
   - In Cowork, add the plugin from this GitHub repo.
2. **Create your vault.** Copy `vault-template/` to a new folder and open it in Obsidian (1.9 or later, for Bases).
3. **Fill in Trip facts** in `00 Home.md`: dates, group, pace, vehicle, season.
4. **Open the vault folder in Claude** and paste in your first itinerary or list, for example: *"Add these places from Priya's message to the list: …"*

To try it without your own data, open `example-vault/` in Obsidian, and check it with:
```bash
cd example-vault && node ../scripts/validate.mjs
```
The checker works on the current folder, or on `--vault <folder>`.

## Optional Obsidian plugins
- **Maps** (official, for Bases) or **Map View** (community) to see places and stays on a map. Both read the `location: [lat, lng]` property.

## Content and photos
- The code and the note text are under the MIT licence (see `LICENSE`).
- The photos in the example location notes are **not stored in this repo**. The notes link to Wikimedia Commons images, and each note's *Photo credits* line gives the author and licence (CC BY, CC BY-SA or CC0). Reuse them under those licences.
- Hotel photos are left out of the example stays, because they are copyrighted.
- Prices, opening hours and fees were researched in 2026 and will go out of date. Check them before you rely on them.
