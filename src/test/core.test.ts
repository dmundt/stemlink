import assert from "node:assert/strict";
import { test } from "node:test";
import { auditNotes, frontMatter, linksIn, makeNote, metadataProblem, promoteNote, slug, timestamp } from "../core";

test("parses references in prose, not front matter or Markdown code", () => {
  const text = [
    "---", "title: '[[202601011200-hidden]]'", "tags: []", "---",
    "See [[202601011201-target]] and `[[202601011202-code]]`.",
    "```markdown", "[[202601011203-fence]]", "```",
    "[[bad target]] and [[unclosed",
  ].join("\n");
  const links = linksIn(text);
  assert.deepEqual(links.map(link => [link.stem, link.valid]), [
    ["202601011201-target", true], ["bad target", false], ["unclosed", false],
  ]);
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
  assert.throws(() => promoteNote("---\ninvalid: [\n---\nBody", "A", []), /invalid YAML/);
  assert.throws(() => promoteNote("---\ntitle: no closing\n", "A", []), /unclosed/);
  assert.ok(promoteNote("Plain capture", "Title", []).endsWith("Plain capture"));
});

test("audit reports broken, malformed, missing metadata and incoming references", () => {
  const a = { stem: "202601011200-a", name: "202601011200-a.md", text: makeNote("A", [], "[[202601011201-b]] [[202601011202-missing]] [[wrong]]"), links: [] as ReturnType<typeof linksIn> };
  const b = { stem: "202601011201-b", name: "202601011201-b.md", text: "No front matter", links: [] as ReturnType<typeof linksIn> };
  a.links = linksIn(a.text);
  b.links = linksIn(b.text);
  const findings = auditNotes([a, b]);
  assert.ok(findings.some(f => f.note === a && f.severity === "error" && f.message.includes("missing")));
  assert.ok(findings.some(f => f.note === a && f.message === "Malformed reference."));
  assert.ok(findings.some(f => f.note === b && f.message.includes("front matter")));
  assert.ok(findings.some(f => f.note === b && f.message === "No outgoing references."));
  assert.ok(findings.some(f => f.note === a && f.message === "No incoming references."));
  assert.ok(!findings.some(f => f.note === b && f.message === "No incoming references."));
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
  for (const yaml of ["", "value", "- one", "title: hello\ntags: [one, 2]", "title: ' '\ntags: []"]) {
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
  assert.deepEqual(links.map(link => [link.stem, link.valid]), [
    ["202601011200-visible", true], ["202601011200-next", true], ["broken", false],
  ]);
  for (const link of links) assert.ok(text.slice(link.start, link.end).startsWith(`[[${link.stem}`));
  assert.equal(linksIn("No closing ` marker [[202601011200-visible]]").length, 1);
});

test("audit handles duplicate, self, broken, and malformed links", () => {
  const text = makeNote("A", [], "[[202601011200-a]] [[202601011200-a]] [[bad]]");
  const note = { stem: "202601011200-a", name: "202601011200-a.md", text, links: linksIn(text) };
  const findings = auditNotes([note]);
  assert.equal(findings.filter(f => f.message === "Malformed reference.").length, 1);
  assert.ok(findings.some(f => f.message === "No incoming references."));
  assert.ok(!findings.some(f => f.message === "No outgoing references."));
  const invalid = { ...note, name: "bad.md", text: "No metadata", links: [] };
  const invalidFindings = auditNotes([invalid]);
  assert.ok(invalidFindings.some(f => f.message === "Invalid note filename."));
  assert.ok(invalidFindings.some(f => f.message === "No outgoing references."));
});
