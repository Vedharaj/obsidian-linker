import { AutolinkSettings, LinkProposal } from "../types";
import { TitleIndex } from "./title-index";
import { AliasResolver } from "./alias-resolver";
import { MarkdownParser } from "../markdown/markdown-parser";
import { computeContentHash } from "../indexing/content-hash";
import { TextNormalizer } from "../markdown/text-normalizer";

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

      // RULE: If linkOnlyTitleHeading is set, skip inferred keywords completely
      if (this.settings.linkOnlyTitleHeading && type === "keyword") {
        continue;
      }

      // RULE: Skip any sequence of symbols
      if (TextNormalizer.isSymbolSequence(phrase) || (!TextNormalizer.hasAlphabeticContent(phrase) && !TextNormalizer.isDate(phrase))) {
        continue;
      }

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
        let matchedText = match[1] || match[0];

        // Skip any sequence of symbols
        if (TextNormalizer.isSymbolSequence(matchedText) || (!TextNormalizer.hasAlphabeticContent(matchedText) && !TextNormalizer.isDate(matchedText))) {
          continue;
        }

        let startOffset = match.index + (match[0].indexOf(matchedText));
        let endOffset = startOffset + matchedText.length;

        // Check if matched term is enclosed by single square brackets [term] in raw content
        // e.g. [Sprint Planning] -> absorb brackets so replacement is [[Sprint Planning]]
        if (
          startOffset > 0 &&
          endOffset < rawContent.length &&
          rawContent[startOffset - 1] === "[" &&
          rawContent[endOffset] === "]" &&
          (startOffset === 1 || rawContent[startOffset - 2] !== "[") &&
          (endOffset + 1 >= rawContent.length || rawContent[endOffset + 1] !== "]")
        ) {
          startOffset -= 1;
          endOffset += 1;
          matchedText = rawContent.substring(startOffset, endOffset);
        }

        if (isOccupied(startOffset, endOffset)) {
          continue;
        }

        const cleanForWikilink = matchedText.replace(/^\[(.*)\]$/, "$1");
        const replacementText = AliasResolver.formatWikilink(
          targetInfo.targetPath,
          cleanForWikilink,
          targetInfo.subpath
        );

        const scoreMap: Record<string, number> = {
          title: 1.0,
          alias: 0.95,
          heading: 0.90,
          keyword: 0.85,
          date: 0.95,
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

    // RULE: All date formats as separate links (never combined with keywords)
    if (this.settings.linkDates !== false) {
      const dateMatches = TextNormalizer.findDateMatches(masked);
      for (const dm of dateMatches) {
        if (proposalCount >= this.settings.maxLinksPerNote) break;
        if (isOccupied(dm.start, dm.end)) continue;

        // Resolve target in vault if a matching date note exists
        const candidateTargets = [dm.cleanDate, dm.isoDate].filter(Boolean) as string[];
        let targetPath = dm.cleanDate;
        let foundExistingNote = false;

        for (const candidate of candidateTargets) {
          const info = this.titleIndex.resolveTarget(candidate);
          if (info) {
            targetPath = info.targetPath;
            foundExistingNote = true;
            break;
          }
        }

        // Avoid self-referencing if current note IS this date note
        if (foundExistingNote && targetPath === sourcePath) {
          continue;
        }
        if (sourcePath.endsWith("/" + dm.cleanDate + ".md") || sourcePath === dm.cleanDate + ".md") {
          continue;
        }

        // Format replacement wikilink
        let replacementText: string;
        if (foundExistingNote) {
          replacementText = AliasResolver.formatWikilink(targetPath, dm.cleanDate);
        } else {
          replacementText = `[[${dm.cleanDate}]]`;
        }

        const proposalId = `prop_${sourcePath}_${dm.start}_${Date.now()}`;
        proposals.push({
          id: proposalId,
          sourcePath,
          targetPath: targetPath.endsWith(".md") ? targetPath : `${targetPath}.md`,
          matchedText: dm.raw,
          replacementText,
          matchType: "date",
          score: 0.95,
          startOffset: dm.start,
          endOffset: dm.end,
          originalContentHash: contentHash,
          status: "pending",
          createdAt: Date.now(),
        });

        occupiedRanges.push({ start: dm.start, end: dm.end });
        proposalCount++;
      }
    }

    // Sort proposals by start offset ascending
    proposals.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));
    return proposals;
  }
}
