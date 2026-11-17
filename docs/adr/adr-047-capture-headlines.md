---
status: Accepted
---

# ADR 047: Capture headlines

## Context

Timestamped `capture` filenames do not help distinguish fleeting notes. A short headline should identify a capture without requiring permanent-note metadata.

## Decision

Add resource-scoped `stemlink.promptForCaptureHeadline`, enabled by default, under Capture settings. Read it from the selected vault, not the active editor.

For Add Fleeting Note, use VS Code's native input box to request a nonblank headline. Cancellation creates nothing. Preserve the full trimmed headline as a Markdown heading before the saved template body, after any YAML front matter. Preserve template content and line endings; reject unclosed front matter rather than hide it.

Build filenames from the existing local timestamp and slug rules, limiting the headline slug to 48 characters without trailing hyphens. Reuse existing numeric collision suffixes. Read the same template and legacy fallback as before. Require Workspace Trust before prompting or creating a capture.

Disabling the setting retains the template-only body and timestamped `capture` filename. Do not change Add Note, promotion, existing filenames, or capture metadata requirements.

## Consequences

New captures are easier to distinguish and their router titles begin with the supplied headline. The default adds a prompt and a heading; users who prefer immediate capture can disable it. No migration is required, existing captures remain unchanged, and non-ASCII headlines retain their full text even when the existing ASCII slug rules produce a fallback filename.
