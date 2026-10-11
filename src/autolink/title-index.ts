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

  public buildIndex(
    notes: Map<string, NoteRecord>,
    matchAliases = true,
    matchHeadings = true
  ): void {
    this.titleMap.clear();
    this.aliasMap.clear();
    this.keywordMap.clear();
    this.headingMap.clear();
    this.sortedPhrases = [];

    for (const note of notes.values()) {
      // Index title
      const normTitle = TextNormalizer.normalizeTerm(note.title);
      if (normTitle.length >= 2) {
        const paths = this.titleMap.get(normTitle) || [];
        if (!paths.includes(note.path)) paths.push(note.path);
        this.titleMap.set(normTitle, paths);
      }

      // Index aliases
      if (matchAliases && note.aliases) {
        for (const alias of note.aliases) {
          const normAlias = TextNormalizer.normalizeTerm(alias);
          if (normAlias.length >= 2) {
            const paths = this.aliasMap.get(normAlias) || [];
            if (!paths.includes(note.path)) paths.push(note.path);
            this.aliasMap.set(normAlias, paths);
          }
        }
      }

      // Index headings
      if (matchHeadings && note.headings) {
        for (const heading of note.headings) {
          const normHeading = TextNormalizer.normalizeTerm(heading);
          if (normHeading.length >= 3 && !this.titleMap.has(normHeading)) {
            const list = this.headingMap.get(normHeading) || [];
            list.push({ path: note.path, heading });
            this.headingMap.set(normHeading, list);
          }
        }
      }
    }

    this.rebuildSortedPhrases();
  }

  /**
   * Fast population directly from vault files and metadata cache.
   * Runs in milliseconds without reading disk content.
   */
  public buildFromVaultFiles(
    files: Array<{ path: string; basename: string }>,
    getMetadata?: (path: string) => { aliases?: string[]; headings?: string[] } | undefined,
    options: { matchAliases?: boolean; matchHeadings?: boolean } = {}
  ): void {
    this.titleMap.clear();
    this.aliasMap.clear();
    this.keywordMap.clear();
    this.headingMap.clear();
    this.sortedPhrases = [];

    const matchAliases = options.matchAliases !== false;
    const matchHeadings = options.matchHeadings !== false;

    for (const file of files) {
      // 1. Title
      const normTitle = TextNormalizer.normalizeTerm(file.basename);
      if (normTitle.length >= 2) {
        const paths = this.titleMap.get(normTitle) || [];
        if (!paths.includes(file.path)) paths.push(file.path);
        this.titleMap.set(normTitle, paths);
      }

      // 2. Metadata (aliases & headings)
      if (getMetadata) {
        const meta = getMetadata(file.path);
        if (meta) {
          if (matchAliases && meta.aliases) {
            for (const alias of meta.aliases) {
              const normAlias = TextNormalizer.normalizeTerm(alias);
              if (normAlias.length >= 2) {
                const paths = this.aliasMap.get(normAlias) || [];
                if (!paths.includes(file.path)) paths.push(file.path);
                this.aliasMap.set(normAlias, paths);
              }
            }
          }

          if (matchHeadings && meta.headings) {
            for (const heading of meta.headings) {
              const normH = TextNormalizer.normalizeTerm(heading);
              if (normH.length >= 3 && !this.titleMap.has(normH)) {
                const list = this.headingMap.get(normH) || [];
                list.push({ path: file.path, heading });
                this.headingMap.set(normH, list);
              }
            }
          }
        }
      }
    }

    this.rebuildSortedPhrases();
  }

  /**
   * Adds extracted keywords for a note.
   */
  public addKeywordsForNote(path: string, keywords: string[]): void {
    for (const kw of keywords) {
      const norm = TextNormalizer.normalizeTerm(kw);
      if (norm.length >= 3 && !this.titleMap.has(norm) && !this.aliasMap.has(norm)) {
        const paths = this.keywordMap.get(norm) || [];
        if (!paths.includes(path)) paths.push(path);
        this.keywordMap.set(norm, paths);
      }
    }
    this.rebuildSortedPhrases();
  }

  public rebuildSortedPhrases(): void {
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

    // 4. Keywords
    for (const phrase of this.keywordMap.keys()) {
      if (!phraseMap.has(phrase)) {
        phraseMap.set(phrase, "keyword");
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
