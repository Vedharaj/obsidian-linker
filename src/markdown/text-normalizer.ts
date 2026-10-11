import { TextRange } from "../types";

export interface DateMatch {
  raw: string;
  cleanDate: string;
  start: number;
  end: number;
  isoDate?: string;
}

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
   * Returns true if text matches any valid date format.
   */
  public static isDate(text: string): boolean {
    if (!text) return false;
    const clean = text.replace(/^[\[\](){}\s]+|[\[\](){}\s]+$/g, "").trim();
    if (clean.length < 4) return false;

    // YYYY-MM-DD or variant (YYYY/MM/DD, YYYY.MM.DD, YYYY_MM_DD)
    if (/^\d{4}[-._/]\d{1,2}[-._/]\d{1,2}$/.test(clean)) return true;
    // DD-MM-YYYY or variant (DD/MM/YYYY, DD.MM.YYYY, MM-DD-YYYY, MM/DD/YYYY)
    if (/^\d{1,2}[-._/]\d{1,2}[-._/]\d{4}$/.test(clean)) return true;
    // YYYY-MM
    if (/^\d{4}[-._/](?:0[1-9]|1[0-2])$/.test(clean)) return true;
    // 8-digit compact
    if (/^(?:19\d{2}|20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(clean)) return true;
    // Textual dates
    if (
      /^(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)),?\s+\d{4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{4})$/i.test(
        clean
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Normalizes a date string into ISO YYYY-MM-DD format if possible.
   */
  public static normalizeDateToISO(dateStr: string): string | undefined {
    if (!dateStr) return undefined;
    const clean = dateStr.replace(/^[\[\](){}\s]+|[\[\](){}\s]+$/g, "").trim();

    // 1. YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY_MM_DD
    const isoM = clean.match(/^(\d{4})[-._/](\d{1,2})[-._/](\d{1,2})$/);
    if (isoM) {
      return `${isoM[1]}-${isoM[2].padStart(2, "0")}-${isoM[3].padStart(2, "0")}`;
    }

    // 2. DD-MM-YYYY or MM-DD-YYYY
    const dmyM = clean.match(/^(\d{1,2})[-._/](\d{1,2})[-._/](\d{4})$/);
    if (dmyM) {
      return `${dmyM[3]}-${dmyM[2].padStart(2, "0")}-${dmyM[1].padStart(2, "0")}`;
    }

    // 3. 8-digit compact YYYYMMDD
    const compM = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compM) {
      return `${compM[1]}-${compM[2]}-${compM[3]}`;
    }

    // 4. Textual month dates: "October 11, 2026", "11 October 2026", "Oct 11 2026"
    const months: Record<string, string> = {
      jan: "01", january: "01",
      feb: "02", february: "02",
      mar: "03", march: "03",
      apr: "04", april: "04",
      may: "05",
      jun: "06", june: "06",
      jul: "07", july: "07",
      aug: "08", august: "08",
      sep: "09", sept: "09", september: "09",
      oct: "10", october: "10",
      nov: "11", november: "11",
      dec: "12", december: "12",
    };

    const textM1 = clean.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
    if (textM1) {
      const mStr = months[textM1[1].toLowerCase()];
      if (mStr) {
        return `${textM1[3]}-${mStr}-${textM1[2].padStart(2, "0")}`;
      }
    }

    const textM2 = clean.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+),?\s+(\d{4})$/i);
    if (textM2) {
      const mStr = months[textM2[2].toLowerCase()];
      if (mStr) {
        return `${textM2[3]}-${mStr}-${textM2[1].padStart(2, "0")}`;
      }
    }

    return undefined;
  }

  /**
   * Scans text and identifies all non-overlapping date occurrences.
   */
  public static findDateMatches(text: string): DateMatch[] {
    if (!text) return [];
    const results: DateMatch[] = [];
    const occupied: Array<{ start: number; end: number }> = [];

    const isOcc = (start: number, end: number) =>
      occupied.some((r) => start < r.end && end > r.start);

    const datePatterns: Array<{ regex: RegExp; isBracketed: boolean }> = [
      // 1. Bracketed numeric dates: [YYYY-MM-DD], [DD-MM-YYYY], [YYYY-MM]
      {
        regex: /\[(\d{4}[-._/]\d{1,2}[-._/]\d{1,2}|\d{1,2}[-._/]\d{1,2}[-._/]\d{4}|\d{4}[-._/]\d{1,2})\]/g,
        isBracketed: true,
      },
      // 2. Bracketed textual dates: [October 11, 2026], [11 October 2026], [October 2026]
      {
        regex: /\[((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)),?\s+\d{4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{4})\]/gi,
        isBracketed: true,
      },
      // 3. Unbracketed YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY_MM_DD
      {
        regex: /\b(\d{4}[-._/]\d{1,2}[-._/]\d{1,2})\b/g,
        isBracketed: false,
      },
      // 4. Unbracketed DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
      {
        regex: /\b(\d{1,2}[-._/]\d{1,2}[-._/]\d{4})\b/g,
        isBracketed: false,
      },
      // 5. Unbracketed textual dates
      {
        regex: /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)),?\s+\d{4})\b/gi,
        isBracketed: false,
      },
      // 6. Unbracketed Month YYYY
      {
        regex: /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember))\s+\d{4})\b/gi,
        isBracketed: false,
      },
      // 7. Unbracketed YYYY-MM
      {
        regex: /\b(\d{4}[-._/](?:0[1-9]|1[0-2]))\b/g,
        isBracketed: false,
      },
      // 8. 8-digit compact YYYYMMDD
      {
        regex: /\b((?:19\d{2}|20\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))\b/g,
        isBracketed: false,
      },
    ];

    for (const { regex } of datePatterns) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        let start = m.index;
        let end = m.index + m[0].length;
        let raw = m[0];
        let cleanDate = m[1] || m[0];

        // Check if unbracketed date happens to be enclosed by single brackets [date] in raw text
        if (
          !raw.startsWith("[") &&
          start > 0 &&
          end < text.length &&
          text[start - 1] === "[" &&
          text[end] === "]" &&
          (start === 1 || text[start - 2] !== "[") &&
          (end + 1 >= text.length || text[end + 1] !== "]")
        ) {
          start -= 1;
          end += 1;
          raw = text.substring(start, end);
        }

        if (isOcc(start, end)) continue;

        const isoDate = TextNormalizer.normalizeDateToISO(cleanDate);
        results.push({
          raw,
          cleanDate,
          start,
          end,
          isoDate,
        });
        occupied.push({ start, end });
      }
    }

    results.sort((a, b) => a.start - b.start);
    return results;
  }

  /**
   * Detects and extracts all standard date formats, separating date and clean keyword from phrases like:
   * "[keyword] [date]", "Meeting 2026-10-11", "2026-10-11 Meeting Notes", etc.
   */
  public static extractDateAndKeyword(text: string): { cleanKeyword: string; date?: string } {
    if (!text) return { cleanKeyword: "" };
    const dateMatches = TextNormalizer.findDateMatches(text);

    if (dateMatches.length === 0) {
      let cleanKeyword = text
        .replace(/[\[\](){}]/g, " ")
        .replace(/^[\s\-_:,]+|[\s\-_:,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return { cleanKeyword };
    }

    // Found date: remove it from keyword
    const dm = dateMatches[0];
    const withoutDate = text.substring(0, dm.start) + " " + text.substring(dm.end);

    let cleanKeyword = withoutDate
      .replace(/[\[\](){}]/g, " ")
      .replace(/^[\s\-_:,]+|[\s\-_:,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      cleanKeyword,
      date: dm.cleanDate,
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
