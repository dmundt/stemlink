import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument } from "yaml";
import {
  auditNotes,
  frontMatter,
  fleetingTitle,
  isRouterIndex,
  isVaultInstructionFile,
  linksIn,
  makeNote,
  metadataProblem,
  promoteNote,
  markdownCodeSpan,
  renderRouterIndexes,
  routerDescription,
  renderVaultReadme,
  replaceRouterIndexSection,
  routerIndexEnd,
  routerIndexStart,
  slug,
  timestamp,
} from "../core";

test("parses references in prose, not front matter or Markdown code", () => {
  const text = [
    "---",
    "title: '[[202601011200-hidden]]'",
    "tags: []",
    "---",
    "See [[202601011201-target]] and `[[202601011202-code]]`.",
    "```markdown",
    "[[202601011203-fence]]",
    "```",
    "[[bad target]] and [[unclosed",
  ].join("\n");
  const links = linksIn(text);
  assert.deepEqual(
    links.map((link) => [link.stem, link.valid]),
    [
      ["202601011201-target", true],
      ["bad target", false],
      ["unclosed", false],
    ],
  );
  assert.equal(text.slice(links[0].start, links[0].end), "[[202601011201-target]]");
  assert.equal(linksIn("An unmatched ` is literal: [[202601011201-target]]")[0]?.valid, true);
});

test("only recognizes front matter at the beginning", () => {
  assert.equal(frontMatter("text\n---\ntitle: wrong\n---\n"), undefined);
  assert.ok(metadataProblem("text\n---\ntitle: wrong\n---\n"));
  assert.ok(metadataProblem("---\ntitle: ok\ntags: nope\n---\n"));
  assert.equal(metadataProblem(makeNote("Example: title", ["first", "a: b"])), undefined);
});

test("promoting preserves body and existing YAML fields", () => {
  const capture = "---\nsource: example\ntitle: Old\ntags: []\n---\n\nBody [[202601011201-link]]\n";
  const result = promoteNote(capture, "New: title", ["one", "two"]);
  assert.match(result, /source: example/);
  assert.match(result, /\n\nBody \[\[202601011201-link\]\]\n$/);
  assert.equal(metadataProblem(result), undefined);
  assert.match(result, /^tags: \[one, two\]$/m);
  assert.throws(() => promoteNote("---\ninvalid: [\n---\nBody", "A", []), /invalid YAML/);
  assert.throws(() => promoteNote("---\ntitle: no closing\n", "A", []), /unclosed/);
  assert.ok(promoteNote("Plain capture", "Title", []).endsWith("Plain capture"));
});

test("note creation and promotion keep tag sequences on one line", () => {
  const body = "Body remains unchanged.\n";
  const capture = "---\nsource: example\ntags:\n  - old\n---\n\n" + body;
  const cases = [
    ["notes", "zk", "bug"],
    [],
    ["one, two", "[brackets]", "a: b", "#hash", "true", 'a "quote"'],
    Array.from({ length: 30 }, (_, index) => `long-tag-${index}`),
  ];
  for (const tags of cases) {
    for (const text of [
      makeNote("Title", tags, body),
      promoteNote(body, "Title", tags),
      promoteNote(capture, "Title", tags),
    ]) {
      const matter = frontMatter(text);
      assert.ok(matter);
      assert.match(matter.yaml, /^tags: \[[^\r\n]*\]$/m);
      assert.deepEqual(parseDocument(matter.yaml).toJS().tags, tags);
      assert.ok(text.endsWith(body), "serializing tags changed note body");
      assert.equal(metadataProblem(text), undefined);
    }
  }
});

test("audit reports broken, malformed, missing metadata and incoming references", () => {
  const a = {
    stem: "202601011200-a",
    name: "202601011200-a.md",
    text: makeNote("A", [], "[[202601011201-b]] [[202601011202-missing]] [[wrong]]"),
    links: [] as ReturnType<typeof linksIn>,
  };
  const b = {
    stem: "202601011201-b",
    name: "202601011201-b.md",
    text: "No front matter",
    links: [] as ReturnType<typeof linksIn>,
  };
  a.links = linksIn(a.text);
  b.links = linksIn(b.text);
  const findings = auditNotes([a, b]);
  assert.ok(
    findings.some((f) => f.note === a && f.severity === "error" && f.message.includes("missing")),
  );
  assert.ok(findings.some((f) => f.note === a && f.message === "Malformed reference."));
  assert.ok(findings.some((f) => f.note === b && f.message.includes("front matter")));
  assert.ok(findings.some((f) => f.note === b && f.message === "No outgoing references."));
  assert.ok(findings.some((f) => f.note === a && f.message === "No incoming references."));
  assert.ok(!findings.some((f) => f.note === b && f.message === "No incoming references."));
});

