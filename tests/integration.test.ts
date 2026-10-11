import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../src/storage/memory-storage";
import { DEFAULT_SETTINGS } from "../src/settings";
import { FileFilter } from "../src/crawler/file-filter";
import { DiscoveredFile, IVaultAdapter, VaultCrawler } from "../src/crawler/vault-crawler";
import { IndexManager } from "../src/indexing/index-manager";
import { JobManager } from "../src/jobs/job-manager";
import { ReviewManager } from "../src/autolink/review-manager";
import { GraphBuilder } from "../src/relationships/graph-builder";

class MockVaultAdapter implements IVaultAdapter {
  public files = new Map<string, string>();

  public async getMarkdownFiles(): Promise<DiscoveredFile[]> {
    return Array.from(this.files.keys()).map((path) => {
      const segments = path.split("/");
      const basename = segments[segments.length - 1].replace(/\.md$/, "");
      return {
        path,
        basename,
        size: this.files.get(path)!.length,
      };
    });
  }

  public async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content !== undefined) return content;
    throw new Error(`File not found: ${path}`);
  }

  public async modify(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

describe("End-to-End System Integration Test", () => {
  it("runs full crawl, indexing, relationship discovery, autolink proposals, and undo rollback", async () => {
    const mockVault = new MockVaultAdapter();

    // Populate mock vault
    mockVault.files.set(
      "AI/Machine Learning.md",
      `---
aliases: [ML]
tags: [ai, computing]
---
# Machine Learning
Machine Learning is a subset of Artificial Intelligence focused on training algorithms.
It often uses Neural Networks to optimize parameters.

\`\`\`python
# Code snippet mentioning Neural Networks
model = NeuralNetworks()
\`\`\`
`
    );

    mockVault.files.set(
      "AI/Neural Networks.md",
      `---
aliases: [NN, Deep Networks]
---
# Neural Networks
Neural Networks are computational architectures used in Machine Learning.
They power modern Deep Learning models.
`
    );

    mockVault.files.set(
      "AI/Artificial Intelligence.md",
      `# Artificial Intelligence
Artificial Intelligence encompasses autonomous reasoning, Robotics, and Machine Learning.
`
    );

    mockVault.files.set(
      "Hobbies/Cooking.md",
      `# Italian Cooking
Cooking authentic Italian pasta requires olive oil, fresh garlic, tomatoes, and basil.
`
    );

    mockVault.files.set(
      "Hobbies/Gardening.md",
      `# Organic Gardening
Gardening tips for growing fresh tomatoes and basil in rich soil.
`
    );

    const storage = new MemoryStorage();
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    settings.fileFilter.excludedFolders = [".obsidian", ".git"];
    settings.similarity.minSimilarityThreshold = 0.15;

    const fileFilter = new FileFilter(settings.fileFilter);
    const crawler = new VaultCrawler(mockVault, fileFilter);
    const indexManager = new IndexManager(storage, settings);
    const jobManager = new JobManager(storage, settings, crawler, indexManager);
    const reviewManager = new ReviewManager(storage, settings.autolink);

    // 1. Run Full Scan
    await jobManager.startFullScan();

    // Wait for scan to complete
    let attempts = 0;
    while (jobManager.getStatus()?.status === "running" && attempts < 50) {
      await new Promise((r) => setTimeout(r, 20));
      attempts++;
    }

    expect(jobManager.getStatus()?.status).toBe("completed");
    expect(indexManager.notes.size).toBe(5);

    // Verify Relationships
    const rels = Array.from(indexManager.relationships.values());
    expect(rels.length).toBeGreaterThan(0);

    // AI notes should have high similarity with each other
    const mlAndNn = rels.find(
      (r) =>
        (r.sourceId.includes("Machine Learning") && r.targetId.includes("Neural Networks")) ||
        (r.sourceId.includes("Neural Networks") && r.targetId.includes("Machine Learning"))
    );
    expect(mlAndNn).toBeDefined();
    expect(mlAndNn!.score).toBeGreaterThan(0.15);

    // Cooking and ML should NOT have a strong relationship
    const cookingAndMl = rels.find(
      (r) =>
        (r.sourceId.includes("Cooking") && r.targetId.includes("Machine Learning")) ||
        (r.sourceId.includes("Machine Learning") && r.targetId.includes("Cooking"))
    );
    expect(cookingAndMl).toBeUndefined();

    // 2. Build and Verify Graph
    const graphData = GraphBuilder.buildGraph(indexManager.notes, rels, {
      mode: "combined",
      minWeight: 0.15,
    });
    expect(graphData.nodes.length).toBe(5);
    expect(graphData.edges.length).toBeGreaterThan(0);

    // 3. Generate Link Proposals
    const proposals = await reviewManager.generateProposalsForVault(
      indexManager.notes,
      (path) => mockVault.read(path)
    );

    expect(proposals.length).toBeGreaterThan(0);

    // Verify no self-links were proposed
    for (const p of proposals) {
      expect(p.sourcePath).not.toBe(p.targetPath);
    }

    // In Machine Learning.md, there is prose "Neural Networks" and code "NeuralNetworks()".
    // Propose links for Neural Networks.md
    const nnProposals = proposals.filter((p) => p.targetPath === "AI/Neural Networks.md");
    expect(nnProposals.length).toBeGreaterThanOrEqual(1);

    // 4. Approve Proposals
    await reviewManager.approveAll();
    const approved = await reviewManager.getProposals();
    expect(approved.every((p) => p.status === "approved")).toBe(true);

    // 5. Apply Approved Links to AI/Machine Learning.md
    const originalMlContent = await mockVault.read("AI/Machine Learning.md");

    const applyRes = await reviewManager.applyApproved(
      "AI/Machine Learning.md",
      (path) => mockVault.read(path),
      (path, content) => mockVault.modify(path, content)
    );

    expect(applyRes.success).toBe(true);
    expect(applyRes.appliedCount).toBeGreaterThanOrEqual(1);

    const modifiedMlContent = await mockVault.read("AI/Machine Learning.md");
    expect(modifiedMlContent).not.toBe(originalMlContent);
    expect(modifiedMlContent).toContain("[[Neural Networks]]");
    // Ensure code snippet was preserved intact
    expect(modifiedMlContent).toContain("model = NeuralNetworks()");

    // 6. Rollback / Undo
    const undoHistory = await reviewManager.undoManager.getHistory();
    expect(undoHistory.length).toBe(1);

    const rollbackRes = await reviewManager.undoManager.rollback(
      undoHistory[0].id,
      (path) => mockVault.read(path),
      (path, content) => mockVault.modify(path, content)
    );

    expect(rollbackRes.success).toBe(true);

    // Content should be restored EXACTLY
    const restoredMlContent = await mockVault.read("AI/Machine Learning.md");
    expect(restoredMlContent).toBe(originalMlContent);
  });
});
