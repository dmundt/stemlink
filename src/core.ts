import { Document, isMap, isScalar, parseDocument } from "yaml";

export interface Link {
  stem: string;
  start: number;
  end: number;
  valid: boolean;
}

export const stemPattern = /^\d{12}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const filenamePattern = /^\d{12}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const routerIndexName = "INDEX.md";
export const agentInstructionsName = "AGENTS.md";
export const routerIndexStart = "<!-- stemlink:generated:start -->";
export const routerIndexEnd = "<!-- stemlink:generated:end -->";

export function isReservedFolderName(value: string): boolean {
  return /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(
    value,
  );
}

export function isRouterIndex(name: string): boolean {
  return name.toLowerCase() === routerIndexName.toLowerCase();
}

export function isVaultInstructionFile(name: string): boolean {
  return isRouterIndex(name) || name.toLowerCase() === agentInstructionsName.toLowerCase();
}

export function isExcludedNoteFile(name: string): boolean {
  return name.startsWith("_") || isVaultInstructionFile(name);
}

export interface RouterIndexContent {
  root: string;
  inbox: string;
  notes: string;
}

export interface RouterEntry {
  name: string;
  description: string;
}

export function fleetingTitle(text: string): string {
  const matter = frontMatter(text);
  if (!matter && /^(?:\uFEFF)?---[ \t]*\r?\n/.test(text))
    throw new Error("Unclosed YAML front matter.");
  const body = matter ? text.slice(matter.end) : text;
  const line = body
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!line) return "Empty capture.";
  const title = line.replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ");
  const sentence = title.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? title;
  const characters = Array.from(sentence);
  return characters.length > 120 ? `${characters.slice(0, 120).join("").trimEnd()}...` : sentence;
}

