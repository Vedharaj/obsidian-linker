import { describe, it, expect } from "vitest";
import { MarkdownRewriter } from "../src/autolink/markdown-rewriter";
import { LinkProposal } from "../src/types";
import { computeContentHash } from "../src/indexing/content-hash";
import { TitleIndex } from "../src/autolink/title-index";
import { LinkProposer } from "../src/autolink/link-proposer";

describe("Markdown Rewriter and Auto-Link Safety", () => {
  it("applies multiple link replacements in descending offset order safely", () => {
    const raw = "Machine Learning uses Neural Networks for computer vision.";
    const originalHash = computeContentHash(raw);

    const proposals: LinkProposal[] = [
      {
        id: "p1",
        sourcePath: "Notes/Test.md",
        targetPath: "Notes/Machine Learning.md",
        matchedText: "Machine Learning",
        replacementText: "[[Machine Learning]]",
        matchType: "title",
        score: 1.0,
        startOffset: 0,
        endOffset: 16,
        originalContentHash: originalHash,
        status: "approved",
        createdAt: Date.now(),
      },
      {
        id: "p2",
        sourcePath: "Notes/Test.md",
        targetPath: "Notes/Neural Networks.md",
        matchedText: "Neural Networks",
        replacementText: "[[Neural Networks]]",
        matchType: "title",
        score: 1.0,
        startOffset: 22,
        endOffset: 37,
        originalContentHash: originalHash,
        status: "approved",
        createdAt: Date.now(),
      },
    ];

    const res = MarkdownRewriter.rewriteContent(raw, proposals);
    expect(res.success).toBe(true);
    expect(res.appliedProposals.length).toBe(2);
    expect(res.modifiedContent).toBe(
      "[[Machine Learning]] uses [[Neural Networks]] for computer vision."
    );
  });

  it("rejects or marks stale proposals if document content hash has changed", () => {
    const raw = "Original content before user edit.";
    const staleProposals: LinkProposal[] = [
      {
        id: "p1",
        sourcePath: "Notes/Test.md",
        targetPath: "Notes/Other.md",
        matchedText: "content",
        replacementText: "[[Other|content]]",
        matchType: "title",
        score: 1.0,
        startOffset: 9,
        endOffset: 16,
        originalContentHash: "different_hash_from_past",
        status: "approved",
        createdAt: Date.now(),
      },
    ];

    const res = MarkdownRewriter.rewriteContent(raw, staleProposals);
    expect(res.appliedProposals.length).toBe(0);
    expect(res.skippedProposals.length).toBe(1);
    expect(res.skippedProposals[0].status).toBe("stale");
    expect(res.modifiedContent).toBe(raw); // untouched!
  });

  it("never creates self-links or links inside code fences or existing links", () => {
    const notes = new Map([
      [
        "Notes/AI.md",
        {
          id: "Notes/AI.md",
          path: "Notes/AI.md",
          title: "AI",
          aliases: ["Artificial Intelligence"],
          contentHash: "hash1",
          wordCount: 50,
          indexedAt: Date.now(),
          status: "indexed" as const,
        },
      ],
      [
        "Notes/Robotics.md",
        {
          id: "Notes/Robotics.md",
          path: "Notes/Robotics.md",
          title: "Robotics",
          aliases: [],
          contentHash: "hash2",
          wordCount: 50,
          indexedAt: Date.now(),
          status: "indexed" as const,
        },
      ],
    ]);

    const titleIndex = new TitleIndex();
    titleIndex.buildIndex(notes, true);

    const proposer = new LinkProposer(titleIndex, {
      autoWriteEnabled: false,
      maxLinksPerNote: 10,
      requireWordBoundary: true,
      caseSensitive: false,
      matchAliases: true,
      disambiguateDuplicates: true,
    });

    const docContent = `# AI Overview
Welcome to AI note.

\`\`\`python
# Code example mentioning AI and Robotics
robot = Robotics()
\`\`\`

Here is an existing link: [[Robotics]] is cool.
Also mentions Artificial Intelligence and Robotics in prose.
`;

    const proposals = proposer.generateProposals("Notes/AI.md", docContent);

    // RULE: Note "AI" should NEVER link to itself
    expect(proposals.some((p) => p.targetPath === "Notes/AI.md")).toBe(false);

    // RULE: Robotics inside the fenced code block must not be proposed
    // RULE: Robotics inside [[Robotics]] must not be proposed
    // Only the prose occurrence of "Robotics" and "Artificial Intelligence" should be proposed!
    const roboticsProposals = proposals.filter((p) => p.targetPath === "Notes/Robotics.md");
    expect(roboticsProposals.length).toBe(1);

    // Verify replacement text
    expect(roboticsProposals[0].replacementText).toBe("[[Robotics]]");
  });
});
