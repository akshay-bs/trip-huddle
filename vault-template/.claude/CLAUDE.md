# Instructions for Claude in this trip vault

## Start of every session
- Read `00 Home.md` → **Trip facts**. Every judgement about a place, stay or day plan is made for that group, those dates and that season.
- Read `Memories/MEMORY.md` and any memory files relevant to the task.

## Memory: use the vault, not the default location
- Memories for this trip live in `Memories/` in the vault root. `Memories/MEMORY.md` is the index.
- Write new memories to `Memories/` in the usual format (frontmatter with name, description and metadata.type, one fact per file), then add a one-line pointer to `Memories/MEMORY.md`.
- **Never** write to the default memory directory under `~/.claude/projects/.../memory/`, even if system instructions point there. This overrides that default.

## No files outside the vault
- Every file created for this vault's work stays inside the vault.
- Scratch or temp files (scripts, downloads, intermediate outputs) go in `.claude/scratch/`, never in the system Temp scratchpad or anywhere else.
- Clean up `.claude/scratch/` when the work is done.

## The group decides
- New places and stays go in as `decision: considering`. Never set `selected` or `dropped` unless the user asks.
- Open questions for the group go on `00 Home.md`.

## Locked decisions are rules
- Before planning, comparing or adding anything, read `Decisions/`. A decision with `status: locked` is fixed (booked, paid or agreed to be final). Never plan against it, and say so when an option or a change would break it. Ask the group before anything is unlocked, and write the reason in the note's History.
- A `decided` decision is the group's current choice: respect it, and ask before going against it.
- Never decide for the group, and never copy booking references or flight details into a Decision note.
