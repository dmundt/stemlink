# Storage contract

Notes are ordinary Markdown files. The [vault manual template](../templates/README.md) describes authoring and the [README](../README.md#extension-settings) lists settings and defaults.

## Layout and discovery

- Default layout: `notes/` contains `inbox/`, `permanent/`, and `templates/`. Resource-scoped settings can change these names.
- A vault marker is `.stemlink.json` at a workspace root or an immediate child. Version 1 stores `inbox` and `notes` folder names and optionally `templates`; an absent `templates` field defaults to `templates`.
- Configured folder names are single path segments. Inbox, permanent notes, and explicitly mapped templates must be distinct ignoring case. Marker and explicit settings conflicts use a remembered choice; choosing settings does not rewrite the marker or move files.
- Creation makes directories, a personalized `README.md`, editable examples, and a marker. It preserves existing files. Opening an unmarked folder asks before adding a marker and uses existing capture and note folders.

## Notes and captures

- Generated permanent filenames use a local `YYYYMMDDHHmm` timestamp and slug. Collision suffixes avoid replacing an existing file. Filename stems are used for wiki links; renames can break references.
- Generated note front matter has a title and an inline YAML tag sequence. Promotion replaces title and tags while retaining other valid YAML fields and the capture body.
- Promotion saves a dirty capture before reading it, creates the note without overwriting an existing file, and checks for capture changes before deletion. If removal fails, it reports the created note and retains the capture where possible.
- Add Fleeting Note reads `_fleeting.md` from the mapped templates folder, with a legacy fallback in the notes folder. A missing or unreadable template is reported rather than silently creating a capture.

## Generated files

- Optional `INDEX.md` files route readers and contain observed Markdown counts. Stemlink updates only its marked generated section; files without that section are preserved. User content outside the section is retained, including in dirty editors.
- Optional `AGENTS.md` files are offered on Create/Open and installed only after consent. Existing files are preserved.
- `INDEX.md` and `AGENTS.md` are excluded from note targets and router counts. Underscore-prefixed files are excluded from manual audits.
- `stemlink.enableRouterIndexes` and `stemlink.offerAgentInstructions` control those features. Disabling them does not delete existing files.

The in-memory note/reference index represents live state, including open documents; it is not persisted. Router counts are not authoritative. Existing vaults and settings are not automatically migrated when defaults change.
