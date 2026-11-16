Idea: Provide promoting command+button to promote a capture to a permanent note using a command and/or button in the UI.

The `stemlink.promote` command already exists in the codebase (visible in `testCommandFailures`). This note should document how the promoting feature works.

Implementation notes:

- The `stemlink.promote` command accepts a `{ uri }` argument pointing to a capture file in the inbox folder.
- It reads the capture's front matter (YAML) and body, prompts the user for tags, then creates a new permanent note with a timestamped stem (e.g. `202611161137-my-title.md`) in the notes folder.
- A button or context menu entry in the Stemlink tree view (inbox section) triggers the command for the selected capture item.
- If the user cancels any prompt (e.g. the tags input), the capture is left untouched.
- If the workspace edit fails, an error message is shown and the capture is preserved.
- The promoted note inherits the title and description from the capture's front matter, with the tags supplied interactively.

UI entry points:

1. **Command palette**: `Stemlink: Promote Capture to Note` — prompts the user to pick a capture if none is active.
2. **Tree view inline button**: An icon button next to each inbox item that calls `stemlink.promote` with the item's URI.
3. **Editor title button**: When a capture file is open and active, a promote button appears in the editor title bar.
4. **Context menu**: Right-clicking an inbox item in the tree view shows a "Promote to Note" option.
