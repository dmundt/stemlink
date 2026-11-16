Idea/Feature: Provide meaningful popup for items in vaults, inbox, permanent, and references.

When hovering over an item in the Stemlink tree view (vaults, inbox, permanent, or references), a popup (hover tooltip) should display meaningful information about the note or resource.

## Proposed popup content

### Inbox captures
- **Title** from front matter
- **Description** from front matter
- **Date created** (parsed from the stem timestamp, e.g. `202611161146`)
- **Status** (e.g. `capture`)
- **Promote** action hint: "Use `Stemlink: Promote Capture to Note` to promote this capture."

### Permanent notes
- **Title** from front matter
- **Description** from front matter
- **Tags** from front matter
- **Date created** (parsed from the stem timestamp)
- **Backlinks**: list of notes that link to this note

### Reference notes
- **Title** from front matter
- **Description** from front matter
- **Tags** from front matter
- **URL** or external source (if present in front matter)
- **Date created** (parsed from the stem timestamp)

### Vault root items
- **Name** of the vault section (e.g. Inbox, Permanent, References)
- **Count** of notes in that section

## Implementation notes

- Use the VS Code `TreeItem.tooltip` property (accepts a `vscode.MarkdownString`) to render rich markdown in the hover popup.
- Parse front matter using the existing YAML parsing utilities already present in the codebase.
- Extract the timestamp from the stem filename to display a human-readable creation date.
- Backlinks can be computed by scanning all permanent notes for wikilinks (`[[stem]]`) pointing to the current note's stem.
- The tooltip should be set when the `TreeItem` is constructed in the tree data provider, or lazily via `resolveTreeItem` for expensive operations like backlink scanning.


