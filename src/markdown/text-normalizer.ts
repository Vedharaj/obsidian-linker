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

  /**
   * Returns true if text contains at least one alphabetic character.
   */
  public static hasAlphabeticContent(text: string): boolean {
    return /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(text);
  }

  /**
   * Returns true if the string is merely a sequence of symbols (e.g. -----, ````, ===, ***, etc.)
   * or contains no alphabetic/alphanumeric word characters.
   */
  public static isSymbolSequence(text: string): boolean {
    if (!text) return true;
    const trimmed = text.trim();
    if (trimmed.length === 0) return true;

    // Reject pure symbols / markdown divider lines
    if (/^[-=`~_*#+.:/\\|<>?!@$%^&()[\]{}'"]+$/.test(trimmed)) {
      return true;
    }

    // Must have at least one letter or digit
    if (!/[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Detects and extracts all standard date formats (YYYY-MM-DD, DD-MM-YYYY, YYYY.MM.DD, YYYY_MM_DD,
   * Month DD YYYY, YYYYMMDD), separating date and clean keyword from phrases like:
   * "[keyword] [date]", "Meeting 2026-10-11", "2026-10-11 Meeting Notes", etc.
   */
  public static extractDateAndKeyword(text: string): { cleanKeyword: string; date?: string } {
    if (!text) return { cleanKeyword: "" };
    let raw = text.trim();

    // All date formats:
    const datePatterns = [
      // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, YYYY_MM_DD
      /\b\d{4}[-._/]\d{1,2}[-._/]\d{1,2}\b/i,
      // DD-MM-YYYY, MM-DD-YYYY, DD.MM.YYYY, DD/MM/YYYY
      /\b\d{1,2}[-._/]\d{1,2}[-._/]\d{4}\b/i,
      // Textual dates: "October 11, 2026", "Oct 11 2026", "11 October 2026", "11 Oct 2026"
      /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)),?\s+\d{4})\b/i,
      // Compact 8-digit date YYYYMMDD (1900-2099)
      /\b(19\d{2}|20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\b/,
    ];

    let foundDate: string | undefined;
    let withoutDate = raw;

    for (const pat of datePatterns) {
      const match = pat.exec(withoutDate);
      if (match) {
        foundDate = match[0];
        withoutDate =
          withoutDate.substring(0, match.index) + " " + withoutDate.substring(match.index + match[0].length);
        break;
      }
    }

    // Clean up leftover brackets, hyphens, and whitespace
    let cleanKeyword = withoutDate
      .replace(/[\[\](){}]/g, " ")
      .replace(/^[\s\-_:,]+|[\s\-_:,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      cleanKeyword,
      date: foundDate,
    };
  }

  /**
   * Strips numbering prefixes and suffixes from keywords:
   * e.g.:
   *   "5.[keyword]" -> "keyword"
   *   "[keyword 1]" -> "keyword"
   *   "[keyword-1]" -> "keyword"
   *   "5. Python"   -> "Python"
   *   "Python 1"    -> "Python"
   *   "Python-1"    -> "Python"
   *   "01 - Intro"  -> "Intro"
   */
  public static stripNumbering(text: string): string {
    if (!text) return "";
    let cleaned = text.trim();

    // 1. Unpack enclosing brackets if present: [keyword] or [keyword 1] or [keyword-1]
    cleaned = cleaned.replace(/^\[(.*?)\]$/, "$1").trim();

    // 2. Strip leading number prefixes like:
    // "5. ", "5.", "5.-", "5.[", "01 - ", "1_ ", "(1) ", "[1] "
    cleaned = cleaned.replace(/^(?:\(?\d+\)?|\[\d+\])[\.\-_:\s]+\[?/i, "").trim();
    // In case of "5.[keyword]": "5.[" stripped, trailing "]" might remain:
    cleaned = cleaned.replace(/\]$/, "").trim();

    // 3. Strip trailing numbering suffixes like:
    // " 1", "-1", "_1", " 02", "-02", " v2", " Part 1", " Vol 1", " [1]"
    cleaned = cleaned.replace(/[\s\-_]+(?:\[\d+\]|\(?\d+\)?|v\d+|part\s*\d+|vol\s*\d+)\s*$/i, "").trim();

    // 4. Strip any dangling brackets, hyphens or colons at edges
    cleaned = cleaned.replace(/^[\[\](){}\-_:,\s]+|[\[\](){}\-_:,\s]+$/g, "").trim();

    return cleaned;
  }
}
