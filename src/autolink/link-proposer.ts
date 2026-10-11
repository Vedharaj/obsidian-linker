import { AutolinkSettings, LinkProposal } from "../types";
import { TitleIndex } from "./title-index";
import { AliasResolver } from "./alias-resolver";
import { MarkdownParser } from "../markdown/markdown-parser";
import { computeContentHash } from "../indexing/content-hash";

export class LinkProposer {
  private titleIndex: TitleIndex;
  private settings: AutolinkSettings;

  constructor(titleIndex: TitleIndex, settings: AutolinkSettings) {
    this.titleIndex = titleIndex;
    this.settings = settings;
  }

  public updateSettings(settings: AutolinkSettings): void {
    this.settings = settings;
  }

  /**
   * Generates candidate link proposals for a source markdown note.
   */
  public generateProposals(sourcePath: string, rawContent: string): LinkProposal[] {
    const parsed = MarkdownParser.parse(rawContent);
    const masked = parsed.maskedContent;
    const contentHash = computeContentHash(rawContent);

    const proposals: LinkProposal[] = [];
    const occupiedRanges: Array<{ start: number; end: number }> = [];

    // Also mark already existing wikilinks and protected ranges as occupied
    for (const pr of parsed.protectedRanges) {
      occupiedRanges.push({ start: pr.start, end: pr.end });
    }

    const isOccupied = (start: number, end: number): boolean => {
      return occupiedRanges.some(r => start < r.end && end > r.start);
    };

    const sortedPhrases = this.titleIndex.getSortedPhrases();
    let proposalCount = 0;

    for (const { phrase, type } of sortedPhrases) {
      if (proposalCount >= this.settings.maxLinksPerNote) break;

      const targetInfo = this.titleIndex.resolveTarget(phrase);
      if (!targetInfo) continue;

      // RULE: Strictly avoid self-referencing links
      if (targetInfo.targetPath === sourcePath) continue;

      // RULE: Check ambiguity
      if (targetInfo.isAmbiguous && this.settings.disambiguateDuplicates) {
        continue; // Skip ambiguous aliases
      }

      // Escape regex special chars in phrase
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flags = this.settings.caseSensitive ? "g" : "gi";

      // Word boundary regex
      const regex = this.settings.requireWordBoundary
        ? new RegExp(`(?:^|(?<=[^a-zA-Z0-9_]))(${escapedPhrase})(?=[^a-zA-Z0-9_]|$)`, flags)
        : new RegExp(`(${escapedPhrase})`, flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(masked)) !== null) {
        if (proposalCount >= this.settings.maxLinksPerNote) break;

        // Group 1 contains the matched text
        const matchedText = match[1] || match[0];
        const startOffset = match.index + (match[0].indexOf(matchedText));
        const endOffset = startOffset + matchedText.length;

        if (isOccupied(startOffset, endOffset)) {
          continue;
        }

        const replacementText = AliasResolver.formatWikilink(
          targetInfo.targetPath,
          matchedText,
          targetInfo.subpath
        );

        const scoreMap: Record<string, number> = {
          title: 1.0,
          alias: 0.95,
          heading: 0.90,
          keyword: 0.85,
        };

        const proposalId = `prop_${sourcePath}_${startOffset}_${Date.now()}`;
        proposals.push({
          id: proposalId,
          sourcePath,
          targetPath: targetInfo.targetPath,
          matchedText,
          replacementText,
          matchType: type,
          score: scoreMap[type] || 0.8,
          startOffset,
          endOffset,
          originalContentHash: contentHash,
          status: "pending",
          createdAt: Date.now(),
        });

        occupiedRanges.push({ start: startOffset, end: endOffset });
        proposalCount++;
      }
    }

    // Sort proposals by start offset ascending
    proposals.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));
    return proposals;
  }
}
