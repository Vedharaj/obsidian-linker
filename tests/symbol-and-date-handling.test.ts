import { describe, it, expect } from "vitest";
import { TextNormalizer } from "../src/markdown/text-normalizer";
import { TitleIndex } from "../src/autolink/title-index";
import { LinkProposer } from "../src/autolink/link-proposer";
import { MarkdownRewriter } from "../src/autolink/markdown-rewriter";

describe("Symbol sequence filtering, numbering stripping, date separation, and title/heading mode", () => {
  it("detects and skips all sequence of symbols like -----, ````, ====", () => {
    const symbolSequences = [
      "-----",
      "=====",
      "````",
      "```",
      "***",
      "___",
      "---",
      "###",
      ":::",
      "----````===",
      "===---***",
    ];

    for (const seq of symbolSequences) {
      expect(TextNormalizer.isSymbolSequence(seq)).toBe(true);
      expect(TextNormalizer.hasAlphabeticContent(seq)).toBe(false);
    }

    // Valid terms should NOT be marked as pure symbol sequences
    expect(TextNormalizer.isSymbolSequence("Neural Networks")).toBe(false);
    expect(TextNormalizer.isSymbolSequence("C++")).toBe(false);
    expect(TextNormalizer.isSymbolSequence("Node.js")).toBe(false);
    expect(TextNormalizer.isSymbolSequence("RISC-V")).toBe(false);
  });

  it("strips numbering prefixes and suffixes from keywords: 5.[keyword], [keyword 1], [keyword-1]", () => {
    expect(TextNormalizer.stripNumbering("5.[keyword]")).toBe("keyword");
    expect(TextNormalizer.stripNumbering("[keyword 1]")).toBe("keyword");
    expect(TextNormalizer.stripNumbering("[keyword-1]")).toBe("keyword");
    expect(TextNormalizer.stripNumbering("5. Python")).toBe("Python");
    expect(TextNormalizer.stripNumbering("Python 1")).toBe("Python");
    expect(TextNormalizer.stripNumbering("Python-1")).toBe("Python");
    expect(TextNormalizer.stripNumbering("Python_1")).toBe("Python");
    expect(TextNormalizer.stripNumbering("01 - Data Structures")).toBe("Data Structures");
    expect(TextNormalizer.stripNumbering("[Deep Learning]")).toBe("Deep Learning");
  });

  it("extracts and separates all standard date formats from [keyword] [date]", () => {
    // YYYY-MM-DD
    const r1 = TextNormalizer.extractDateAndKeyword("Meeting Notes 2026-10-11");
    expect(r1.date).toBe("2026-10-11");
    expect(r1.cleanKeyword).toBe("Meeting Notes");

    // [keyword] [date]
    const r2 = TextNormalizer.extractDateAndKeyword("[Sprint Planning] [2026-10-11]");
    expect(r2.date).toBe("2026-10-11");
    expect(r2.cleanKeyword).toBe("Sprint Planning");

    // [date] [keyword]
    const r3 = TextNormalizer.extractDateAndKeyword("2024-05-15 Daily Log");
    expect(r3.date).toBe("2024-05-15");
    expect(r3.cleanKeyword).toBe("Daily Log");

    // YYYY.MM.DD
    const r4 = TextNormalizer.extractDateAndKeyword("Project Update 2024.05.15");
    expect(r4.date).toBe("2024.05.15");
    expect(r4.cleanKeyword).toBe("Project Update");

    // DD-MM-YYYY
    const r5 = TextNormalizer.extractDateAndKeyword("Report 15-05-2024");
    expect(r5.date).toBe("15-05-2024");
    expect(r5.cleanKeyword).toBe("Report");

    // Textual month: October 11, 2026
    const r6 = TextNormalizer.extractDateAndKeyword("Conference Notes October 11, 2026");
    expect(r6.date).toBe("October 11, 2026");
    expect(r6.cleanKeyword).toBe("Conference Notes");
  });

  it("indexes clean keyword from numbered and dated notes and generates clean wikilinks", () => {
    const titleIndex = new TitleIndex();

    // Vault files with numbering and dates
    titleIndex.buildFromVaultFiles([
      { path: "Notes/5. [Python 1] 2026-10-11.md", basename: "5. [Python 1] 2026-10-11" },
      { path: "Notes/Meeting Notes 2026-10-11.md", basename: "Meeting Notes 2026-10-11" },
      { path: "Notes/Algorithms.md", basename: "Algorithms" },
    ], (path) => {
      if (path === "Notes/Algorithms.md") {
        return {
          headings: ["1. Binary Search", "----", "====="], // Contains divider symbols to skip!
        };
      }
      return undefined;
    });

    const phrases = titleIndex.getSortedPhrases();

    // Verify symbol sequences like "----" or "=====" were NEVER added as phrases
    expect(phrases.some(p => p.phrase === "----" || p.phrase === "=====")).toBe(false);

    // Verify clean keyword "Python" was extracted and indexed
    const targetPython = titleIndex.resolveTarget("Python");
    expect(targetPython).toBeDefined();
    expect(targetPython?.targetPath).toBe("Notes/5. [Python 1] 2026-10-11.md");

    // Verify clean keyword "Meeting Notes" was extracted and indexed
    const targetMeeting = titleIndex.resolveTarget("Meeting Notes");
    expect(targetMeeting).toBeDefined();
    expect(targetMeeting?.targetPath).toBe("Notes/Meeting Notes 2026-10-11.md");

    // Verify clean heading "Binary Search" was extracted from "1. Binary Search"
    const targetBS = titleIndex.resolveTarget("Binary Search");
    expect(targetBS).toBeDefined();
    expect(targetBS?.matchedAs).toBe("heading");

    // Now test LinkProposer on prose mentioning Python, Meeting Notes, and Binary Search
    const proposer = new LinkProposer(titleIndex, {
      autoWriteEnabled: false,
      maxLinksPerNote: 10,
      requireWordBoundary: true,
      caseSensitive: false,
      matchAliases: true,
      disambiguateDuplicates: true,
      linkHeadings: true,
      linkKeywords: true,
    });

    const doc = `
# Summary
We reviewed Meeting Notes today.
We also learned Python and implemented Binary Search.
Divider line below:
-----
\`\`\`
====
`;

    const proposals = proposer.generateProposals("Notes/Daily.md", doc);

    // Proposals should contain Meeting Notes, Python, Binary Search
    // And NEVER propose links for "-----" or "===="
    expect(proposals.some(p => p.matchedText === "-----" || p.matchedText === "====")).toBe(false);

    const propPython = proposals.find(p => p.matchedText === "Python");
    expect(propPython).toBeDefined();
    expect(propPython?.replacementText).toBe("[[5. [Python 1] 2026-10-11|Python]]");

    const propMeeting = proposals.find(p => p.matchedText === "Meeting Notes");
    expect(propMeeting).toBeDefined();
    expect(propMeeting?.replacementText).toBe("[[Meeting Notes 2026-10-11|Meeting Notes]]");

    const propBS = proposals.find(p => p.matchedText === "Binary Search");
    expect(propBS).toBeDefined();
    expect(propBS?.replacementText).toBe("[[Algorithms#1. Binary Search|Binary Search]]");

    // Apply rewrite
    const res = MarkdownRewriter.rewriteContent(doc, proposals);
    expect(res.success).toBe(true);
    expect(res.modifiedContent).toContain("[[5. [Python 1] 2026-10-11|Python]]");
    expect(res.modifiedContent).toContain("[[Meeting Notes 2026-10-11|Meeting Notes]]");
    expect(res.modifiedContent).toContain("[[Algorithms#1. Binary Search|Binary Search]]");
  });

  it("respects linkOnlyTitleHeading by ignoring inferred keywords", () => {
    const titleIndex = new TitleIndex();

    titleIndex.buildFromVaultFiles([
      { path: "Notes/Deep Learning.md", basename: "Deep Learning" },
    ], (path) => {
      return {
        headings: ["Neural Networks"],
      };
    });

    // Add inferred keywords
    titleIndex.addKeywordsForNote("Notes/Deep Learning.md", ["backpropagation", "loss function"]);

    // Test with linkOnlyTitleHeading = true
    const proposerTitleOnly = new LinkProposer(titleIndex, {
      autoWriteEnabled: false,
      linkOnlyTitleHeading: true,
      maxLinksPerNote: 10,
      requireWordBoundary: true,
      caseSensitive: false,
      matchAliases: true,
      disambiguateDuplicates: true,
      linkHeadings: true,
      linkKeywords: true,
    });

    const doc = "Deep Learning uses Neural Networks with backpropagation and loss function.";
    const proposals = proposerTitleOnly.generateProposals("Notes/Intro.md", doc);

    // Should include Deep Learning (title) and Neural Networks (heading)
    expect(proposals.some(p => p.matchedText === "Deep Learning")).toBe(true);
    expect(proposals.some(p => p.matchedText === "Neural Networks")).toBe(true);

    // Should STRICTLY EXCLUDE inferred keywords backpropagation and loss function
    expect(proposals.some(p => p.matchedText === "backpropagation")).toBe(false);
    expect(proposals.some(p => p.matchedText === "loss function")).toBe(false);
  });

  it("recognizes all standard date formats and validates TextNormalizer.isDate", () => {
    const validDates = [
      "2026-10-11",
      "2026/10/11",
      "2026.10.11",
      "2026_10_11",
      "11-10-2026",
      "11/10/2026",
      "11.10.2026",
      "10-11-2026",
      "October 11, 2026",
      "11 October 2026",
      "Oct 11 2026",
      "11th Oct 2026",
      "October 2026",
      "2026-10",
      "20261011",
      "[2026-10-11]",
      "[October 11, 2026]",
    ];

    for (const d of validDates) {
      expect(TextNormalizer.isDate(d)).toBe(true);
    }

    const nonDates = [
      "Neural Networks",
      "Machine Learning",
      "-----",
      "=====",
      "version 1.0.4",
      "12345",
      "C++",
    ];

    for (const nd of nonDates) {
      expect(TextNormalizer.isDate(nd)).toBe(false);
    }
  });

  it("links all date formats as separate links and NEVER includes date inside keyword/linker link", () => {
    const titleIndex = new TitleIndex();

    // Vault files: note with date in title, note with brackets, note with regular title
    titleIndex.buildFromVaultFiles([
      { path: "Notes/Meeting 2026-10-11.md", basename: "Meeting 2026-10-11" },
      { path: "Notes/Sprint Planning.md", basename: "Sprint Planning" },
      { path: "Notes/2024-05-15 Daily Log.md", basename: "2024-05-15 Daily Log" },
      { path: "Notes/2026-10-11.md", basename: "2026-10-11" }, // Daily note
    ]);

    const phrases = titleIndex.getSortedPhrases();

    // RULE: Dates must NOT be included with any linker/keyword phrase in TitleIndex!
    // "Meeting 2026-10-11" must NOT exist as a single phrase!
    expect(phrases.some(p => p.phrase === "meeting 2026-10-11")).toBe(false);
    // "2024-05-15 Daily Log" must NOT exist as a single phrase!
    expect(phrases.some(p => p.phrase === "2024-05-15 daily log")).toBe(false);

    // Clean keywords MUST exist
    expect(phrases.some(p => p.phrase === "meeting")).toBe(true);
    expect(phrases.some(p => p.phrase === "sprint planning")).toBe(true);
    expect(phrases.some(p => p.phrase === "daily log")).toBe(true);

    const proposer = new LinkProposer(titleIndex, {
      autoWriteEnabled: false,
      maxLinksPerNote: 15,
      requireWordBoundary: true,
      caseSensitive: false,
      matchAliases: true,
      disambiguateDuplicates: true,
      linkHeadings: true,
      linkKeywords: true,
      linkDates: true,
    });

    const doc = `
# Meeting & Planning
We held a Meeting 2026-10-11 in the morning.
Next is [Sprint Planning] [2026-10-11] with team.
Reference the 2024-05-15 Daily Log for context.
Reviewed on October 11, 2026 and finalised 15/05/2024.
Already linked [[2026-10-11]] must be preserved.
`;

    const proposals = proposer.generateProposals("Notes/ActiveProject.md", doc);

    // 1. "Meeting 2026-10-11" must produce TWO separate links:
    // Proposal for "Meeting" (targeting Notes/Meeting 2026-10-11.md as [[Meeting 2026-10-11|Meeting]])
    const meetingProp = proposals.find(p => p.matchedText === "Meeting");
    expect(meetingProp).toBeDefined();
    expect(meetingProp?.replacementText).toBe("[[Meeting 2026-10-11|Meeting]]");

    // Proposal for "2026-10-11" as separate link [[2026-10-11]]
    const dateProp1 = proposals.find(p => p.matchedText === "2026-10-11");
    expect(dateProp1).toBeDefined();
    expect(dateProp1?.replacementText).toBe("[[2026-10-11]]");

    // 2. "[Sprint Planning] [2026-10-11]" must produce TWO separate links:
    const sprintProp = proposals.find(p => p.matchedText === "[Sprint Planning]");
    expect(sprintProp).toBeDefined();
    expect(sprintProp?.replacementText).toBe("[[Sprint Planning]]");

    const datePropBracket = proposals.find(p => p.matchedText === "[2026-10-11]");
    expect(datePropBracket).toBeDefined();
    expect(datePropBracket?.replacementText).toBe("[[2026-10-11]]");

    // 3. "2024-05-15 Daily Log" must produce TWO separate links:
    const dateProp2024 = proposals.find(p => p.matchedText === "2024-05-15");
    expect(dateProp2024).toBeDefined();
    expect(dateProp2024?.replacementText).toBe("[[2024-05-15]]");

    const dailyLogProp = proposals.find(p => p.matchedText === "Daily Log");
    expect(dailyLogProp).toBeDefined();
    expect(dailyLogProp?.replacementText).toBe("[[2024-05-15 Daily Log|Daily Log]]");

    // 4. Standalone dates: "October 11, 2026" and "15/05/2024"
    const octProp = proposals.find(p => p.matchedText === "October 11, 2026");
    expect(octProp).toBeDefined();

    const dmyProp = proposals.find(p => p.matchedText === "15/05/2024");
    expect(dmyProp).toBeDefined();
    expect(dmyProp?.replacementText).toBe("[[15/05/2024]]");

    // Apply rewrite and verify final markdown text
    const res = MarkdownRewriter.rewriteContent(doc, proposals);
    expect(res.success).toBe(true);

    // Verify Meeting 2026-10-11 separated into two links:
    expect(res.modifiedContent).toContain("[[Meeting 2026-10-11|Meeting]] [[2026-10-11]]");

    // Verify [Sprint Planning] [2026-10-11] separated into two clean links (no triple brackets):
    expect(res.modifiedContent).toContain("[[Sprint Planning]] [[2026-10-11]]");

    // Verify 2024-05-15 Daily Log separated into two links:
    expect(res.modifiedContent).toContain("[[2024-05-15]] [[2024-05-15 Daily Log|Daily Log]]");

    // Verify standalone dates:
    expect(res.modifiedContent).toContain("[[15/05/2024]]");

    // Verify existing [[2026-10-11]] was preserved:
    expect(res.modifiedContent).toContain("Already linked [[2026-10-11]] must be preserved.");
  });
});
