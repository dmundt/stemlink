import assert from 'node:assert/strict';
import {
  captureMetadata,
  fleetingTitle,
  frontMatter,
  linksIn,
  makeCapture,
  makeNote,
  markdownCodeSpan,
  metadataProblem,
  noteTags,
  promoteNote,
  renderRouterIndexes,
  renderVaultReadme,
  routerDescription,
} from '../core';

export function invalidTagMetadata(): void {
  for (const text of [
    '---\ntags: [',
    '---\ntags: [\n---\n',
    '---\n[]\n---\n',
    '---\nnull\n---\n',
    '---\ntags: scalar\n---\n',
    '---\ntags: null\n---\n',
    '---\ntags: [one, 2]\n---\n',
    '---\ntags: [one]\ntags: [two]\n---\n',
  ]) {
    const result = noteTags(text);
    assert.ok(result.problem, text);
    assert.deepEqual(result.tags, []);
  }
}

export function referencesInProse(): void {
  const text = [
    '---',
    "title: '[[202601011200-hidden]]'",
    'tags: []',
    '---',
    'See [[202601011201-target]] and `[[202601011202-code]]`.',
    '```markdown',
    '[[202601011203-fence]]',
    '```',
    '[[bad target]] and [[unclosed',
  ].join('\n');
  const links = linksIn(text);
  assert.deepEqual(
    links.map((link) => [link.stem, link.valid]),
    [
      ['202601011201-target', true],
      ['bad target', false],
      ['unclosed', false],
    ],
  );
  assert.equal(text.slice(links[0].start, links[0].end), '[[202601011201-target]]');
  assert.equal(linksIn('An unmatched ` is literal: [[202601011201-target]]')[0]?.valid, true);
}

export function frontMatterPosition(): void {
  assert.equal(frontMatter('text\n---\ntitle: wrong\n---\n'), undefined);
  assert.ok(metadataProblem('text\n---\ntitle: wrong\n---\n'));
  assert.ok(metadataProblem('---\ntitle: ok\ntags: nope\n---\n'));
  assert.equal(metadataProblem(makeNote('Example: title', ['first', 'a: b'])), undefined);
}

export function captureHeadlines(): void {
  assert.equal(makeCapture('Prompt\n', '  A thought  '), '# A thought\n\nPrompt\n');
  assert.equal(
    makeCapture('---\r\ntags: [idea]\r\n---\r\nBody\r\n', 'A thought'),
    '---\r\ntags: [idea]\r\n---\r\n\r\n# A thought\r\n\r\nBody\r\n',
  );
  assert.equal(makeCapture('\uFEFFPrompt\n', 'Idea'), '\uFEFF# Idea\n\nPrompt\n');
  assert.equal(makeCapture('---\ntags: []\n---', 'Idea'), '---\ntags: []\n---\n\n# Idea\n\n');
  assert.throws(() => makeCapture('---\ntags: []\n', 'Idea'), /unclosed YAML/);
}

export function captureMetadataValidation(): void {
  assert.deepEqual(captureMetadata('Body\n'), {});
  assert.deepEqual(captureMetadata('---\ntitle: Idea\ntags: [one, two]\n---\nBody'), {
    title: 'Idea',
    tags: ['one', 'two'],
  });
  assert.deepEqual(captureMetadata("---\ntitle: ''\ntags: []\n---\n"), { title: '', tags: [] });
  assert.deepEqual(captureMetadata('---\nother: kept\n---\n'), {
    title: undefined,
    tags: undefined,
  });
  for (const fields of ['title: 42', 'title: null', 'tags: one', 'tags: [one, 2]', 'tags: null']) {
    assert.throws(() => captureMetadata(`---\n${fields}\n---\nBody`), /must be/);
    assert.throws(() => promoteNote(`---\n${fields}\n---\nBody`, 'Title', []), /must be/);
  }
  assert.throws(() => captureMetadata('---\ntitle: [\n---\n'), /invalid YAML/);
  assert.throws(() => captureMetadata('---\ntitle: unfinished\n'), /unclosed/);
  const body = '\r\nKeep [[202601011200-note-1]].\r\n';
  const result = promoteNote(`\uFEFF---\r\ncustom: kept\r\n---\r\n${body}`, 'Changed', ['one']);
  assert.ok(result.startsWith('\uFEFF---\r\n'));
  assert.ok(result.endsWith(body));
  assert.match(result, /custom: kept/);
  assert.deepEqual(captureMetadata(result), { title: 'Changed', tags: ['one'] });
}

export function fleetingTitles(): void {
  assert.equal(fleetingTitle('\nFirst sentence. Second sentence.\nNext line'), 'First sentence.');
  assert.equal(fleetingTitle('\r\n# Capture heading\r\nBody text'), 'Capture heading');
  assert.equal(fleetingTitle('---\ntitle: Metadata\n---\nBody title\nMore'), 'Body title');
  assert.equal(fleetingTitle(' \n\t'), 'Empty capture.');
  assert.equal(fleetingTitle('x'.repeat(120)), 'x'.repeat(120));
  assert.equal(fleetingTitle('x'.repeat(121)), `${'x'.repeat(120)}...`);
  assert.throws(() => fleetingTitle('---\ntitle: Unclosed'), /Unclosed/);
}

export function routerDescriptions(): void {
  assert.equal(
    routerDescription('---\ntitle: Title\ndescription: >-\n  First line\n  second line\n---\nBody'),
    'First line second line',
  );
  assert.equal(routerDescription("---\ntitle: Title\ndescription: ''\n---\n"), 'Title');
  assert.equal(
    routerDescription('---\ntitle: null\ndescription: null\n---\n'),
    'No description or title.',
  );
  assert.equal(routerDescription('Capture without metadata'), 'No description or title.');
  assert.throws(() => routerDescription('---\ntitle: Unclosed'), /Unclosed/);
  assert.throws(() => routerDescription('---\ntitle: [\n---\n'), /Invalid YAML/);
  assert.throws(() => routerDescription('---\ntitle: One\ntitle: Two\n---\n'), /Invalid YAML/);
  assert.throws(() => routerDescription('---\n[]\n---\n'), /must be a YAML mapping/);
  assert.throws(
    () => routerDescription('---\ndescription: [one, two]\n---\n'),
    /description must be text/,
  );
}

export function vaultManual(): void {
  const template = ['# Manual', '<!-- stemlink:configured-folders -->'].join('\n');
  const rendered = renderVaultReadme(template, 'Stemlink vault', 'Fleeting', 'Permanent`Notes');
  assert.match(rendered, /Vault root: `Stemlink vault\/`/);
  assert.match(rendered, /Captures: `Fleeting\/`/);
  assert.match(rendered, /Permanent notes: ``Permanent`Notes\/``/);
  assert.match(rendered, /Editable examples: `templates\/`/);
  assert.throws(() => renderVaultReadme('# Manual', 'zk', 'inbox', 'notes'), /exactly one/);
  assert.equal(markdownCodeSpan('a``b'), '```a``b```');
  assert.match(
    renderVaultReadme(template, 'vault', 'capture', 'notes', 'examples'),
    /Editable examples: `examples\/`/,
  );
  const indexes = renderRouterIndexes('vault', 'capture', 'notes', [], [], 'examples');
  assert.ok(
    indexes.root.includes('`examples/`') && indexes.notes.includes('`examples/`'),
    'routers omitted configured templates folder',
  );
}
