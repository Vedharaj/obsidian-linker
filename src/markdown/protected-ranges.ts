import { TextRange } from "../types";

export class ProtectedRangeDetector {
  /**
   * Scans markdown content and identifies all protected ranges that must not be
   * modified or treated as generic search text (code fences, inline code, wikilinks,
   * markdown links, URLs, frontmatter, html comments).
   */
  public static findProtectedRanges(content: string): TextRange[] {
    const ranges: TextRange[] = [];

    // 1. YAML frontmatter at start of file
    const frontmatterMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (frontmatterMatch && frontmatterMatch.index === 0) {
      ranges.push({
        start: 0,
        end: frontmatterMatch[0].length,
        type: "frontmatter",
        rawText: frontmatterMatch[0],
      });
    }

    // 2. HTML comments: <!-- ... -->
    const commentRegex = /<!--[\s\S]*?-->/g;
    let match: RegExpExecArray | null;
    while ((match = commentRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "code_fence", // protected
        rawText: match[0],
      });
    }

    // 3. Fenced code blocks: ```...``` or ~~~...~~~
    const codeFenceRegex = /(?:```[^\n]*\r?\n[\s\S]*?\r?\n```|~~~[^\n]*\r?\n[\s\S]*?\r?\n~~~)/g;
    while ((match = codeFenceRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "code_fence",
        rawText: match[0],
      });
    }

    // 4. Inline code: `...`
    const inlineCodeRegex = /`[^`\r\n]+`/g;
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "inline_code",
        rawText: match[0],
      });
    }

    // 5. Wikilinks: [[target|alias]] or [[target]]
    const wikilinkRegex = /\[\[[^\]\r\n]+\]\]/g;
    while ((match = wikilinkRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "wikilink",
        rawText: match[0],
      });
    }

    // 6. Markdown links & images: ![alt](url) or [text](url)
    const mdLinkRegex = /!?\[[^\]\r\n]*\]\([^\)\r\n]+\)/g;
    while ((match = mdLinkRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "markdown_link",
        rawText: match[0],
      });
    }

    // 7. Bare URLs: https?://...
    const urlRegex = /https?:\/\/[^\s\)\],]+/g;
    while ((match = urlRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "url",
        rawText: match[0],
      });
    }

    // Sort by start offset and merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start);
    return this.mergeOverlappingRanges(ranges);
  }

  private static mergeOverlappingRanges(ranges: TextRange[]): TextRange[] {
    if (ranges.length <= 1) return ranges;

    const merged: TextRange[] = [];
    let current = { ...ranges[0] };

    for (let i = 1; i < ranges.length; i++) {
      const next = ranges[i];
      if (next.start < current.end) {
        // Overlap: extend end if needed
        if (next.end > current.end) {
          current.end = next.end;
        }
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
    return merged;
  }

  /**
   * Checks if an offset range [start, end) intersects with any protected range.
   */
  public static isRangeProtected(start: number, end: number, protectedRanges: TextRange[]): boolean {
    for (const pr of protectedRanges) {
      if (start < pr.end && end > pr.start) {
        return true;
      }
      if (pr.start >= end) {
        break; // since ranges are sorted
      }
    }
    return false;
  }
}
