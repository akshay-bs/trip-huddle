# Working on trip-huddle

trip-huddle is a Claude plugin (Cowork and Claude Code) plus an Obsidian vault layout for planning group trips. See `README.md` for what it does and `docs/ROADMAP.md` for what's next.

## Layout
- `.claude-plugin/plugin.json` and `marketplace.json`: keep the version numbers in sync.
- `scripts/`: shared Node scripts (`validate.mjs`, the checker; `test.mjs`). `skills/add-place/scripts/validate.mjs` is only a wrapper that runs the shared one.
- `skills/<name>/SKILL.md`: plugin skills. Refer to bundled files as `${CLAUDE_PLUGIN_ROOT}/skills/<name>/...`. Skills run with the user's vault as the working directory.
- `vault-template/`: the empty starter vault.
- `example-vault/`: a filled example used to test the skills and validator.
- `vault-template/Templates`, `vault-template/Bases` and `vault-template/.obsidian/*.json` are copied into `example-vault/`. Change them in both places, together.

## Checks
After any change to templates, Bases, `types.json`, `trip-init`, its field packs or the checker, run:
```bash
node scripts/test.mjs
```
It must end with "All tests passed". It checks that the example vault has 0 errors, that `trip-init --reconfigure` leaves the example vault unchanged ("Nothing changed"), that a new vault made from the Portugal answers passes the checker and gets `Route.md` and `Transport.md`, that the `plan-day` sun script (`skills/plan-day/scripts/sun.mjs`) gives known sunrise and sunset times and the same slack verdicts as the Itinerary base, that the made-up Day note in `skills/plan-day/references/` passes the checker, and that a deliberately broken copy of the example has every problem reported. It works on temporary copies and leaves the repo alone.

The shared checker is `scripts/validate.mjs` (it reads the vault's own `Templates/`, so a template change changes what is checked). Run it by hand with `cd example-vault && node ../scripts/validate.mjs`.

## Privacy rules for this repo
- The example came from a real trip and its private details were removed. Never add trip dates, group size or makeup, people's names, booking references, flight details, quotes from friends or agencies, or private messages.
- Example notes point to `[[Example - Public research]]` only.
- Photos: link to openly licensed images (Wikimedia Commons) with a credit line. Never commit image files, and never link copyrighted hotel photos in the example.