test("underscore files are excluded and underscore references fail validation", () => {
  const text = makeNote("Visible", [], "[[_202601011200-hidden]]");
  const visible = {
    name: "202601011201-visible.md",
    stem: "202601011201-visible",
    text,
    links: linksIn(text),
  };
  const hiddenText = `[[${visible.stem}]]`;
  const hidden = {
    name: "_202601011200-hidden.md",
    stem: "_202601011200-hidden",
    text: hiddenText,
    links: linksIn(hiddenText),
  };
  assert.equal(visible.links[0].valid, false);
  const findings = auditNotes([visible, hidden]);
  assert.ok(!findings.some((finding) => finding.note === hidden));
  assert.ok(
    findings.some(
      (finding) => finding.note === visible && finding.message === "Malformed reference.",
    ),
  );
  assert.ok(
    findings.some(
      (finding) => finding.note === visible && finding.message === "No incoming references.",
    ),
  );
});

test("filenames use local timestamps and safe slugs", () => {
  assert.equal(timestamp(new Date(2026, 0, 2, 3, 4)), "202601020304");
  assert.equal(slug("Café: One & Two"), "cafe-one-two");
  assert.equal(slug("💡"), "note");
  assert.ok(slug("long title ".repeat(100)).length <= 80);
});

test("front matter handles BOM, CRLF, and invalid YAML shapes", () => {
  const text = "\uFEFF---\r\ntitle: Hello\r\ntags: [one]\r\n---\r\nBody";
  assert.equal(text.slice(frontMatter(text)?.end), "Body");
  assert.equal(metadataProblem(text), undefined);
  assert.match(metadataProblem("---\ntitle: [\n---\n") ?? "", /^Invalid YAML front matter:/);
  for (const yaml of [
    "",
    "value",
    "- one",
    "title: hello\ntags: [one, 2]",
    "title: ' '\ntags: []",
  ]) {
    assert.ok(metadataProblem(`---\n${yaml}\n---\n`), `accepted invalid metadata: ${yaml}`);
  }
  assert.ok(metadataProblem("---\ntitle: first\ntitle: second\ntags: []\n---\n"));
});

test("promotion rejects non-mapping front matter without losing capture text", () => {
  assert.throws(() => promoteNote("---\n- entry\n---\nbody", "Title", []), /YAML mapping/);
  assert.throws(() => promoteNote("---\nfalse\n---\nbody", "Title", []), /invalid YAML/);
  assert.throws(() => promoteNote("\uFEFF---\r\nno closing", "Title", []), /unclosed/);
  const capture = "---\r\nsource: book\r\ntitle: old\r\ntags: []\r\n---\r\n\r\nBody\r\n";
  assert.ok(promoteNote(capture, "New", []).endsWith("\r\nBody\r\n"));
});

test("reference parsing respects fences, escaped brackets, offsets, and unmatched delimiters", () => {
  const text = [
    "Escaped \\[[202601011200-escaped]] and [[202601011200-visible]].",
    "~~~md",
    "[[202601011200-hidden]]",
    "```",
    "[[202601011200-still-hidden]]",
    "~~~",
    "``[[202601011200-code]]`` [[202601011200-next]]",
    "[[broken",
  ].join("\r\n");
  const links = linksIn(text);
  assert.deepEqual(
    links.map((link) => [link.stem, link.valid]),
    [
      ["202601011200-visible", true],
      ["202601011200-next", true],
      ["broken", false],
    ],
  );
  for (const link of links)
    assert.ok(text.slice(link.start, link.end).startsWith(`[[${link.stem}`));
  assert.equal(linksIn("No closing ` marker [[202601011200-visible]]").length, 1);
});

test("audit handles duplicate, self, broken, and malformed links", () => {
  const text = makeNote("A", [], "[[202601011200-a]] [[202601011200-a]] [[bad]]");
  const note = { stem: "202601011200-a", name: "202601011200-a.md", text, links: linksIn(text) };
  const findings = auditNotes([note]);
  assert.equal(findings.filter((f) => f.message === "Malformed reference.").length, 1);
  assert.ok(findings.some((f) => f.message === "No incoming references."));
  assert.ok(!findings.some((f) => f.message === "No outgoing references."));
  const invalid = { ...note, name: "bad.md", text: "No metadata", links: [] };
  const invalidFindings = auditNotes([invalid]);
  assert.ok(invalidFindings.some((f) => f.message === "Invalid note filename."));
  assert.ok(invalidFindings.some((f) => f.message === "No outgoing references."));
});

