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

## 1. Choose

*Where we go, where we sleep, how we get there, and when.*

| What goes wrong | What trip-huddle does |
|---|---|
| **The buried link.** Priya's link from three weeks ago is under 300 messages and a good-morning sticker. | Paste any message, quote or link. Every place, stay and café gets its own note with the name of whoever suggested it, and duplicates are caught even when they're spelled differently. |
| **The "easy walk".** The "easy walk" to the root bridge is 3,000 steps down. And 3,000 back up. With grandparents. | Each place notes how hard the walk is and whether it suits your group. |
| **Wrong season.** The waterfall everyone voted for is a trickle in December. | Each place is checked for the season you travel in. |

## 2. Agree the route

*Turn the choices into one plan the group signs off on, before anyone books.*

| What goes wrong | What trip-huddle does |
|---|---|
| **4:38 pm.** The map says two hours. With hairpin bends, fog and photo stops it's closer to four. In December the sun sets at 4:38 pm in Sohra. | Every drive is checked three ways (a map, the kind of road, recent local reports) against that date's real sunset. Each day comes back ok, tight or too much, with fixes to choose from. |
| **Eleven days of must-sees.** Every family has a must-see. Together they need eleven days. You have seven. | Agency quotes and your own draft are compared side by side: which must-sees each covers, nights, hours in the car, driving after dark, cost per family. A plain recommendation, and no scores. |
| **Booked before agreed.** Someone books a hotel before the route is agreed. Now the whole route bends around it. | *Coming next:* a warning before anyone books ahead of the agreed route. |
| **The zig-zag.** The plan goes Shillong, Dawki, Sohra, then back to Dawki. Nobody looked at a map. | *Coming next:* a first route built from what the group chose, with the places in a sensible order. |

## 3. Book

*One list, and one name on every task.*

| What goes wrong | What trip-huddle does |
|---|---|
| **Did anyone pay the hotel?** Two people each think the other one paid. | One booking list, made from what the group chose: what's booked, what's paid, what's still owed, and where the voucher is. Once something is booked it's locked, and nothing gets planned against it. |
| **"Someone should book the van."** Everyone agrees someone should book the van. Nobody is someone. | *Coming next:* a person named on every task. |
| **Sold out at the gate.** Nobody pre-booked the boat ride. It's sold out the morning you arrive. | Places that need tickets land on the booking list by themselves. |

## 4. Travel

*When the plan meets the road.*

| What goes wrong | What trip-huddle does |
|---|---|
| **"What time are we leaving?"** Asked twenty times before breakfast. | *Coming next:* a plan for today, with leave times. |
| **Two hours behind.** Which stop do you drop? | *Coming next:* a quick re-plan of the rest of the trip that keeps the must-sees and everything already booked. |
| **"I'll get this one."** Six people each said it over three days. | *Coming next:* an expense log as you go. |

## 5. Come home

*Settle up, and remember.*

| What goes wrong | What trip-huddle does |
|---|---|
| **Gentle reminder.** Three months later: "gentle reminder re: van money 🙏". | *Coming next:* a settle-up per family that closes the books. |
| **"Did the fuel count?"** "I paid for fuel on day four. Did that count?" Nobody knows. | *Coming next:* who paid what, kept as you go. |
| **"Can you send your itinerary?"** A friend asks for your itinerary. You forward forty messages. | The vault already is the itinerary. Share the folder. |

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
