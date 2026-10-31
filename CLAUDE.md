# Working on trip-huddle

trip-huddle is a Claude plugin (Cowork and Claude Code) plus an Obsidian vault layout for planning group trips. See `README.md` for what it does and `docs/ROADMAP.md` for what's next.

## Layout
- `.claude-plugin/plugin.json` and `marketplace.json`: keep the version numbers in sync.
- `skills/<name>/SKILL.md`: plugin skills. Refer to bundled files as `${CLAUDE_PLUGIN_ROOT}/skills/<name>/...`. Skills run with the user's vault as the working directory.
- `vault-template/`: the empty starter vault.
- `example-vault/`: a filled example used to test the skills and validator.
- `vault-template/Templates`, `vault-template/Bases` and `vault-template/.obsidian/*.json` are copied into `example-vault/`. Change them in both places, together.

## Checks
Run the validator against the example vault after any change to templates, Bases, `types.json` or the validator:
```bash
cd example-vault && node ../skills/add-place/scripts/validate.mjs
```
It must report 0 errors.

## Privacy rules for this repo
- The example came from a real trip and its private details were removed. Never add trip dates, group size or makeup, people's names, booking references, flight details, quotes from friends or agencies, or private messages.
- Example notes point to `[[Example - Public research]]` only.
- Photos: link to openly licensed images (Wikimedia Commons) with a credit line. Never commit image files, and never link copyrighted hotel photos in the example.
