---
status: Accepted
---

# ADR 060: Consistent action surfaces

## Context

Equivalent note creation and validation entry points use different labels. Compact Vaults headers should reserve toolbar space for routine actions, and settings documentation should include all current defaults.

## Decision

Use sentence-case visible action names consistently: New fleeting note, New permanent note, Promote to permanent note, Edit metadata, Validate vault, Open vault, and Create vault. Use the existing Unicode ellipsis for actions that request further input or confirmation. Keep command IDs, resource scopes, item-context restrictions, and configured view headings unchanged.

Keep Settings in the native Vaults overflow menu and Command Palette rather than the persistent navigation toolbar. Include headline, promotion metadata, and promotion confirmation defaults in the settings table.

## Consequences

This supersedes command wording in ADR 032, toolbar placement in ADR 036, and corresponding action labels in ADRs 048 and 049. ADR 051's two vault actions and all existing command integrations remain supported. This pre-1.0 visible-label change requires no Markdown migration.
