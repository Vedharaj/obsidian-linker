import { TextNormalizer } from "./text-normalizer";

export interface TokenOccurrence {
  term: string;
  originalText: string;
  offset: number;
  length: number;
}

export class Tokenizer {
  private stopwords: Set<string>;

  constructor(stopwords: string[] = []) {
    this.stopwords = new Set(stopwords.map(w => w.toLowerCase().trim()));
  }

  public setStopwords(stopwords: string[]): void {
    this.stopwords = new Set(stopwords.map(w => w.toLowerCase().trim()));
  }

  public isStopword(word: string): boolean {
    return this.stopwords.has(word.toLowerCase());
  }

  /**
   * Tokenizes text into individual words while preserving technical identifiers,
   * offsets, and original tokens.
   */
  public tokenizeWords(text: string): TokenOccurrence[] {
    const tokens: TokenOccurrence[] = [];
    // Matches technical tokens: e.g. c++, c#, node.js, risc-v, tf-idf, dramsim2, or alphanumeric sequences
    const tokenRegex = /[a-zA-Z0-9]+(?:[+]{2}|[#])|[a-zA-Z0-9]+(?:[-_.][a-zA-Z0-9]+)*/g;

    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const original = match[0];
      const normalized = TextNormalizer.normalizeTerm(original);

      // Skip lone punctuation or numbers-only single digits if desired, but keep meaningful identifiers
      if (normalized.length === 0) continue;

      tokens.push({
        term: normalized,
        originalText: original,
        offset: match.index,
        length: original.length,
      });
    }

    return tokens;
  }

  /**
   * Generates informative terms:
   * - 1-grams (excluding stop words and very short tokens unless technical like 'c++')
   * - 2-grams and 3-grams where outer words are not stop words
   */
  public extractInformativeTerms(text: string): {
    terms: string[];
    termFrequencies: Map<string, number>;
  } {
    const wordTokens = this.tokenizeWords(text);
    const termFrequencies = new Map<string, number>();
    const terms: string[] = [];

    const addTerm = (term: string) => {
      terms.push(term);
      termFrequencies.set(term, (termFrequencies.get(term) || 0) + 1);
    };

    // 1-grams
    for (const t of wordTokens) {
      if (this.isStopword(t.term)) continue;
      if (t.term.length < 2 && !["c", "r"].includes(t.term)) continue;
      // Skip pure digits
      if (/^\d+$/.test(t.term)) continue;
      addTerm(t.term);
    }

    // 2-grams (both informative), 3-grams (w2 stopword), 4-grams (w2,w3 stopwords)
    for (let i = 0; i < wordTokens.length; i++) {
      const w1 = wordTokens[i].term;
      if (this.isStopword(w1) || /^\d+$/.test(w1)) continue;

      // 2-gram: w1 w2 (both non-stopwords)
      if (i + 1 < wordTokens.length) {
        const w2 = wordTokens[i + 1].term;
        if (!this.isStopword(w2) && !/^\d+$/.test(w2)) {
          addTerm(`${w1} ${w2}`);
        }

        // 3-gram: w1 [stopword] w3 (e.g. "proof of concept", "state of art")
        if (i + 2 < wordTokens.length) {
          const w3 = wordTokens[i + 2].term;
          if (this.isStopword(w2) && !this.isStopword(w3) && !/^\d+$/.test(w3)) {
            addTerm(`${w1} ${w2} ${w3}`);
          }

          // 4-gram: w1 [stopword] [stopword] w4 (e.g. "state of the art")
          if (i + 3 < wordTokens.length) {
            const w4 = wordTokens[i + 3].term;
            if (this.isStopword(w2) && this.isStopword(w3) && !this.isStopword(w4) && !/^\d+$/.test(w4)) {
              addTerm(`${w1} ${w2} ${w3} ${w4}`);
            }
          }
        }
      }
    }

    return { terms, termFrequencies };
  }
}
