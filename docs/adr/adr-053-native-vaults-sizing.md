---
status: Accepted
---

# ADR 053: Native Vaults sizing

## Context

Vaults should use little sidebar space when a workspace contains few vaults. Source Control's Repositories pane demonstrates content-driven sizing with a visible-row limit, but it uses internal workbench pane APIs unavailable to extensions.

The public TreeView API exposes no dynamic height or minimum/maximum row controls. The view contribution's `initialSize` behaves like CSS flex, not a pixel height or row count. ADR 042 incorrectly described its value as pixels.

## Decision

Set only the Vaults view's initial relative weight to 1 instead of 100. Keep the native TreeView, divider resizing, and vertical overflow scrollbar. Preserve every vault row, native selection, keyboard navigation, and context actions.

Respect saved layouts and user-adjusted dimensions. Do not reset layouts, repeatedly force sizes, add paging, replace the view with a webview, inject CSS, or call internal workbench sizing commands. Other view contributions are unchanged.

Do not promise exact automatic sizing to 1–8 rows. Actual height depends on workbench minimum dimensions, available space, expanded sibling views, zoom, and saved layout. Users may adjust the divider to their preferred number of visible rows.

This supersedes only ADR 042's initial weight and its incorrect pixel interpretation; its native-API boundary remains.

## Consequences

Fresh layouts request less space for Vaults. Existing layouts may show no size change. Overflow remains accessible through native scrolling, without changing vault discovery or functionality. Exact content-driven row limits would require a supported VS Code API not currently available.

## References

- [View contribution schema](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/viewsExtensionPoint.ts): `initialSize`.
- [Source Control Repositories pane](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/scmRepositoriesViewPane.ts): internal body-size constraints.
