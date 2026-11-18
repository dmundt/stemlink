import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { auditNotes, linksIn, makeNote, NoteData } from '../src/core/documents';

const count = 10_000;
const start = performance.now();
const notes: NoteData[] = Array.from({ length: count }, (_, i) => {
  const stem = `202601011200-note-${i}`;
  const text = makeNote(
    `Note ${i}`,
    ['benchmark'],
    `A representative note linking to [[202601011200-note-${(i + 1) % count}]].`,
  );
  return { stem, name: `${stem}.md`, text, links: linksIn(text) };
});
const parsed = performance.now();
const findings = auditNotes(notes);
const audited = performance.now();
assert.equal(notes.length, count);
assert.deepEqual(findings, [], 'benchmark fixture should have no audit findings');
console.log(
  JSON.stringify({
    fixture: `${count} generated notes with title, one tag, and one outgoing reference`,
    coreParsingMs: Math.round(parsed - start),
    coreAuditMs: Math.round(audited - parsed),
    findings: findings.length,
  }),
);
