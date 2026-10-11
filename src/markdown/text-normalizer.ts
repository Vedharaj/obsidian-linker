import { TextRange } from "../types";

export class TextNormalizer {
  /**
   * Replaces all protected ranges with spaces of identical length.
   * This ensures character offsets in the resulting text exactly match the original markdown!
   */
  public static maskProtectedRanges(content: string, protectedRanges: TextRange[]): string {
    let result = "";
    let lastIndex = 0;

    for (const range of protectedRanges) {
      if (range.start > lastIndex) {
        result += content.substring(lastIndex, range.start);
      }
      // Fill with spaces and preserve newline characters so line numbers remain aligned
      const slice = content.substring(range.start, range.end);
      const masked = slice.replace(/[^\r\n]/g, " ");
      result += masked;
      lastIndex = range.end;
    }

    if (lastIndex < content.length) {
      result += content.substring(lastIndex);
    }

    return result;
  }

  /**
   * Normalizes a term or text segment for comparison (lowercased, trimmed, unified whitespace).
   */
  public static normalizeTerm(term: string): string {
    return term
      .toLowerCase()
      .trim()
      .replace(/[\s\t\r\n]+/g, " ");
  }

  /**
   * Cleans punctuation from plain text while preserving hyphenated technical words (RISC-V),
   * plus signs (C++), dots inside words (Node.js), and slashes (TCP/IP).
   */
  public static stripFormatting(text: string): string {
    // Remove markdown emphasis markers (*, _, ~), blockquote markers (>), headers (#), table borders (|)
    return text
      .replace(/^[\s]*[#>]+\s*/gm, " ") // leading headers & blockquotes
      .replace(/(?:^|\s)[*_-]{3,}(?:\s|$)/g, " ") // horizontal rules
      .replace(/[*~_]/g, " ") // bold/italic/strikethrough markers
      .replace(/[|]/g, " ") // markdown tables
      .replace(/[()[\]{}"'`]/g, " "); // brackets & quotes
  }
}
