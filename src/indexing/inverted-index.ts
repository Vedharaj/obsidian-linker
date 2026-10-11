/**
 * Inverted Index mapping terms to note IDs with frequency counts.
 * Supports efficient candidate retrieval and incremental additions/removals.
 */
export class InvertedIndex {
  // term -> (noteId -> termFrequency)
  private index: Map<string, Map<string, number>>;
  // noteId -> Set of terms
  private noteTerms: Map<string, Set<string>>;
  // Total number of unique notes in index
  private totalNotes: number;

  constructor() {
    this.index = new Map();
    this.noteTerms = new Map();
    this.totalNotes = 0;
  }

  public get size(): number {
    return this.totalNotes;
  }

  public get termCount(): number {
    return this.index.size;
  }

  /**
   * Adds or updates a note's term frequencies in the inverted index.
   */
  public addNote(noteId: string, frequencies: Map<string, number>): void {
    // If note already existed, remove previous terms first
    if (this.noteTerms.has(noteId)) {
      this.removeNote(noteId);
    }

    const termsSet = new Set<string>();

    for (const [term, freq] of frequencies.entries()) {
      termsSet.add(term);
      let posting = this.index.get(term);
      if (!posting) {
        posting = new Map<string, number>();
        this.index.set(term, posting);
      }
      posting.set(noteId, freq);
    }

    this.noteTerms.set(noteId, termsSet);
    this.totalNotes++;
  }

  /**
   * Removes a note and updates document frequencies.
   */
  public removeNote(noteId: string): void {
    const terms = this.noteTerms.get(noteId);
    if (!terms) return;

    for (const term of terms) {
      const posting = this.index.get(term);
      if (posting) {
        posting.delete(noteId);
        if (posting.size === 0) {
          this.index.delete(term);
        }
      }
    }

    this.noteTerms.delete(noteId);
    this.totalNotes = Math.max(0, this.totalNotes - 1);
  }

  /**
   * Returns Document Frequency: how many notes contain this term.
   */
  public getDocumentFrequency(term: string): number {
    const posting = this.index.get(term);
    return posting ? posting.size : 0;
  }

  /**
   * Returns all note IDs containing the given term.
   */
  public getNotesForTerm(term: string): string[] {
    const posting = this.index.get(term);
    return posting ? Array.from(posting.keys()) : [];
  }

  /**
   * Returns all terms present in a specific note.
   */
  public getTermsForNote(noteId: string): Set<string> {
    return this.noteTerms.get(noteId) || new Set<string>();
  }

  /**
   * Returns candidate notes that share at least `minSharedTerms` with the target note,
   * excluding the target note itself.
   */
  public findCandidates(noteId: string, minSharedTerms = 1): Map<string, string[]> {
    const candidateToSharedTerms = new Map<string, string[]>();
    const terms = this.noteTerms.get(noteId);
    if (!terms) return candidateToSharedTerms;

    for (const term of terms) {
      const posting = this.index.get(term);
      if (!posting) continue;

      for (const otherNoteId of posting.keys()) {
        if (otherNoteId === noteId) continue;

        let shared = candidateToSharedTerms.get(otherNoteId);
        if (!shared) {
          shared = [];
          candidateToSharedTerms.set(otherNoteId, shared);
        }
        shared.push(term);
      }
    }

    // Filter candidates below minSharedTerms threshold
    if (minSharedTerms > 1) {
      for (const [candId, shared] of candidateToSharedTerms.entries()) {
        if (shared.length < minSharedTerms) {
          candidateToSharedTerms.delete(candId);
        }
      }
    }

    return candidateToSharedTerms;
  }

  public clear(): void {
    this.index.clear();
    this.noteTerms.clear();
    this.totalNotes = 0;
  }
}
