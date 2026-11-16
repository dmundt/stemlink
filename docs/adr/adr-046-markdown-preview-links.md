---
status: Accepted
---

# ADR 046: Markdown preview wiki links

## Context

Editor navigation resolves wiki links, but the built-in Markdown preview displays their brackets as plain text.

## Decision

Contribute VS Code's native `markdown.markdownItPlugins` extension point and export `extendMarkdownIt`. Add an inline rule for the existing exact stem grammar. Render resolved targets as ordinary anchors, using the preview document's vault and the existing filename index rather than the active editor.

Require Workspace Trust. Preserve note source, code spans and blocks, escaped references, existing Markdown links, and front matter. Leave missing or invalid references literal and retain Check References diagnostics. Escape rendered link attributes and labels. Do not guess targets or add command links, scripts, network calls, or runtime dependencies.

If a preview needs a cold filename index, load names asynchronously and refresh the preview when ready. Refresh after observed vault index changes. Keep Markdown parsing independent of VS Code through a minimal structural interface for the host-supplied parser.

## Consequences

Wiki links work in VS Code's built-in preview without migrating notes. Other Markdown viewers still need their own wiki-link support. A cold index may initially show literal references until the preview refreshes.
