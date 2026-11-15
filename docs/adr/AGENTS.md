# ADR editing rules

Architecture decisions live in ADR files. Start with the [ADR index](./index.md) and read relevant decisions before documenting or changing behavior they cover.

## File conventions

- Name ADRs `adr-NNN-short-name.md`, using the next available number.
- Start each ADR with YAML front matter containing `status`.
- Include context, decision, and consequences.

## Changing decisions

- Do not contradict an accepted ADR. Supersede it with a new decision.
- Keep the ADR status authoritative. On supersession, update the older ADR's status and link to the superseding decision; do not delete the older ADR.
- Update the index when adding, renaming, or superseding an ADR.
