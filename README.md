# trip-huddle

**Every group trip has one person holding it together.\
If you're reading this, it's probably you.**

> *Meghalaya trip 🏔️ · 412 unread*\
> **Rohan:** guys what was that waterfall Priya sent?\
> **Priya:** scroll up 😅\
> **Anita:** is it Laboon or Labon\
> **Rohan:** also is the hotel booked or not??\
> **Anita:** @you

You scroll up. You find three versions of the plan, two agency PDFs, a voice note and a good-morning sticker. You open a new spreadsheet. Again.

**trip-huddle** turns Claude into your group's trip assistant. You paste in the chaos. Claude keeps one tidy notebook (an [Obsidian](https://obsidian.md) vault) that the whole group can open, and it carries the trip from the first idea to the last payment.

![The trip in five stages: Choose, Agree the route, Book, Travel, Come home. The road is solid through the stages trip-huddle covers today and dotted through the ones coming next.](docs/trip-journey.svg)

> **Status:** early, and growing. It was built on one real group trip to Assam and Meghalaya, with the private details removed. The solid road works today; the dotted road is on the [roadmap](docs/ROADMAP.md).

## Where group trips go wrong

Each box holds the questions that sink a trip at that stage. Solid boxes: trip-huddle answers them today. Dotted boxes: coming next.

```text
1. CHOOSE                        2. AGREE THE ROUTE                3. BOOK

┌──────────────────────────┐
│ PLACES                   │──┐
│ · Laboon or Labon Falls? │  │
│   Same place?            │  │
│ · Elephant Falls is a    │  │
│   must-see. Why is it    │  │
│   not on our list?       │  │
│ · Seven Sisters Falls in │  │
│   December? A trickle.   │  │
│ · "Easy walk." 3,000     │  │
│   steps down. And back   │  │
│   up.                    │  │  ┌────────────────────────────┐    ┌────────────────────────────┐
└──────────────────────────┘  │  │ · "It's just two hours."   │    │ · Did we decide this, or   │
                              │  │   Hairpins, fog and photo  │    │   did someone just book    │
┌──────────────────────────┐  │  │   stops: closer to four.   │    │   it?                      │
│ STAYS                    │──┤  │ · Sunset is 4:38 pm. Are   │    │ · Who paid the advance?    │
│ · Three hotel lists.     │  │  │   we still driving at 7?   │    │   What is still owed?      │
│   Which one did we like? │  │  │ · Which day is the         │    │ · Where is the             │
│ · On tomorrow's route,   │  ├─▶│   heaviest?                │───▶│   confirmation number?     │
│   or an hour the wrong   │  │  │ · Eleven days of must-     │    │ · Boat ride at Dawki, jeep │
│   way?                   │  │  │   sees. Seven days of      │    │   safari at Kaziranga:     │
│ · Who suggested it, and  │  │  │   leave.                   │    │   booked ahead, or sold    │
│   why?                   │  │  │ · Agency A, agency B, or   │    │   out at the gate?         │
└──────────────────────────┘  │  │   our own plan?            │    │ · Hotel booked. Is the     │
                              │  └────────────────────────────┘    │   plan still built around  │
┌──────────────────────────┐  │                                    │   it?                      │
│ FOOD                     │──┤                                    └────────────────────────────┘
│ · That café from Priya's │  │                                                   │
│   link. What was it      │  │                 ┌─────────────────────────────────┘
│   called?                │  │                 ▼
│ · On the way, or a       │  │  4. TRAVEL                         5. COME HOME
│   detour at lunch?       │  │  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐    ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
│ · Open in December?      │  │  ┆ · "What time do we leave?" ┆    ┆ · Who owes whom, per       ┆
└──────────────────────────┘  │  ┆ · Two hours late. Which    ┆┄┄┄▶┆   family?                  ┆
                              │  ┆   stop do we drop?         ┆    ┆ · "Gentle reminder re: van ┆
┌──────────────────────────┐  │  ┆ · Who paid for fuel on day ┆    ┆   money."                  ┆
│ CAR OR VAN               │──┘  ┆   four?                    ┆    └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
│ · One big van or two     │     └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
│   cars?                  │
│ · Will it make the hill  │
│   roads?                 │
│ · How many hours a day   │
│   can the driver drive?  │
└──────────────────────────┘
```

**How it answers them**
- **Choose.** Paste any message, quote or link. Every place, stay, café and vehicle gets one note, with who suggested it. "Laboon" finds the existing *Labon Falls*. Each place is checked for your season, how hard the walk is, and whether it suits your group.
- **Agree the route.** Every drive is checked three ways (a map, the kind of road, recent local reports) against that date's real sunset. Each day comes back ok, tight or too much. Agency quotes and your own plan are compared side by side, with no scores.
- **Book.** One booking list, made from what the group chose: what's booked, what's paid, what's owed, and where the voucher is. Places that need tickets land on it by themselves. Once something is booked it's locked, and nothing gets planned against it.

**You'll still argue about the hotel. You'll just argue about it once.**

## How it works

- **A Claude plugin** (for Cowork and Claude Code) with seven skills. You never call them by name; you just talk:

  | You say | Skill |
  |---|---|
  | "Set up a vault for our December trip." | `trip-init` |
  | "Here's what Priya sent." | `add-source`, then `add-place` |
  | "Compare the two agency quotes with our plan." | `compare-itineraries` |
  | "Plan day 3, Shillong to Sohra." | `plan-day` |
  | "Can we really do this before dark?" | `review-travel-times` |
  | "What do we still have to decide?" / "We paid the advance." | `group-decisions` |

- **An Obsidian vault layout.** Places, stays, cafés, days, decisions and bookings are each a note. Obsidian's Bases views show the open questions, the booking list with the cost per family, and a map.
- **Nothing is decided for you.** New ideas go in as *considering*. The group picks. Claude never chooses for you, and never plans against something already booked.

For every skill, script and folder in detail, see [docs/SKILLS.md](docs/SKILLS.md).

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
