---
name: add-source
description: Take in a new source for a trip-huddle Obsidian trip vault, then hand its places, stays and restaurants or cafes to add-place. Use whenever the user pastes, forwards or shares an itinerary, agency quote, hotel list, link, screenshot text or a friend's suggestions, or says "here's what X sent", "X suggested these", "we got a quote", "look at this itinerary". It records the source once, lists what is new and what is already in the vault, and tracks it until every item has a note.
---

# Add a source to the trip vault

A source is anything that suggests places, stays, restaurants or cafes: an itinerary, a quote, a hotel list, a link, or a friend's message. Every place and stay in the vault traces back to a Source note. This skill makes that note, finds out what is new, and passes the new items to `add-place`.

The vault root is the current working directory.
**Pipeline:** read the trip → find an existing Source note → write the Source note → list new and existing items → hand over to `add-place` → tick and close → update Home → validate → report.

## 1. Read the trip
- Read `trip.md` (currency, regions, bases, folders) and **Trip facts** in `00 Home.md`.
- Read the locked decisions in `Decisions/` (the folder may not exist in an older vault). A decision with `status: locked` is a hard rule. A source that goes against one (an itinerary with other dates, a different route or base, another vehicle, a stay in a base whose stay is locked) is still recorded as it was given, but flag it in the report and under *Notes / opinions from the source*, and ask before anything else is done with it. Never change a locked decision.
- Read `Templates/Source Itinerary.md`. **The template is the schema:** use its property list, property order and section names. If the template has changed, follow the template, not this skill.
- Everything you create stays inside the vault. Scratch files go in `.claude/scratch/` and get deleted at the end.

## 2. Is this source already in the vault?
Search `Sources/` before creating anything. It is the same source if it has the same sender or agency and the same link or date (a same-day follow-up counts). Check `source_from`, `source_url` and `received_on` in the frontmatter, and the file names.
- **Already there:** update that note. Add the new text under "Original text / attachment" (keep the old text), add any new items to the checklists, and set `processed: false` again if new items are open. Don't make a second note.
- **Not there:** go to step 3.

## 3. Write the Source note
File: `Sources/<Who> - <Label>.md`, for example `Alex - Additions 2Oct` or `Agency quote - 8N9D`. No `[ ] # ^ | : / \ ?` in the name. Start from the template: keep every property in template order, keep the comment block, and replace `{{title}}` and `{{date}}`.
- **Properties:**
  - `source_from` is the person, website or agency. `source_kind` is one of the values in the template comment (`research` is only for the shortlist that the `shortlist-places` skill writes).
  - `received_on` is the date it arrived (`YYYY-MM-DD`), not the trip date. `source_url` is the link, if there is one.
  - `num_days` is a plain number, if the source is an itinerary. Leave anything unknown blank.
  - `processed: false`.
  - `tags`: keep `source`, and add a short CamelCase tag with no spaces, such as `Alex2Oct` or `AgencyQuote`. `add-place` copies it onto each place.
- **Original text / attachment:** paste the user's text **word for word**. Don't fix spelling or shorten it. It is their vault. For a link, paste the link and a short note of what you could read from it. For a screenshot, paste the text you read from it and say so.
- **Checklists:** one line per place under "Places mentioned", one per stay under "Stays mentioned" and one per restaurant, cafe, street-food spot or bakery under "Restaurants and cafes mentioned" (add that heading if the note comes from an older template), written `- [ ] [[Name]]`. Use the name as the source gives it for now; step 5 settles the final names. Remove the empty `- [ ] [[ ]]` placeholder lines.
- **If it's an itinerary or quote**, record what it says, for the later comparison of options. Use the template's own places for it, and don't invent new properties:
  - **Route summary:** towns in order with nights, for example `Town A (2N) → Town B (3N)`.
  - **Day by day (as given):** one bullet per day, in the source's words, with the stay and the places that day.
  - **Notes / opinions from the source:** bullets for the total price and what it includes and excludes, the price per person or per room, the vehicle, the number of days and nights, and any other stated conditions. Say what the figure covers (for example `Total 84000 for the whole group, car and driver included`). Use plain numbers in the trip currency; if the source uses another currency, say so.
- **Prices stay with their source.** Never copy a price from one agency's or person's note into another's. Compare them only in a comparison note.
- Not an itinerary (a friend's list of ideas)? Leave the route and day sections blank, and put what the friend said about each place in "Notes / opinions from the source".

## 4. List what's new and what already exists
For every place, stay and food spot in the source, search the vault the way `add-place` does:
- note names in `Locations/`, `Stays/` and `Food/`,
- `aliases:` in frontmatter, case-insensitive, on the key word alone (for example "Labon", "Nongriat"),
- nearby spellings ("laboon" is Labon).

Make a short table: item | place, stay or food spot | new, or existing with its note name. If a name could be two places, pick the most likely one and say so. Ask only if the candidates would lead to very different trips. Fix the checklist names in the Source note to the names the notes use (or will use).

Add everything the source mentions, even if it's off-route. The group decides later.

## 5. Hand over to `add-place`
Invoke the `add-place` skill for **all** the items, new and existing. Tell it:
- the source is `[[<the Source note name>]]` with the tag `<SourceTag>`, so it skips its own source step (step 1) and uses this note;
- the list: for each item, whether it is a place, a stay or a food spot (restaurant, cafe, street food, bakery, bar), the name, whether it is new or already exists (with the existing note), and what the source said about it (day, nights, price notes for stays).

`add-place` does the dedupe, research, notes, link back and its own validation. For an existing note it adds this source to `recommended_by` and the tag. Wait for it to finish.

## 6. Tick and close
Open the Source note again.
- Tick `- [x] [[Name]]` only when that note exists **and** lists this source in `recommended_by`. Add "(new)" or "(already on the list from [[Earlier Source]])". (`add-place` may have ticked some already; check each one.)
- Set `processed: true` only when **every** line is ticked. Otherwise leave it `false`, and say in the report what's still open (for example a place that was too vague to identify).
- Add the findings that matter for the group (strenuous, dry in season, off-route, too small) under "Notes / opinions from the source", marked as your observations.

## 7. Update Home
In `00 Home.md`, under "Inbox: itineraries to process":
- While the source is **not processed**, add `- [ ] [[Source note]] (from <who>, <date>): <what's still open>`. If it's already there, update the line.
- When it **is processed**, remove its line. If the section ends up empty, leave one empty `- [ ] ` line, as in the template.

Don't touch the other sections. The "Open questions for the group" lines are `add-place`'s job.

## 8. Validate (required)
From the vault root:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs"
```
Fix every error in the notes you created or edited. A warning that the source is `processed` with unticked lines or missing notes means step 6 is not finished. Report errors in older notes; don't silently rewrite them.

## 9. Report to the user
Keep it short:
- What came in: who from, what kind, and the date.
- How many places, stays and food spots: new, and already in the vault.
- What the source says about route, days, nights and price, in one line, if it's an itinerary or quote.
- What's still open: items not yet noted, questions for the group, and whether the source is in the Home inbox or closed.
- If it conflicts with a locked decision, say which one, in plain words, near the top, and ask whether the group wants to unlock it or set the source aside. Offer the `group-decisions` skill if the source settles or opens a question.
- If the vault now holds two or more itineraries or quotes (this source and another, or a Route note drafted by the group), offer once, in one line, to compare them with the `compare-itineraries` skill.
