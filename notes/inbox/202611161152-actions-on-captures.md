Idea: Actions on inbox captures

When a capture is in the inbox, the user should be able to perform actions such as promoting it to a permanent note or discarding it.

Actions available:
- Promote to permanent note: Move the capture to the notes directory with a proper filename and metadata.
- Discard: Delete the capture from the inbox.
- Edit: Open the capture for editing before promoting or discarding.
- Tag: Add tags to the capture for better organization.
- Link: Link the capture to an existing note.
- View: Preview the capture in a read-only mode without opening it for editing.
- Title: Set a title for the capture.
- Rename: Change the filename of the capture in the inbox.

Implementation approach:
1. Create a UI component for the inbox view that displays captures with action buttons
2. Implement the action handlers for each action type
3. Ensure proper state management for the inbox and notes
4. Add keyboard shortcuts for common actions
5. Integrate with the existing Stemlink tree view to reflect changes in the inbox and notes directories in real-time.
