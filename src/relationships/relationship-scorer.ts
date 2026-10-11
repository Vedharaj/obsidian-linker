import { NoteRecord, RelationshipRecord, RelationshipType, ScoringWeights } from "../types";
import { SparseVector } from "../indexing/tfidf";
import { CosineSimilarity } from "./cosine-similarity";
import { KeywordOverlap } from "./keyword-overlap";
import { LinkAnalyzer } from "./link-analyzer";
import { TextNormalizer } from "../markdown/text-normalizer";

export class RelationshipScorer {
  private weights: ScoringWeights;
  private linkAnalyzer: LinkAnalyzer;

  constructor(weights: ScoringWeights, linkAnalyzer: LinkAnalyzer) {
    this.weights = weights;
    this.linkAnalyzer = linkAnalyzer;
  }

  public updateWeights(weights: ScoringWeights): void {
    this.weights = weights;
  }

  public scorePair(
    noteA: NoteRecord,
    vecA: SparseVector,
    termsA: Set<string>,
    noteB: NoteRecord,
    vecB: SparseVector,
    termsB: Set<string>
  ): RelationshipRecord {
    const evidence: string[] = [];

    // 1. TF-IDF Cosine similarity
    const tfidfScore = CosineSimilarity.calculate(vecA, vecB);
    if (tfidfScore >= 0.2) {
      evidence.push(`TF-IDF cosine similarity: ${(tfidfScore * 100).toFixed(1)}%`);
    }

    // 2. Keyword overlap
    const { score: keywordScore, sharedTerms } = KeywordOverlap.calculateOverlap(termsA, termsB);
    if (sharedTerms.length > 0) {
      const displayTerms = sharedTerms.slice(0, 5).join(", ");
      const moreCount = sharedTerms.length > 5 ? ` (+${sharedTerms.length - 5} more)` : "";
      evidence.push(`Shared terms: [${displayTerms}${moreCount}]`);
    }

    // 3. Link analysis
    const linkResult = this.linkAnalyzer.analyzeRelationship(noteA.id, noteB.id);
    evidence.push(...linkResult.evidence);

    // 4. Heading & Title alignment
    let headingScore = 0;
    const titleA = TextNormalizer.normalizeTerm(noteA.title);
    const titleB = TextNormalizer.normalizeTerm(noteB.title);

    const checkHeadingMatch = (title: string, headings?: string[]): boolean => {
      if (!headings || !title) return false;
      return headings.some(h => TextNormalizer.normalizeTerm(h).includes(title));
    };

    const bHasTitleAInHeadings = checkHeadingMatch(titleA, noteB.headings);
    const aHasTitleBInHeadings = checkHeadingMatch(titleB, noteA.headings);

    if (bHasTitleAInHeadings || aHasTitleBInHeadings) {
      headingScore = 1.0;
      evidence.push("Note title corresponds directly to heading in partner note");
    }

    // Combine using weights
    const totalWeight =
      this.weights.tfidf + this.weights.keyword + this.weights.link + this.weights.heading;
    const norm = totalWeight > 0 ? totalWeight : 1;

    const rawCombined =
      (this.weights.tfidf * tfidfScore +
        this.weights.keyword * keywordScore +
        this.weights.link * linkResult.score +
        this.weights.heading * headingScore) /
      norm;

    const combinedScore = Math.min(1, Math.round(rawCombined * 10000) / 10000);

    // Determine primary relationship type
    let relationshipType: RelationshipType = "tfidf";
    if (linkResult.hasDirectLink) {
      relationshipType = "explicit";
    } else if (linkResult.sharedIncomingCount + linkResult.sharedOutgoingCount > 1) {
      relationshipType = "cooccurrence";
    } else if (keywordScore > tfidfScore && sharedTerms.length >= 3) {
      relationshipType = "keyword";
    }

    // Canonical source and target order (lexicographical) for undirected symmetric relationship
    const [sourceId, targetId] = noteA.id < noteB.id ? [noteA.id, noteB.id] : [noteB.id, noteA.id];

    return {
      sourceId,
      targetId,
      score: combinedScore,
      relationshipType,
      sharedTerms,
      evidence,
      status: linkResult.hasDirectLink ? "existing" : "suggested",
      computedAt: Date.now(),
    };
  }
}