test("fleeting router titles summarize body text and truncate long titles", () => {
  assert.equal(fleetingTitle("\nFirst sentence. Second sentence.\nNext line"), "First sentence.");
  assert.equal(fleetingTitle("\r\n# Capture heading\r\nBody text"), "Capture heading");
  assert.equal(fleetingTitle("---\ntitle: Metadata\n---\nBody title\nMore"), "Body title");
  assert.equal(fleetingTitle(" \n\t"), "Empty capture.");
  assert.equal(fleetingTitle("x".repeat(120)), "x".repeat(120));
  assert.equal(fleetingTitle("x".repeat(121)), `${"x".repeat(120)}...`);
  assert.throws(() => fleetingTitle("---\ntitle: Unclosed"), /Unclosed/);
});

test("router descriptions use YAML description, then title, and reject invalid metadata", () => {
  assert.equal(
    routerDescription("---\ntitle: Title\ndescription: >-\n  First line\n  second line\n---\nBody"),
    "First line second line",
  );
  assert.equal(routerDescription("---\ntitle: Title\ndescription: ''\n---\n"), "Title");
  assert.equal(routerDescription("Capture without metadata"), "No description or title.");
  assert.throws(() => routerDescription("---\ntitle: Unclosed"), /Unclosed/);
  assert.throws(() => routerDescription("---\ntitle: [\n---\n"), /Invalid YAML/);
  assert.throws(() => routerDescription("---\ntitle: One\ntitle: Two\n---\n"), /Invalid YAML/);
  assert.throws(
    () => routerDescription("---\ndescription: [one, two]\n---\n"),
    /description must be text/,
  );
});

test("folder routers map local files to escaped descriptions with stable ordering", () => {
  const indexes = renderRouterIndexes(
    "vault",
    "fleeting",
    "notes",
    [
      { name: "b [draft].md", description: "Text | [link](target) <script>" },
      { name: "a.md", description: "First" },
    ],
    [{ name: "note.md", description: "Note title" }],
  );
  assert.ok(indexes.inbox.includes("| [a.md](./a.md) | First |"));
  assert.ok(indexes.inbox.includes("[b &#91;draft&#93;.md](./b%20%5Bdraft%5D.md)"));
  assert.ok(indexes.inbox.includes("Text &#124; &#91;link&#93;(target) &#60;script&#62;"));
  assert.ok(indexes.inbox.indexOf("./a.md") < indexes.inbox.indexOf("./b%20"));
  assert.ok(indexes.notes.includes("| [note.md](./note.md) | Note title |"));
  assert.ok(!indexes.root.includes("./note.md"), "root router duplicated the folder listing");
});

test("router indexes route by folder and replace only their generated section", () => {
  const entries = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `${index}.md`,
      description: `Note ${index}`,
    }));
  const indexes = renderRouterIndexes("zk", "in box", "stable", entries(2), entries(4));
  assert.match(indexes.root, /Stemlink vault router: `zk\/`/);
  assert.match(indexes.root, /\[Inbox `in box\/` \(2 captures\)\]\(\.\/in%20box\/INDEX\.md\)/);
  assert.match(indexes.root, /\[Notes `stable\/` \(4 Markdown files\)\]\(\.\/stable\/INDEX\.md\)/);
  assert.match(indexes.root, /not authoritative.*in-memory note\/reference index/);
  assert.match(indexes.inbox, /\[Vault index\]\(\.\.\/INDEX\.md\)/);
  assert.match(indexes.inbox, /Inbox router: `in box\/`/);
  assert.match(indexes.inbox, /not authoritative.*in-memory note\/reference index/);
  assert.match(indexes.notes, /excludes INDEX\.md and AGENTS\.md/);
  assert.match(indexes.notes, /Notes router: `stable\/`/);
  assert.match(indexes.root, /Templates live in the vault-level templates folder/);
  assert.match(indexes.notes, /not authoritative.*in-memory note\/reference index/);
  assert.equal(isRouterIndex("INDEX.md"), true);
  assert.equal(isRouterIndex("_index.md"), false);
  assert.equal(isVaultInstructionFile("agents.md"), true);
  assert.equal(isVaultInstructionFile("_template.md"), false);

  const current = `Before\r\n${routerIndexStart}\r\nOld\r\n${routerIndexEnd}\r\nUser content\r\n`;
  const updated = replaceRouterIndexSection(current, indexes.root);
  assert.ok(updated);
  assert.ok(updated.startsWith("Before\r\n"));
  assert.ok(updated.endsWith("User content\r\n"));
  assert.ok(updated.includes("Inbox `in box/` (2 captures)"));
  assert.equal(replaceRouterIndexSection("User-owned index", indexes.root), undefined);
  assert.equal(
    replaceRouterIndexSection(indexes.root, indexes.root),
    indexes.root,
    "unchanged generated content caused a rewrite",
  );
  assert.throws(
    () => replaceRouterIndexSection(`${routerIndexStart}\nUnclosed`, indexes.root),
    /Malformed/,
  );

  const router = {
    name: "INDEX.md",
    stem: "INDEX",
    text: "Router instructions",
    links: [],
  };
  assert.deepEqual(auditNotes([router]), [], "router file must not create note audit findings");
  assert.deepEqual(
    auditNotes([{ ...router, name: "AGENTS.md", stem: "AGENTS" }]),
    [],
    "agent instructions must not create note audit findings",
  );
});

