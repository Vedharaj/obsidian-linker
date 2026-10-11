import { NoteRecord } from "../types";
import { TextNormalizer } from "../markdown/text-normalizer";

export interface TargetMatchInfo {
  targetPath: string;
  matchedAs: "title" | "alias";
  isAmbiguous: boolean;
  competingPaths?: string[];
}

export class TitleIndex {
  // Normalized term -> list of candidate target note paths
  private titleMap: Map<string, string[]> = new Map();
  private aliasMap: Map<string, string[]> = new Map();
  // Sorted list of search phrases (longest first)
  private sortedPhrases: Array<{ phrase: string; type: "title" | "alias" }> = [];

  public buildIndex(notes: Map<string, NoteRecord>, matchAliases = true): void {
    this.titleMap.clear();
    this.aliasMap.clear();
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
    }

    // Build sorted list of search phrases, descending by phrase length
    const phraseSet = new Set<string>();

    for (const phrase of this.titleMap.keys()) {
      this.sortedPhrases.push({ phrase, type: "title" });
      phraseSet.add(phrase);
    }

    for (const phrase of this.aliasMap.keys()) {
      if (!phraseSet.has(phrase)) {
        this.sortedPhrases.push({ phrase, type: "alias" });
      }
    }

    // Longest phrase first
    this.sortedPhrases.sort((a, b) => b.phrase.length - a.phrase.length);
  }

  public getSortedPhrases(): Array<{ phrase: string; type: "title" | "alias" }> {
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

    return undefined;
  }
}
