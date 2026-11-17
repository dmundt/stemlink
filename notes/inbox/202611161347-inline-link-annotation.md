Idea: Show the number of inbound links in Markdown Preview as an inline annotation.

## Behavior

- Show a compact backlink count beside the first rendered heading; if the note has no heading, place it at the top of the preview.
- Count inbound references using the active vault's existing reference index, with the same semantics as the Inbound tree section.
- Show zero when the index is ready and there are no inbound links. Do not show a misleading zero while the index is pending or has failed.
- Update the annotation when the note or vault index changes.
- Show the annotation only for permanent notes in a known vault. Do not modify the Markdown file.
- Respect Workspace Trust and existing preview boundaries.

## Acceptance criteria

- Preview shows the correct count for notes with multiple inbound links and for unreferenced notes.
- Adding or removing a link updates the count after the vault index refreshes.
- Pending or failed indexing is distinguishable from a count of zero.
- Captures and files outside configured vaults do not get an annotation.

## Implementation notes

- Reuse the current Markdown Preview integration and vault reference index; do not scan files separately.
- Resolve the previewed document and its vault from the preview environment before querying inbound references.
- Keep the annotation informational and visually unobtrusive.
