---
status: Accepted
---

# ADR 003: Plain Markdown notes

## Context
Notes must remain readable and portable without Stemlink.

## Decision
Permanent notes are flat Markdown files named `YYYYMMDDHHMM-slug.md`, with YAML front matter containing `title` and `tags`. Links use the full filename stem inside `[[...]]`. Edit the title rather than renaming permanent files.

## Consequences
Handle filename collisions safely. YAML must be valid even when titles or tags contain special characters. No database or proprietary metadata is required.