export function routerDescription(text: string): string {
  const matter = frontMatter(text);
  if (!matter) {
    if (/^(?:\uFEFF)?---[ \t]*\r?\n/.test(text)) throw new Error("Unclosed YAML front matter.");
    return "No description or title.";
  }
  const document = parseDocument(matter.yaml, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error(`Invalid YAML front matter: ${document.errors[0].message}`);
  if (!isMap(document.contents)) throw new Error("Front matter must be a YAML mapping.");
  for (const field of ["description", "title"]) {
    const value: unknown = document.get(field);
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new Error(`Front matter ${field} must be text.`);
    if (value.trim()) return value.replace(/\s+/g, " ").trim();
  }
  return "No description or title.";
}

export function markdownCodeSpan(value: string): string {
  let delimiter = "`";
  while (value.includes(delimiter)) delimiter += "`";
  return `${delimiter}${value}${delimiter}`;
}

export function renderVaultReadme(
  template: string,
  rootName: string,
  inboxName: string,
  notesName: string,
  templatesName = "templates",
): string {
  const marker = "<!-- stemlink:configured-folders -->";
  const markerIndex = template.indexOf(marker);
  if (markerIndex < 0 || template.indexOf(marker, markerIndex + marker.length) >= 0) {
    throw new Error("Vault manual must contain exactly one configured-folder marker.");
  }
  const folders = [
    "## This vault's folders",
    "",
    `- Vault root: ${markdownCodeSpan(`${rootName}/`)}`,
    `- Captures: ${markdownCodeSpan(`${inboxName}/`)}`,
    `- Permanent notes: ${markdownCodeSpan(`${notesName}/`)}`,
    `- Editable examples: ${markdownCodeSpan(`${templatesName}/`)}`,
  ].join("\n");
  return template.replace(marker, () => folders);
}

export function renderRouterIndexes(
  rootName: string,
  inboxName: string,
  notesName: string,
  inboxEntries: readonly RouterEntry[],
  notesEntries: readonly RouterEntry[],
  templatesName = "templates",
): RouterIndexContent {
  const path = (name: string) => encodeURIComponent(name);
  const inboxCount = inboxEntries.length;
  const notesCount = notesEntries.length;
  const escape = (text: string) =>
    text.replace(/[&<>"'\\`*_[\]{}|]/g, (character) => `&#${character.charCodeAt(0)};`);
  const listing = (entries: readonly RouterEntry[], column = "Description") => [
    `| File | ${column} |`,
    "| --- | --- |",
    ...[...entries]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(
        (entry) =>
          `| [${escape(entry.name)}](./${path(entry.name)}) | ${escape(entry.description)} |`,
      ),
  ];
  const section = (lines: string[]) => [routerIndexStart, ...lines, routerIndexEnd, ""].join("\n");
  const authorityRule =
    "Navigation only, not authoritative. Stemlink's in-memory note/reference index is authoritative for live vault state.";
  return {
    root: section([
      `# Stemlink vault router: ${markdownCodeSpan(`${rootName}/`)}`,
      "",
      "Start here. Use the folder indexes to route work, then read the relevant Markdown files directly.",
      "",
      authorityRule,
      "",
      `- [Inbox ${markdownCodeSpan(`${inboxName}/`)} (${inboxCount} captures)](./${path(inboxName)}/${routerIndexName})`,
      `- [Notes ${markdownCodeSpan(`${notesName}/`)} (${notesCount} Markdown files)](./${path(notesName)}/${routerIndexName})`,
      "",
      `Counts cover direct-child Markdown files and exclude INDEX.md and AGENTS.md. Templates live in the vault-level templates folder: ${markdownCodeSpan(`${templatesName}/`)}.`,
    ]),
    inbox: section([
      `# Inbox router: ${markdownCodeSpan(`${inboxName}/`)}`,
      "",
      "This folder holds unprocessed captures. Read captures before suggesting promotion; do not modify files unless asked.",
      "",
      authorityRule,
      "",
      `- [Vault index](../${routerIndexName})`,
      `- [Notes ${markdownCodeSpan(`${notesName}/`)} (${notesCount} Markdown files)](../${path(notesName)}/${routerIndexName})`,
      "",
      `Markdown captures: ${inboxCount}`,
      "",
      "Use the titles below to choose captures to read. Titles use the first non-empty body line or sentence, limited to 120 characters followed by ... when truncated. Read each file for its full content.",
      "",
      ...listing(inboxEntries, "Title"),
    ]),
    notes: section([
      `# Notes router: ${markdownCodeSpan(`${notesName}/`)}`,
      "",
      `Read relevant Markdown files directly and follow their wiki-link stems. New templates live in ${markdownCodeSpan(`${templatesName}/`)} at the vault root; treat legacy underscore-prefixed files as templates, not notes.`,
      "",
      authorityRule,
      "",
      `- [Vault index](../${routerIndexName})`,
      `- [Inbox ${markdownCodeSpan(`${inboxName}/`)} (${inboxCount} captures)](../${path(inboxName)}/${routerIndexName})`,
      "",
      `Markdown files: ${notesCount} (excludes INDEX.md and AGENTS.md).`,
      "",
      "Use the file descriptions below to choose notes to read. Descriptions come from YAML description, then title; read each file for its full content.",
      "",
      ...listing(notesEntries),
    ]),
  };
}

export function replaceRouterIndexSection(current: string, generated: string): string | undefined {
  const start = current.indexOf(routerIndexStart);
  const end = current.indexOf(routerIndexEnd);
  if (start < 0 && end < 0) return undefined;
  if (
    start < 0 ||
    end < start ||
    current.indexOf(routerIndexStart, start + routerIndexStart.length) >= 0 ||
    current.indexOf(routerIndexEnd, end + routerIndexEnd.length) >= 0
  ) {
    throw new Error("Malformed Stemlink-generated section in INDEX.md.");
  }
  const lineEnding = current.includes("\r\n") ? "\r\n" : "\n";
  const normalized = generated.replace(/\r?\n/g, lineEnding);
  let suffixStart = end + routerIndexEnd.length;
  if (current.startsWith("\r\n", suffixStart)) suffixStart += 2;
  else if (current.startsWith("\n", suffixStart)) suffixStart++;
  return current.slice(0, start) + normalized + current.slice(suffixStart);
}

export function frontMatter(
  text: string,
): { yaml: string; yamlStart: number; end: number } | undefined {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text);
  return match?.index === 0
    ? { yaml: match[1], yamlStart: match[0].indexOf("\n") + 1, end: match[0].length }
    : undefined;
}

export function metadataProblem(text: string): string | undefined {
  const matter = frontMatter(text);
  if (!matter) return "Missing YAML front matter with title and tags.";
  const document = parseDocument(matter.yaml, { uniqueKeys: true });
  if (document.errors.length) return `Invalid YAML front matter: ${document.errors[0].message}`;
  const value: unknown = document.toJS();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Front matter must contain title and tags.";
  }
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.title !== "string" ||
    !fields.title.trim() ||
    !Array.isArray(fields.tags) ||
    !fields.tags.every((tag) => typeof tag === "string")
  ) {
    return "Front matter must contain a non-empty title and a list of tags.";
  }
  return undefined;
}