test("vault manual personalizes configured folders and safely renders backticks", () => {
  const template = ["# Manual", "<!-- stemlink:configured-folders -->"].join("\n");
  const rendered = renderVaultReadme(template, "Stemlink vault", "Fleeting", "Permanent`Notes");
  assert.match(rendered, /Vault root: `Stemlink vault\/`/);
  assert.match(rendered, /Captures: `Fleeting\/`/);
  assert.match(rendered, /Permanent notes: ``Permanent`Notes\/``/);
  assert.match(rendered, /Editable examples: `templates\/`/);
  assert.throws(() => renderVaultReadme("# Manual", "zk", "inbox", "notes"), /exactly one/);
  assert.equal(markdownCodeSpan("a``b"), "```a``b```");
  assert.match(
    renderVaultReadme(template, "vault", "capture", "notes", "examples"),
    /Editable examples: `examples\/`/,
  );
  const indexes = renderRouterIndexes("vault", "capture", "notes", [], [], "examples");
  assert.ok(
    indexes.root.includes("`examples/`") && indexes.notes.includes("`examples/`"),
    "routers omitted configured templates folder",
  );
});

test("router replacement rejects ambiguous marker pairs without changing user content", () => {
  const generated = renderRouterIndexes(
    "vault",
    "capture",
    "permanent",
    [{ name: "capture.md", description: "Capture" }],
    [
      { name: "one.md", description: "One" },
      { name: "two.md", description: "Two" },
    ],
  ).root;
  for (const current of [
    `${routerIndexEnd}\n${routerIndexStart}`,
    `${routerIndexStart}\n${routerIndexStart}\n${routerIndexEnd}`,
    `${routerIndexStart}\n${routerIndexEnd}\n${routerIndexEnd}`,
    `User text\n${routerIndexEnd}`,
  ]) {
    assert.throws(() => replaceRouterIndexSection(current, generated), /Malformed/);
  }
  const current = `User prefix\n${routerIndexStart}\nOld content\n${routerIndexEnd}\nUser suffix\n`;
  const updated = replaceRouterIndexSection(current, generated);
  assert.ok(updated !== undefined);
  assert.ok(updated.startsWith("User prefix\n"));
  assert.ok(updated.endsWith("User suffix\n"));
  assert.match(updated, /capture\/.*1 capture/);
  assert.match(updated, /permanent\/.*2 Markdown files/);
});

test("promotion preserves nested metadata while replacing only title and tags", () => {
  const capture = [
    "---",
    "title: Old",
    "tags: [old]",
    "source:",
    "  author: Example",
    "  pages: [2, 4]",
    "---",
    "",
    "Body",
    "---",
    "Not front matter",
    "",
  ].join("\n");
  const result = promoteNote(capture, "New", ["one", "two"]);
  const matter = frontMatter(result);
  assert.ok(matter);
  assert.deepEqual(parseDocument(matter.yaml).toJS(), {
    title: "New",
    tags: ["one", "two"],
    source: { author: "Example", pages: [2, 4] },
  });
  assert.equal(result.slice(matter.end), capture.slice(frontMatter(capture)?.end));
  assert.throws(
    () => promoteNote("---\ntitle: first\ntitle: second\n---\nBody", "New", []),
    /invalid YAML/,
  );
});
