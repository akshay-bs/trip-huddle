# Plan: group-decisions skill, locks and trip stages

Status: built (v0.10.0).

## The problem
Early on, everything is open and the group argues about places. Later the group books flights, a car, a stay, a safari, and each booking hardens a decision. After that, "let's move the whole trip a day" or "what about a different hotel in Sohra" is no longer a free idea: it costs money and breaks other bookings. Today nothing in the vault says which choices are still free and which are fixed, so a skill can happily plan a day against a booked hotel.

The vault needs: **one place that lists what the group still has to decide, a way to mark a decision as fixed, and every skill reading those fixed decisions as hard rules.**

## Trip stage
`trip.md` gets `stage: planning | booking | travelling | after` (default `planning`). It is a single word the group changes by telling Claude ("we're booking now"). `trip-init` writes it, and `--reconfigure` keeps the current value when the answers leave it out. The checker warns about any other value. The stage changes what `group-decisions` puts first:

| Stage | What the summary leads with |
|---|---|
| planning | open decisions, undecided comparisons, places still `considering` |
| booking | decisions with a deadline, decided things not yet booked, locks that are still missing |
| travelling | only what blocks the next days, and the locked rules that today's plan must keep |
| after | nothing new to decide; what was never closed |

The stage never locks anything by itself.

## The Decision note
New note type `decision`, from `Templates/Decision.md`, kept in `Decisions/`, named `Decision - <short topic>`.

| Property | Meaning |
|---|---|
| `question` | The question, in the group's words |
| `options` | The choices, one per line (plain text, or a link to a Stay, Location or Route note) |
| `status` | `open` (nobody has chosen), `decided` (the group chose; can still change), `locked` (fixed; cannot change without the group unlocking it) |
| `decided_option` | One of `options`, only when `decided` or `locked` |
| `decision_reason` | Why, in a few words |
| `decided_on` | Date the group chose |
| `locks` | What this decision fixes when it is locked, a list from: `dates`, `arrival`, `departure`, `route`, `stay`, `place`, `vehicle`, `activity`, `budget` |
| `locked_by` | What made it fixed, in words ("flights booked", "van booked"). Required when `locked` |
| `affects` | Links to the notes this decision touches (Stays, Places, Route, Day notes) |
| `deadline` | The date by which the group must decide, if one is known |
| `tags` | includes `decision` |

`Bases/Decisions.base` has three views: **Open** (sorted by deadline), **Decided** and **Locked**. `00 Home.md` shows Open and Locked.

**Locked means locked.** Only the group unlocks a decision, and the reason is written in the note's *History* section. Booking details (flight numbers, references, prices paid) never go in a Decision note; it links to the Logistics or Stay note that holds them.

## Locks are hard rules
- `decided` is respected: a skill says so when a plan or option goes against it and asks.
- `locked` is never planned against. Each skill reads the locked decisions first and, when an option or a change would break one, says which one, says what unlocking would cost, and asks. It does not quietly work around it and does not offer the change as an ordinary fix.

| Skill | What it does with locks |
|---|---|
| `plan-day` | Uses the locked stay for those nights, keeps the locked arrival and departure, plans drives for the locked vehicle, and keeps locked activities |
| `review-travel-times` | A fix that moves a locked stay, day or activity is not offered as a fix; it is listed as "needs unlocking" |
| `compare-itineraries` | An option that breaks a lock gets a row in the table and a question; never recommended without saying so |
| `add-place`, `add-source` | A place, stay or source that conflicts with a lock (a second stay in a base whose stay is locked, an itinerary with other dates) is added as `considering` and flagged in the report |

## The checker
Errors: `status` not one of the three; `decided_option` not one of `options`; `decided_option` set while `open`; `decided` or `locked` with no `decided_option`; `locked` with no `locked_by`.

Warnings (only what can be read reliably): no question; the same option twice; a `locks` value outside the list; `locked` with empty `locks`; `decided` or `locked` with no reason; a locked decision whose chosen Stay or Place note is not `selected`; a locked route decision whose Route note is not `agreed` or `booked`; a dropped note in `affects` of a locked decision; a locked `dates` decision while `dates_fixed` is false in `trip.md`; and a `stage` in `trip.md` that is not one of the four.

## The skill
`group-decisions` gathers what is open (the home page's open questions, Comparison notes still `draft`, stays and places still `considering`, selected stays not yet booked, Sources not processed), creates or updates Decision notes, refreshes *Open questions for the group* and *Budget snapshot* on the home page, and gives a short summary ordered by deadline.

- **One Decision note per real choice**, not per place: 60 places still `considering` are one line in the summary (and the Locations "To decide" view), not 60 notes. A place gets a note only when it has a deadline or a booking attached.
- **It never decides.** It records what the user says. "Flights are booked" locks dates, arrival and departure; "the van is booked" locks the vehicle. It asks before unlocking, and logs the reason.
- **Budget snapshot:** stays (the `est_total` of selected stays), transport (the Transport note's `quote`), and activities (entry fees of selected places), each as a total and per cost-sharing unit from `trip.md`, with what is missing said plainly.
- **Dates:** a deadline comes from a source or the user, never guessed.

## Made easy for the next step: booking tasks
The roadmap's next item is a **booking task list** (flights, a car for the whole trip, jeep or safari, permits, ...). The Decision note is built so a task can attach to it later:
- `locks` is the shared vocabulary: a task closes by locking the decision that has that `locks` value.
- `locked_by` is free text now; a booking task will later put a link to itself there.
- `deadline` has the same name and meaning, so tasks and open decisions can share one by-deadline view.
- The skill's locking step is one procedure ("lock this decision, because X"), so a task that gets closed calls the same step.

## Not in this version
No automatic locking from a Stay's `booking_status` (the user says it, or the skill proposes it and asks). No deadline reminders. No unlock history field: the *History* section holds it as text.

## Old vaults
`trip-init --reconfigure` does not add the Decision template, the base, the folder or the home page sections to a vault made before 0.10.0. The skill asks first, then copies them (and the five types) from `vault-template/`.
