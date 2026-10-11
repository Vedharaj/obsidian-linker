import { LinkProposal } from "../types";
import { computeContentHash } from "../indexing/content-hash";

export interface RewriteResult {
  success: boolean;
  modifiedContent: string;
  appliedProposals: LinkProposal[];
  skippedProposals: LinkProposal[];
  originalContentHash: string;
  newContentHash: string;
  error?: string;
}

export class MarkdownRewriter {
  /**
   * Safely applies approved proposals to markdown text.
   * STRICT SAFETY:
   * 1. Validates content hash against proposal time.
   * 2. Sorts proposals in DESCENDING character offset order so string mutations do not invalidate offsets.
   * 3. Verifies that the text at [startOffset, endOffset] matches proposal.matchedText before slicing.
   */
  public static rewriteContent(rawContent: string, proposals: LinkProposal[]): RewriteResult {
    const originalHash = computeContentHash(rawContent);

    // Filter only approved proposals
    const approved = proposals.filter(p => p.status === "approved" || p.status === "pending");
    if (approved.length === 0) {
      return {
        success: true,
        modifiedContent: rawContent,
        appliedProposals: [],
        skippedProposals: [],
        originalContentHash: originalHash,
        newContentHash: originalHash,
      };
    }

    // Sort descending by startOffset
    const sortedDescending = [...approved].sort(
      (a, b) => (b.startOffset || 0) - (a.startOffset || 0)
    );

    let content = rawContent;
    const applied: LinkProposal[] = [];
    const skipped: LinkProposal[] = [];

    for (const p of sortedDescending) {
      if (p.startOffset === undefined || p.endOffset === undefined) {
        skipped.push(p);
        continue;
      }

      // Stale check
      if (p.originalContentHash && p.originalContentHash !== originalHash) {
        p.status = "stale";
        skipped.push(p);
        continue;
      }

      // Offset validity check
      if (p.startOffset < 0 || p.endOffset > content.length || p.startOffset >= p.endOffset) {
        skipped.push(p);
        continue;
      }

      // Verify text slice
      const actualSlice = content.substring(p.startOffset, p.endOffset);
      if (actualSlice.toLowerCase() !== p.matchedText.toLowerCase()) {
        skipped.push(p);
        continue;
      }

      // Perform slice replacement
      content =
        content.substring(0, p.startOffset) +
        p.replacementText +
        content.substring(p.endOffset);

      p.status = "applied";
      applied.push(p);
    }

    const newHash = computeContentHash(content);

    return {
      success: true,
      modifiedContent: content,
      appliedProposals: applied,
      skippedProposals: skipped,
      originalContentHash: originalHash,
      newContentHash: newHash,
    };
  }
}