export function makeNote(title: string, tags: string[], body = ""): string {
  return `---\n${noteMetadata(new Document(), title, tags)}---\n\n${body}`;
}

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function noteTags(text: string): {
  tags: string[];
  problem?: string;
  start?: number;
  end?: number;
} {
  const matter = frontMatter(text);
  if (!matter)
    return /^(?:\uFEFF)?---[ \t]*\r?\n/.test(text)
      ? {
          tags: [],
          problem: "Unclosed YAML front matter.",
          start: text.startsWith("\uFEFF") ? 1 : 0,
          end: text.startsWith("\uFEFF") ? 4 : 3,
        }
      : { tags: [] };
  const problem = (message: string, range?: readonly number[]) => ({
    tags: [],
    problem: message,
    ...(range ? { start: matter.yamlStart + range[0], end: matter.yamlStart + range[1] } : {}),
  });
  const document = parseDocument(matter.yaml, { uniqueKeys: true });
  if (document.errors.length)
    return problem(`Invalid YAML: ${document.errors[0].message}`, document.errors[0].pos);
  if (!isMap(document.contents))
    return problem("Front matter must be a YAML mapping.", document.contents?.range ?? undefined);
  let fields: Record<string, unknown>;
  try {
    fields = document.toJS();
  } catch (error) {
    return { tags: [], problem: `Cannot read YAML: ${String(error)}` };
  }
  const tags = fields.tags;
  if (tags === undefined) return { tags: [] };
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    const key = document.contents.items.find(
      (pair) => isScalar(pair.key) && pair.key.value === "tags",
    )?.key;
    return problem(
      "Tags must be a list of text values.",
      isScalar(key) ? (key.range ?? undefined) : undefined,
    );
  }
  return { tags: normalizeTags(tags) };
}

export function captureMetadata(text: string): { title?: string; tags?: string[] } {
  const document = captureFrontMatter(text);
  if (!document) return {};
  const fields: Record<string, unknown> = document.toJS();
  const title = fields.title;
  const tags = fields.tags;
  if (title !== undefined && typeof title !== "string")
    throw new Error("Capture title must be text.");
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")))
    throw new Error("Capture tags must be a list of text values.");
  return { title, tags };
}

function captureFrontMatter(text: string): Document | undefined {
  const matter = frontMatter(text);
  if (!matter) {
    if (/^(?:\uFEFF)?---[ \t]*\r?\n/.test(text))
      throw new Error("Capture has unclosed YAML front matter.");
    return undefined;
  }
  const document = parseDocument(matter.yaml, { uniqueKeys: true });
  if (document.errors.length) throw new Error("Capture has invalid YAML front matter.");
  if (!isMap(document.contents))
    throw new Error("Capture has invalid YAML: front matter must be a YAML mapping.");
  return document;
}

export function makeCapture(template: string, headline: string): string {
  const matter = frontMatter(template);
  if (!matter && /^(?:\uFEFF)?---[ \t]*\r?\n/.test(template))
    throw new Error("Capture template has unclosed YAML front matter.");
  const offset = matter?.end ?? (template.startsWith("\uFEFF") ? 1 : 0);
  const prefix = template.slice(0, offset);
  const newline = template.includes("\r\n") ? "\r\n" : "\n";
  const separator = matter ? (prefix.endsWith("\n") ? newline : newline.repeat(2)) : "";
  return `${prefix}${separator}# ${headline.trim()}${newline}${newline}${template.slice(offset)}`;
}

