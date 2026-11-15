import { Document, parseDocument } from "yaml";

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

export function isRouterIndex(name: string): boolean {
  return name.toLowerCase() === routerIndexName.toLowerCase();
}

export function isVaultInstructionFile(name: string): boolean {
  return isRouterIndex(name) || name.toLowerCase() === agentInstructionsName.toLowerCase();
}

export interface RouterIndexContent {
  root: string;
  inbox: string;
  notes: string;
}

export function markdownCodeSpan(value: string): string {
  let delimiter = "`";
  while (value.includes(delimiter)) delimiter += "`";
  return `${delimiter}${value}${delimiter}`;
}

export function renderRouterIndexes(
  rootName: string,
  inboxName: string,
  notesName: string,
  inboxCount: number,
  notesCount: number,
): RouterIndexContent {
  const path = (name: string) => encodeURIComponent(name);
  const section = (lines: string[]) => [
    routerIndexStart,
    ...lines,
    routerIndexEnd,
    "",
  ].join("\n");
  const authorityRule =
    "Navigation only, not authoritative. Stemlink's in-memory note/reference index is authoritative for live vault state.";
  return {
    root: section([
      `# Zettelkasten router: ${markdownCodeSpan(`${rootName}/`)}`,
      "",
      "Start here. Use the folder indexes to route work, then read the relevant Markdown files directly.",
      "",
      authorityRule,
      "",
      `- [Inbox ${markdownCodeSpan(`${inboxName}/`)} (${inboxCount} captures)](./${path(inboxName)}/${routerIndexName})`,
      `- [Notes ${markdownCodeSpan(`${notesName}/`)} (${notesCount} Markdown files)](./${path(notesName)}/${routerIndexName})`,
      "",
      "Counts cover direct-child Markdown files and exclude INDEX.md and AGENTS.md. Underscore-prefixed templates in the notes folder are included.",
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
    ]),
    notes: section([
      `# Notes router: ${markdownCodeSpan(`${notesName}/`)}`,
      "",
      "Read relevant Markdown files directly and follow their wiki-link stems. Treat underscore-prefixed files as templates, not notes.",
      "",
      authorityRule,
      "",
      `- [Vault index](../${routerIndexName})`,
      `- [Inbox ${markdownCodeSpan(`${inboxName}/`)} (${inboxCount} captures)](../${path(inboxName)}/${routerIndexName})`,
      "",
      `Markdown files: ${notesCount} (excludes INDEX.md and AGENTS.md).`,
    ]),
  };
}

export function replaceRouterIndexSection(current: string, generated: string): string | undefined {
  const start = current.indexOf(routerIndexStart);
  const end = current.indexOf(routerIndexEnd);
  if (start < 0 && end < 0) return undefined;
  if (start < 0 || end < start || current.indexOf(routerIndexStart, start + routerIndexStart.length) >= 0 ||
      current.indexOf(routerIndexEnd, end + routerIndexEnd.length) >= 0) {
    throw new Error("Malformed Stemlink-generated section in INDEX.md.");
  }
  const lineEnding = current.includes("\r\n") ? "\r\n" : "\n";
  const normalized = generated.replace(/\r?\n/g, lineEnding);
  let suffixStart = end + routerIndexEnd.length;
  if (current.startsWith("\r\n", suffixStart)) suffixStart += 2;
  else if (current.startsWith("\n", suffixStart)) suffixStart++;
  return current.slice(0, start) + normalized +
    current.slice(suffixStart);
}

export function frontMatter(text: string): { yaml: string; end: number } | undefined {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text);
  return match?.index === 0 ? { yaml: match[1], end: match[0].length } : undefined;
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
  if (typeof fields.title !== "string" || !fields.title.trim() ||
      !Array.isArray(fields.tags) || !fields.tags.every(tag => typeof tag === "string")) {
    return "Front matter must contain a non-empty title and a list of tags.";
  }
  return undefined;
}

export function makeNote(title: string, tags: string[], body = ""): string {
  return `---\n${noteMetadata(new Document(), title, tags)}---\n\n${body}`;
}

function noteMetadata(document: Document, title: string, tags: string[]): string {
  const sequence = document.createNode(tags);
  sequence.flow = true;
  document.set("title", title);
  document.set("tags", sequence);
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
}

export function promoteNote(text: string, title: string, tags: string[]): string {
  const matter = frontMatter(text);
  if (!matter) {
    if (/^(?:\uFEFF)?---[ \t]*\r?\n/.test(text)) throw new Error("Capture has unclosed YAML front matter.");
    return makeNote(title, tags, text);
  }
  const document = parseDocument(matter.yaml, { uniqueKeys: true });
  if (document.errors.length || (document.contents && !document.contents.toJSON())) {
    throw new Error("Capture has invalid YAML front matter.");
  }
  const value: unknown = document.toJS();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Capture front matter must be a YAML mapping.");
  }
  return `---\n${noteMetadata(document, title, tags)}---\n${text.slice(matter.end)}`;
}

export function slug(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80).replace(/-+$/g, "") || "note";
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
      else if (marker[0] === fence.character && marker.length >= fence.length &&
          /^[ \t]*(?:\r?\n)?$/.test(line.slice(fenceMatch[0].length))) fence = undefined;
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
          }
          else if (count === inlineTicks) inlineTicks = 0;
          i = end;
        } else if (!inlineTicks && line.startsWith("[[", i) && (i === 0 || line[i - 1] !== "\\")) {
          const end = line.indexOf("]]", i + 2);
          if (end < 0) {
            const stop = line.replace(/[\r\n]+$/, "").length;
            links.push({ stem: line.slice(i + 2, stop), start: position + i, end: position + stop, valid: false });
            break;
          }
          const stem = line.slice(i + 2, end);
          links.push({ stem, start: position + i, end: position + end + 2, valid: stemPattern.test(stem) });
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
  notes = notes.filter(note => !isVaultInstructionFile(note.name));
  const stems = new Set(notes.map(note => note.stem));
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
        if (!stems.has(link.stem)) add(note, "error", `Note not found: ${link.stem}`, link.start, link.end);
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
