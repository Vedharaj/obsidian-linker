import { NoteRecord, MatchType } from "../types";
import { TextNormalizer } from "../markdown/text-normalizer";

export interface TargetMatchInfo {
  targetPath: string;
  matchedAs: MatchType;
  isAmbiguous: boolean;
  competingPaths?: string[];
  subpath?: string;
}

export class TitleIndex {
  // Normalized term -> list of candidate target note paths
  private titleMap: Map<string, string[]> = new Map();
  private aliasMap: Map<string, string[]> = new Map();
  private keywordMap: Map<string, string[]> = new Map();
  private headingMap: Map<string, Array<{ path: string; heading: string }>> = new Map();
  // Sorted list of search phrases (longest first)
  private sortedPhrases: Array<{ phrase: string; type: MatchType }> = [];

  public get phraseCount(): number {
    return this.sortedPhrases.length;
  }

  public get titleCount(): number {
    return this.titleMap.size;
  }

  public get aliasCount(): number {
    return this.aliasMap.size;
  }

  public get headingCount(): number {
    return this.headingMap.size;
  }

  public get keywordCount(): number {
    return this.keywordMap.size;
  }

  public buildIndex(
    notes: Map<string, NoteRecord>,
    matchAliases = true,
    matchHeadings = true,
    linkOnlyTitleHeading = false
  ): void {
    this.titleMap.clear();
    this.aliasMap.clear();
    this.keywordMap.clear();
    this.headingMap.clear();
    this.sortedPhrases = [];

    for (const note of notes.values()) {
      // 1. Title
      this.indexTitleWithVariants(note.title, note.path);

      // 2. Aliases
      if (matchAliases && note.aliases) {
        for (const alias of note.aliases) {
          this.indexAliasWithVariants(alias, note.path);
        }
      }

      // 3. Headings
      if (matchHeadings && note.headings) {
        for (const heading of note.headings) {
          this.indexHeadingWithVariants(heading, note.path);
        }
      }
    }

    this.rebuildSortedPhrases(linkOnlyTitleHeading);
  }

  /**
   * Fast population directly from vault files and metadata cache.
   * Runs in milliseconds without reading disk content.
   */
  public buildFromVaultFiles(
    files: Array<{ path: string; basename: string }>,
    getMetadata?: (path: string) => { aliases?: string[]; headings?: string[] } | undefined,
    options: { matchAliases?: boolean; matchHeadings?: boolean; linkOnlyTitleHeading?: boolean } = {}
  ): void {
    this.titleMap.clear();
    this.aliasMap.clear();
    this.keywordMap.clear();
    this.headingMap.clear();
    this.sortedPhrases = [];

    const matchAliases = options.matchAliases !== false;
    const matchHeadings = options.matchHeadings !== false;
    const linkOnlyTitleHeading = options.linkOnlyTitleHeading === true;

    for (const file of files) {
      // 1. Title
      this.indexTitleWithVariants(file.basename, file.path);

      // 2. Metadata (aliases & headings)
      if (getMetadata) {
        const meta = getMetadata(file.path);
        if (meta) {
          if (matchAliases && meta.aliases) {
            for (const alias of meta.aliases) {
              this.indexAliasWithVariants(alias, file.path);
            }
          }

          if (matchHeadings && meta.headings) {
            for (const heading of meta.headings) {
              this.indexHeadingWithVariants(heading, file.path);
            }
          }
        }
      }
    }

    this.rebuildSortedPhrases(linkOnlyTitleHeading);
  }

  /**
   * Adds extracted keywords for a note, stripping symbol sequences, dates, and numbers.
   */
  public addKeywordsForNote(path: string, keywords: string[], linkOnlyTitleHeading = false): void {
    if (linkOnlyTitleHeading) return;

    for (const kw of keywords) {
      if (TextNormalizer.isSymbolSequence(kw)) continue;
      if (!TextNormalizer.hasAlphabeticContent(kw) && !TextNormalizer.isDate(kw)) continue;

      const dateExt = TextNormalizer.extractDateAndKeyword(kw);
      if (dateExt.date && dateExt.cleanKeyword.length >= 2) {
        const cleanKw = TextNormalizer.stripNumbering(dateExt.cleanKeyword);
        if (cleanKw && cleanKw.length >= 2) {
          this.addKeywordPhrase(cleanKw, path);
        }
      } else {
        const cleanKw = TextNormalizer.stripNumbering(kw);
        this.addKeywordPhrase(cleanKw || kw, path);
      }
    }

    this.rebuildSortedPhrases(linkOnlyTitleHeading);
  }