function noteMetadata(document: Document, title: string, tags: string[]): string {
  const sequence = document.createNode(tags);
  sequence.flow = true;
  document.set("title", title);
  document.set("tags", sequence);
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

export function promoteNote(text: string, title: string, tags: string[]): string {
  captureMetadata(text);
  const matter = frontMatter(text);
  if (!matter) {
    const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
    return bom + makeNote(title, tags, text.slice(bom.length));
  }
  const document = captureFrontMatter(text)!;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const yaml = noteMetadata(document, title, tags).replace(/\r?\n/g, newline);
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  return `${bom}---${newline}${yaml}---${newline}${text.slice(matter.end)}`;
}

export function slug(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "note"
  );
}

export function timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function linksIn(text: string): Link[] {
  const links: Link[] = [];
  const offset = frontMatter(text)?.end ?? 0;
  const lastTickRun = new Map<number, number>();
  for (const match of text.matchAll(/`+/g)) lastTickRun.set(match[0].length, match.index);
  let position = offset;
  let fence: { character: string; length: number } | undefined;
  let inlineTicks = 0;
  for (const line of text.slice(offset).split(/(?<=\n)/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (
        marker[0] === fence.character &&
        marker.length >= fence.length &&
        /^[ \t]*(?:\r?\n)?$/.test(line.slice(fenceMatch[0].length))
      )
        fence = undefined;
      position += line.length;
      continue;
    }
    if (!fence) {
      for (let i = 0; i < line.length;) {
        if (line[i] === "`") {
          let end = i + 1;
          while (line[end] === "`") end++;
          const count = end - i;
          if (!inlineTicks) {
            if ((lastTickRun.get(count) ?? -1) > position + i) inlineTicks = count;
          } else if (count === inlineTicks) inlineTicks = 0;
          i = end;
        } else if (!inlineTicks && line.startsWith("[[", i) && (i === 0 || line[i - 1] !== "\\")) {
          const end = line.indexOf("]]", i + 2);
          if (end < 0) {
            const stop = line.replace(/[\r\n]+$/, "").length;
            links.push({
              stem: line.slice(i + 2, stop),
              start: position + i,
              end: position + stop,
              valid: false,
            });
            break;
          }
          const stem = line.slice(i + 2, end);
          links.push({
            stem,
            start: position + i,
            end: position + end + 2,
            valid: stemPattern.test(stem),
          });
          i = end + 2;
        } else {
          i++;
        }
      }
    }
    position += line.length;
  }
  return links;
}

export interface NoteData {
  stem: string;
  name: string;
  text: string;
  links: Link[];
}

export interface Finding<T extends NoteData = NoteData> {
  note: T;
  start: number;
  end: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export function auditNotes<T extends NoteData>(notes: T[]): Finding<T>[] {
  notes = notes.filter((note) => !isExcludedNoteFile(note.name));
  const stems = new Set(notes.map((note) => note.stem));
  const incoming = new Set<string>();
  const findings: Finding<T>[] = [];
  const add = (note: T, severity: Finding["severity"], message: string, start = 0, end = 0) =>
    findings.push({ note, severity, message, start, end });
  for (const note of notes) {
    if (!filenamePattern.test(note.name)) add(note, "warning", "Invalid note filename.");
    const metadata = metadataProblem(note.text);
    if (metadata) add(note, "warning", metadata);
    let outgoing = 0;
    for (const link of note.links) {
      if (!link.valid) add(note, "warning", "Malformed reference.", link.start, link.end);
      else {
        outgoing++;
        if (!stems.has(link.stem))
          add(note, "error", `Note not found: ${link.stem}`, link.start, link.end);
        else if (note.stem !== link.stem) incoming.add(link.stem);
      }
    }
    if (!outgoing) add(note, "warning", "No outgoing references.");
  }
  for (const note of notes) {
    if (!incoming.has(note.stem)) add(note, "info", "No incoming references.");
  }
  return findings;
}
