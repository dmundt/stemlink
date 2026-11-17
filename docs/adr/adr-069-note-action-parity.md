---
status: Accepted
---

# ADR 069: Note action parity and cross-view drag transport

## Context

Capture deletion is labeled Discard while permanent-note deletion is labeled Delete. Permanent notes should remain stable reference targets rather than offer a deletion workflow. Alphabetical menu-group sorting also places destructive actions inconsistently. Vault rows expose permanent-note creation but not fleeting-note creation. Drag tests reuse a DataTransfer object, hiding the serialization boundary between Fleeting and Notes.

## Decision

Use **Delete…** and a **Delete** confirmation button for captures. Retain the capture command ID, dirty-document guards, trust checks, native file deletion, and trash preferences. Remove permanent-note deletion from the menu, command contributions, and registered handlers. Permanent-note context menus offer metadata editing only. Do not restrict native VS Code file operations or stop reconciling external deletions.

Offer **New fleeting note**, **New permanent note**, then **Validate vault** on vault rows. Reuse shared explicit-vault creation helpers without changing selection. Keep the new fleeting-note context command hidden from the Command Palette and add no toolbar items or shortcuts.

Use numbered native menu groups so creation precedes validation, promotion precedes metadata editing, and capture deletion appears last. Separate vault creation from validation and capture actions from deletion through group boundaries, not custom separator commands. Do not add a separator around the sole permanent-note metadata action.

Transfer an opaque, random, single-use drag identifier as a string. Resolve it only against the current extension session's in-memory capture selection. Read it with DataTransferItem.asString, reject stale or unrelated payloads, and recheck the active drag after asynchronous decoding. Never deserialize note objects or trust external file paths. Keep source-vault destinations, per-capture confirmation, cancellation, progress, and partial-failure safeguards.

Inspect all entries for the capture MIME type. Native cross-view drops prepend a blank browser entry to the extension-provided entry; DataTransfer.get returns only the first entry. Accept only an entry matching the active drag identifier, never the blank placeholder.

Some VS Code hosts marshal the drop cancellation token as a boolean snapshot without its cancellation event. Honor an already-cancelled snapshot; otherwise use live cancellation when available and retain batch progress cancellation. Always release the batch lock if cancellation setup fails.

Host regressions model the cross-view string serialization boundary and duplicate MIME entries instead of reusing object identity or replacing earlier entries. Test native menu sorting and separator groups, both explicit-vault creation actions, rejected drag payloads, and existing mutation safeguards.

## Consequences

This supersedes ADR 048's Discard wording, ADR 049's permanent-note deletion, ADR 050's exact-object payload requirement, ADR 051's two-action boundary, and corresponding labels in ADR 060. The pre-1.0 command `stemlink.deleteNote` is removed; integrations using it must stop requesting permanent-note deletion. No Markdown, metadata, or setting migration is needed. Other command integrations remain supported. Delete remains single-capture; promotion supports multiple captures.
