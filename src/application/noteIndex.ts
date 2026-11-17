import { Link, NoteData } from '../core/documents';

export interface NoteReference<Note extends NoteData> {
  note: Note;
  link: Link;
}

export class NoteIndex<Note extends NoteData> {
  private readonly notes = new Map<string, Note>();
  private readonly incoming = new Map<string, NoteReference<Note>[]>();

  get all(): Note[] {
    return [...this.notes.values()];
  }

  get(stem: string): Note | undefined {
    return this.notes.get(stem);
  }

  references(stem: string): NoteReference<Note>[] {
    return this.incoming.get(stem) ?? [];
  }

  clear(): void {
    this.notes.clear();
    this.incoming.clear();
  }

  reset(notes: Iterable<Note>): void {
    this.clear();
    for (const note of notes) this.replace(note);
  }

  replace(note: Note): void {
    const previous = this.notes.get(note.stem);
    if (previous) this.removeReferences(previous);
    this.notes.set(note.stem, note);
    for (const link of note.links) {
      if (!link.valid) continue;
      const references = this.incoming.get(link.stem) ?? [];
      references.push({ note, link });
      this.incoming.set(link.stem, references);
    }
  }

  remove(stem: string): void {
    const note = this.notes.get(stem);
    if (!note) return;
    this.removeReferences(note);
    this.notes.delete(stem);
  }

  private removeReferences(note: Note): void {
    for (const target of new Set(note.links.map((link) => link.stem))) {
      const references = (this.incoming.get(target) ?? []).filter(
        (reference) => reference.note.stem !== note.stem,
      );
      if (references.length) this.incoming.set(target, references);
      else this.incoming.delete(target);
    }
  }
}
