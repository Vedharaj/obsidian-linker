import { describe, it, expect } from "vitest";
import { Tokenizer } from "../src/markdown/tokenizer";
import { TextNormalizer } from "../src/markdown/text-normalizer";
import { ProtectedRangeDetector } from "../src/markdown/protected-ranges";

describe("Tokenizer and Normalizer", () => {
  const stopwords = ["the", "a", "an", "in", "on", "of", "and", "is", "for", "with"];
  const tokenizer = new Tokenizer(stopwords);

  it("normalizes text deterministically and unifies whitespace", () => {
    const raw = "   Neural   Networks \n\r and   Machine   Learning  ";
    const normalized = TextNormalizer.normalizeTerm(raw);
    expect(normalized).toBe("neural networks and machine learning");
  });

  it("preserves technical identifiers without mutilation", () => {
    const text = "We run RISC-V benchmarks using gem5 and DRAMSim2 alongside C++ and Node.js with TF-IDF.";
    const tokens = tokenizer.tokenizeWords(text);
    const terms = tokens.map((t) => t.term);

    expect(terms).toContain("risc-v");
    expect(terms).toContain("gem5");
    expect(terms).toContain("dramsim2");
    expect(terms).toContain("c++");
    expect(terms).toContain("node.js");
    expect(terms).toContain("tf-idf");
  });

  it("filters single-word stopwords while allowing them in multi-word phrases", () => {
    const text = "The state of the art in machine learning is neural networks.";
    const { terms, termFrequencies } = tokenizer.extractInformativeTerms(text);

    // Stopwords should not appear as standalone 1-grams
    expect(termFrequencies.has("the")).toBe(false);
    expect(termFrequencies.has("of")).toBe(false);
    expect(termFrequencies.has("is")).toBe(false);
    expect(termFrequencies.has("in")).toBe(false);

    // Informative 1-grams should be present
    expect(termFrequencies.has("machine")).toBe(true);
    expect(termFrequencies.has("learning")).toBe(true);
    expect(termFrequencies.has("neural")).toBe(true);
    expect(termFrequencies.has("networks")).toBe(true);

    // Informative 2-grams
    expect(termFrequencies.has("machine learning")).toBe(true);
    expect(termFrequencies.has("neural networks")).toBe(true);

    // Informative multi-word phrases with inner stop words
    expect(termFrequencies.has("state of the art")).toBe(true);
  });

  it("masks protected ranges while preserving exact string offsets", () => {
    const markdown = `# Introduction
Here is some code:
\`\`\`typescript
const secret = "should not be tokenized as ordinary keywords";
\`\`\`
And inline \`const x = 42;\` followed by [[Existing Note|Link]].
`;
    const ranges = ProtectedRangeDetector.findProtectedRanges(markdown);
    expect(ranges.length).toBeGreaterThanOrEqual(3);

    const masked = TextNormalizer.maskProtectedRanges(markdown, ranges);

    // Length must be identical to original markdown!
    expect(masked.length).toBe(markdown.length);

    // Fenced code block content must be replaced with spaces
    expect(masked.includes("should not be tokenized")).toBe(false);
    // Wikilink inner text must be masked
    expect(masked.includes("[[Existing Note|Link]]")).toBe(false);
    // Unprotected prose must remain
    expect(masked.includes("Here is some code:")).toBe(true);
  });
});
