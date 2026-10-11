import { SparseVector } from "./tfidf";
import { ParsedHeading } from "../markdown/markdown-parser";
import { TextNormalizer } from "../markdown/text-normalizer";

export interface ExtractedKeyword {
  term: string;
  weight: number;
  isHeading: boolean;
  isAlias: boolean;
}

export class KeywordExtractor {
  /**
   * Extracts the top distinctive keywords for a note, boosting terms that
   * appear in headings or aliases.
   */
  public static extractTopKeywords(
    vector: SparseVector,
    headings: ParsedHeading[],
    aliases: string[],
    limit = 20
  ): ExtractedKeyword[] {
    const headingTerms = new Set<string>();
    for (const h of headings) {
      const normalized = TextNormalizer.normalizeTerm(h.text);
      headingTerms.add(normalized);
      for (const word of normalized.split(/\s+/)) {
        if (word.length > 2) headingTerms.add(word);
      }
    }

    const aliasTerms = new Set<string>();
    for (const a of aliases) {
      const normalized = TextNormalizer.normalizeTerm(a);
      aliasTerms.add(normalized);
    }

    const candidates: ExtractedKeyword[] = [];

    for (const [term, rawWeight] of vector.entries()) {
      if (TextNormalizer.isSymbolSequence(term) || !TextNormalizer.hasAlphabeticContent(term)) {
        continue;
      }
      let weight = rawWeight;
      const isHeading = headingTerms.has(term);
      const isAlias = aliasTerms.has(term);

      if (isHeading) weight *= 1.5;
      if (isAlias) weight *= 2.0;

      candidates.push({
        term,
        weight,
        isHeading,
        isAlias,
      });
    }

    candidates.sort((a, b) => b.weight - a.weight);
    return candidates.slice(0, limit);
  }
}
