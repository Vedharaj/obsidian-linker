import { NoteRecord, RelationshipRecord, SimilaritySettings } from "../types";
import { InvertedIndex } from "../indexing/inverted-index";
import { SparseVector } from "../indexing/tfidf";
import { RelationshipScorer } from "./relationship-scorer";

export class CandidateGenerator {
  private invertedIndex: InvertedIndex;
  private scorer: RelationshipScorer;
  private settings: SimilaritySettings;

  constructor(
    invertedIndex: InvertedIndex,
    scorer: RelationshipScorer,
    settings: SimilaritySettings
  ) {
    this.invertedIndex = invertedIndex;
    this.scorer = scorer;
    this.settings = settings;
  }

  public updateSettings(settings: SimilaritySettings): void {
    this.settings = settings;
  }

  /**
   * Generates scored relationships for a specific note against candidate notes.
   */
  public generateForNote(
    noteId: string,
    notesMap: Map<string, NoteRecord>,
    vectorsMap: Map<string, SparseVector>
  ): RelationshipRecord[] {
    const noteA = notesMap.get(noteId);
    const vecA = vectorsMap.get(noteId);
    if (!noteA || !vecA) return [];

    const termsA = this.invertedIndex.getTermsForNote(noteId);
    const candidateMap = this.invertedIndex.findCandidates(noteId, this.settings.minSharedKeywords);

    const results: RelationshipRecord[] = [];

    for (const [candidateId, shared] of candidateMap.entries()) {
      if (candidateId === noteId) continue;

      const noteB = notesMap.get(candidateId);
      const vecB = vectorsMap.get(candidateId);
      if (!noteB || !vecB) continue;

      const termsB = this.invertedIndex.getTermsForNote(candidateId);
      const scored = this.scorer.scorePair(noteA, vecA, termsA, noteB, vecB, termsB);

      if (scored.score >= this.settings.minSimilarityThreshold || scored.relationshipType === "explicit") {
        results.push(scored);
      }
    }

    // Sort descending by score and slice to max neighbors
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, this.settings.maxNeighborsPerNote);
  }

  /**
   * Generates all relationships across the vault using canonical pair deduplication.
   */
  public generateAll(
    notesMap: Map<string, NoteRecord>,
    vectorsMap: Map<string, SparseVector>,
    onBatch?: (processedNotes: number, totalNotes: number, foundPairs: number) => Promise<void> | void
  ): Promise<RelationshipRecord[]> {
    return new Promise(async (resolve) => {
      const canonicalRelationships = new Map<string, RelationshipRecord>();
      const noteIds = Array.from(notesMap.keys());

      for (let i = 0; i < noteIds.length; i++) {
        const noteId = noteIds[i];
        const forNote = this.generateForNote(noteId, notesMap, vectorsMap);

        for (const rel of forNote) {
          const key = `${rel.sourceId}:::${rel.targetId}`;
          const existing = canonicalRelationships.get(key);
          if (!existing || rel.score > existing.score) {
            canonicalRelationships.set(key, rel);
          }
        }

        if (onBatch && (i % 5 === 0 || i === noteIds.length - 1)) {
          await onBatch(i + 1, noteIds.length, canonicalRelationships.size);
        }
      }

      resolve(Array.from(canonicalRelationships.values()));
    });
  }
}
