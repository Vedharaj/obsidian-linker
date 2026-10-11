export interface LinkAnalysisResult {
  hasDirectLink: boolean;
  isReciprocal: boolean;
  sharedOutgoingCount: number;
  sharedIncomingCount: number;
  score: number;
  evidence: string[];
}

export class LinkAnalyzer {
  // noteId -> Set of outgoing note targets
  private outgoingLinks: Map<string, Set<string>>;
  // noteId -> Set of incoming note sources
  private incomingLinks: Map<string, Set<string>>;

  constructor() {
    this.outgoingLinks = new Map();
    this.incomingLinks = new Map();
  }

  public registerLinks(sourceId: string, targetIds: string[]): void {
    let outSet = this.outgoingLinks.get(sourceId);
    if (!outSet) {
      outSet = new Set();
      this.outgoingLinks.set(sourceId, outSet);
    }

    for (const target of targetIds) {
      outSet.add(target);

      let inSet = this.incomingLinks.get(target);
      if (!inSet) {
        inSet = new Set();
        this.incomingLinks.set(target, inSet);
      }
      inSet.add(sourceId);
    }
  }

  public analyzeRelationship(noteA: string, noteB: string): LinkAnalysisResult {
    const outA = this.outgoingLinks.get(noteA) || new Set();
    const outB = this.outgoingLinks.get(noteB) || new Set();

    const aLinksToB = outA.has(noteB);
    const bLinksToA = outB.has(noteA);
    const hasDirectLink = aLinksToB || bLinksToA;
    const isReciprocal = aLinksToB && bLinksToA;

    // Shared outgoing links (bibliographic coupling)
    let sharedOutgoingCount = 0;
    for (const t of outA) {
      if (outB.has(t)) sharedOutgoingCount++;
    }

    // Shared incoming links (co-citation)
    const inA = this.incomingLinks.get(noteA) || new Set();
    const inB = this.incomingLinks.get(noteB) || new Set();
    let sharedIncomingCount = 0;
    for (const s of inA) {
      if (inB.has(s)) sharedIncomingCount++;
    }

    const evidence: string[] = [];
    if (isReciprocal) {
      evidence.push("Reciprocal explicit wikilinks between notes");
    } else if (aLinksToB) {
      evidence.push(`Explicit wikilink from '${noteA}' to '${noteB}'`);
    } else if (bLinksToA) {
      evidence.push(`Explicit wikilink from '${noteB}' to '${noteA}'`);
    }

    if (sharedOutgoingCount > 0) {
      evidence.push(`Both notes reference ${sharedOutgoingCount} common notes`);
    }
    if (sharedIncomingCount > 0) {
      evidence.push(`Both notes are referenced by ${sharedIncomingCount} common notes`);
    }

    // Normalized link evidence score [0, 1]
    let score = 0;
    if (hasDirectLink) {
      score = isReciprocal ? 1.0 : 0.8;
    } else {
      const cooccurrences = sharedOutgoingCount + sharedIncomingCount;
      if (cooccurrences > 0) {
        score = Math.min(0.6, 0.15 * cooccurrences);
      }
    }

    return {
      hasDirectLink,
      isReciprocal,
      sharedOutgoingCount,
      sharedIncomingCount,
      score,
      evidence,
    };
  }

  public clear(): void {
    this.outgoingLinks.clear();
    this.incomingLinks.clear();
  }
}