  private indexTitleWithVariants(rawTitle: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(rawTitle)) return;
    if (!TextNormalizer.hasAlphabeticContent(rawTitle) && !TextNormalizer.isDate(rawTitle)) return;

    const dateExt = TextNormalizer.extractDateAndKeyword(rawTitle);
    if (dateExt.date && dateExt.cleanKeyword.length >= 2) {
      // It has both a date AND a keyword (e.g. "Meeting 2026-10-11")!
      // RULE: Date must NOT be included with any linker/keyword!
      // Index ONLY the clean keyword:
      this.addTitlePhrase(dateExt.cleanKeyword, path);
      const cleanNum = TextNormalizer.stripNumbering(dateExt.cleanKeyword);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== dateExt.cleanKeyword.toLowerCase()) {
        this.addTitlePhrase(cleanNum, path);
      }
    } else {
      // Either purely a date ("2026-10-11") or normal title without date ("Neural Networks")
      this.addTitlePhrase(rawTitle, path);
      const cleanNum = TextNormalizer.stripNumbering(rawTitle);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== rawTitle.toLowerCase()) {
        this.addTitlePhrase(cleanNum, path);
      }
    }
  }

  private indexAliasWithVariants(rawAlias: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(rawAlias)) return;
    if (!TextNormalizer.hasAlphabeticContent(rawAlias) && !TextNormalizer.isDate(rawAlias)) return;

    const dateExt = TextNormalizer.extractDateAndKeyword(rawAlias);
    if (dateExt.date && dateExt.cleanKeyword.length >= 2) {
      this.addAliasPhrase(dateExt.cleanKeyword, path);
      const cleanNum = TextNormalizer.stripNumbering(dateExt.cleanKeyword);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== dateExt.cleanKeyword.toLowerCase()) {
        this.addAliasPhrase(cleanNum, path);
      }
    } else {
      this.addAliasPhrase(rawAlias, path);
      const cleanNum = TextNormalizer.stripNumbering(rawAlias);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== rawAlias.toLowerCase()) {
        this.addAliasPhrase(cleanNum, path);
      }
    }
  }

  private indexHeadingWithVariants(rawHeading: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(rawHeading)) return;
    if (!TextNormalizer.hasAlphabeticContent(rawHeading) && !TextNormalizer.isDate(rawHeading)) return;

    const dateExt = TextNormalizer.extractDateAndKeyword(rawHeading);
    if (dateExt.date && dateExt.cleanKeyword.length >= 2) {
      this.addHeadingPhrase(dateExt.cleanKeyword, path, rawHeading);
      const cleanNum = TextNormalizer.stripNumbering(dateExt.cleanKeyword);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== dateExt.cleanKeyword.toLowerCase()) {
        this.addHeadingPhrase(cleanNum, path, rawHeading);
      }
    } else {
      this.addHeadingPhrase(rawHeading, path, rawHeading);
      const cleanNum = TextNormalizer.stripNumbering(rawHeading);
      if (cleanNum && cleanNum.length >= 2 && cleanNum.toLowerCase() !== rawHeading.toLowerCase()) {
        this.addHeadingPhrase(cleanNum, path, rawHeading);
      }
    }
  }

  private addTitlePhrase(phrase: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(phrase)) return;
    if (!TextNormalizer.hasAlphabeticContent(phrase) && !TextNormalizer.isDate(phrase)) return;
    const norm = TextNormalizer.normalizeTerm(phrase);
    if (norm.length < 2) return;
    const paths = this.titleMap.get(norm) || [];
    if (!paths.includes(path)) paths.push(path);
    this.titleMap.set(norm, paths);
  }

  private addAliasPhrase(phrase: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(phrase)) return;
    if (!TextNormalizer.hasAlphabeticContent(phrase) && !TextNormalizer.isDate(phrase)) return;
    const norm = TextNormalizer.normalizeTerm(phrase);
    if (norm.length < 2) return;
    const paths = this.aliasMap.get(norm) || [];
    if (!paths.includes(path)) paths.push(path);
    this.aliasMap.set(norm, paths);
  }

  private addHeadingPhrase(phrase: string, path: string, originalHeading: string): void {
    if (TextNormalizer.isSymbolSequence(phrase)) return;
    if (!TextNormalizer.hasAlphabeticContent(phrase) && !TextNormalizer.isDate(phrase)) return;
    const norm = TextNormalizer.normalizeTerm(phrase);
    if (norm.length < 2) return;
    if (this.titleMap.has(norm)) return; // Title takes precedence

    const list = this.headingMap.get(norm) || [];
    if (!list.some(h => h.path === path && h.heading === originalHeading)) {
      list.push({ path, heading: originalHeading });
    }
    this.headingMap.set(norm, list);
  }

  private addKeywordPhrase(phrase: string, path: string): void {
    if (TextNormalizer.isSymbolSequence(phrase)) return;
    if (!TextNormalizer.hasAlphabeticContent(phrase) && !TextNormalizer.isDate(phrase)) return;
    const norm = TextNormalizer.normalizeTerm(phrase);
    if (norm.length < 2) return;
    if (this.titleMap.has(norm) || this.aliasMap.has(norm)) return;

    const paths = this.keywordMap.get(norm) || [];
    if (!paths.includes(path)) paths.push(path);
    this.keywordMap.set(norm, paths);
  }

  public rebuildSortedPhrases(linkOnlyTitleHeading = false): void {
    this.sortedPhrases = [];
    const phraseMap = new Map<string, MatchType>();

    // 1. Titles
    for (const phrase of this.titleMap.keys()) {
      phraseMap.set(phrase, "title");
    }

    // 2. Aliases
    for (const phrase of this.aliasMap.keys()) {
      if (!phraseMap.has(phrase)) {
        phraseMap.set(phrase, "alias");
      }
    }

    // 3. Headings
    for (const phrase of this.headingMap.keys()) {
      if (!phraseMap.has(phrase)) {
        phraseMap.set(phrase, "heading");
      }
    }

    // 4. Keywords (only if not linkOnlyTitleHeading)
    if (!linkOnlyTitleHeading) {
      for (const phrase of this.keywordMap.keys()) {
        if (!phraseMap.has(phrase)) {
          phraseMap.set(phrase, "keyword");
        }
      }
    }

    for (const [phrase, type] of phraseMap.entries()) {
      this.sortedPhrases.push({ phrase, type });
    }

    // Longest phrase first for greedy substring matching
    this.sortedPhrases.sort((a, b) => {
      const lenDiff = b.phrase.length - a.phrase.length;
      if (lenDiff !== 0) return lenDiff;
      // Secondary: priority title > alias > heading > keyword
      const priority: Record<MatchType, number> = { title: 4, alias: 3, heading: 2, keyword: 1 };
      return priority[b.type] - priority[a.type];
    });
  }

  public getSortedPhrases(): Array<{ phrase: string; type: MatchType }> {
    return this.sortedPhrases;
  }

  public resolveTarget(phrase: string): TargetMatchInfo | undefined {
    const norm = TextNormalizer.normalizeTerm(phrase);

    // Prefer title match
    const titlePaths = this.titleMap.get(norm);
    if (titlePaths && titlePaths.length > 0) {
      return {
        targetPath: titlePaths[0],
        matchedAs: "title",
        isAmbiguous: titlePaths.length > 1,
        competingPaths: titlePaths,
      };
    }

    // Fall back to alias match
    const aliasPaths = this.aliasMap.get(norm);
    if (aliasPaths && aliasPaths.length > 0) {
      return {
        targetPath: aliasPaths[0],
        matchedAs: "alias",
        isAmbiguous: aliasPaths.length > 1,
        competingPaths: aliasPaths,
      };
    }

    // Fall back to heading match
    const headingEntries = this.headingMap.get(norm);
    if (headingEntries && headingEntries.length > 0) {
      const first = headingEntries[0];
      return {
        targetPath: first.path,
        matchedAs: "heading",
        isAmbiguous: headingEntries.length > 1,
        competingPaths: headingEntries.map(h => h.path),
        subpath: first.heading,
      };
    }

    // Fall back to keyword match
    const kwPaths = this.keywordMap.get(norm);
    if (kwPaths && kwPaths.length > 0) {
      return {
        targetPath: kwPaths[0],
        matchedAs: "keyword",
        isAmbiguous: kwPaths.length > 1,
        competingPaths: kwPaths,
      };
    }

    return undefined;
  }
}
