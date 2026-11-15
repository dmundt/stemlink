---
status: Accepted
---

# ADR 024: Opt-in vault agent instructions

## Context

AI agents benefit from concise, scope-specific rules for the vault, unprocessed captures, and permanent notes. Existing `AGENTS.md` files may contain user-owned guidance and must not be replaced.

## Decision

During Create Zettelkasten and Open Vault, ask whether to add minimal `AGENTS.md` files at the vault root, in the configured inbox, and in the configured notes folder. Ask only when at least one target file is missing. Create only missing files; preserve existing instructions. Do not create missing configured folders. Require Workspace Trust for writes.

The root instructions cover plain Markdown, stable timestamped note filenames, links, and the authority of Stemlink's in-memory note/reference index over `INDEX.md` routers. Generated instructions include the chosen root, capture, and permanent-note folder names. Inbox instructions treat captures as unprocessed and prohibit promotion or rewriting without a request. Notes instructions cover stable filenames, flat storage, links, and templates.

Treat `AGENTS.md` and `INDEX.md` as instruction/navigation files rather than notes or captures. Exclude both from note targets, completion, backlinks, audits, capture listings, and Markdown counts.

## Consequences

Vault creation and opening may prompt once per action when selected instruction files are missing. Declining leaves them absent. Existing vault files and custom instructions remain unchanged. The feature adds no command or runtime dependency.
