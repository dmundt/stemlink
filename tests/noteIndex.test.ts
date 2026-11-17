import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoteIndex } from '../src/application/noteIndex';
import { linksIn, NoteData } from '../src/core/documents';

function note(stem: string, text: string): NoteData {
  return { stem, name: `${stem}.md`, text, links: linksIn(text) };
}

test('note index maintains backlink occurrences through replacement and deletion', () => {
  const index = new NoteIndex<NoteData>();
  const first = note('first', '[[202601011200-target]] [[202601011200-target]]');
  const second = note('second', '[[202601011200-target]] [[invalid]]');
  index.reset([first, second]);
  assert.equal(index.references('202601011200-target').length, 3);
  assert.deepEqual(index.references('invalid'), []);

  const updated = note('first', '[[202601011200-other]]');
  index.replace(updated);
  assert.deepEqual(index.all, [updated, second]);
  assert.deepEqual(
    index.references('202601011200-target').map((item) => item.note),
    [second],
  );
  assert.deepEqual(
    index.references('202601011200-other').map((item) => item.note),
    [updated],
  );

  index.remove('second');
  assert.deepEqual(index.references('202601011200-target'), []);
  index.clear();
  assert.deepEqual(index.all, []);
  assert.deepEqual(index.references('202601011200-other'), []);
});
