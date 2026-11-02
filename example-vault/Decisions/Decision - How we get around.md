---
type: decision
question: How do we get around for the whole trip?
options:
  - Self-drive
  - Hired van with a driver
status: locked
decided_option: Hired van with a driver
decision_reason: One vehicle for the whole group, and the driver knows the hill roads
decided_on:
locks:
  - vehicle
locked_by: van booked
affects: []
deadline:
tags:
  - decision
---
<!--
FIELD GUIDE
Name the note "Decision - <short topic>", for example "Decision - Stay in Sohra". It lives in Decisions/ (a folders: {decision: ...} line in trip.md can change it). One note per real choice the group has to make, not one per place.
question: the question, in the group's own words
options: the choices, one per line: plain text, or a "[[Stay or Place note]]" or "[[Route note]]"
status: open | decided | locked
decided_option: the option the group chose, one of options. Only when status is decided or locked
decision_reason: why, in a few words
decided_on: date (YYYY-MM-DD) the group chose
locks: dates | arrival | departure | route | stay | place | vehicle | activity | budget
locked_by: what made it fixed, in words: "flights booked", "van booked". Required when status is locked. No booking references, flight numbers or prices: link to the Logistics or Stay note instead
affects: links to the notes this decision touches, one per line: "[[Stay]]", "[[Place]]", "[[Route]]", "[[Day 03]]"
deadline: date (YYYY-MM-DD) by which the group has to decide, only if a source or the group gave one
decided means the group chose but may still change its mind. locked means it is fixed: nothing changes it unless the group unlocks it, and the reason goes in History
Write the note for the group, in plain words. Claude records what the group says; it never chooses
-->

# Decision - How we get around

Made up for this example. Once the vehicle is booked, every drive time is judged for it, and nobody plans a self-drive day.

## Options
- Self-drive
- Hired van with a driver

## History
- Locked because the van was booked. To change it, the group has to unlock it first, and the reason is written here.
