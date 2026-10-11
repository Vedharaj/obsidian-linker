import fs from "fs";
import path from "path";
import { MemoryStorage } from "../src/storage/memory-storage";
import { DEFAULT_SETTINGS } from "../src/settings";
import { FileFilter } from "../src/crawler/file-filter";
import { DiscoveredFile, IVaultAdapter, VaultCrawler } from "../src/crawler/vault-crawler";
import { IndexManager } from "../src/indexing/index-manager";
import { JobManager } from "../src/jobs/job-manager";
import { GraphBuilder } from "../src/relationships/graph-builder";
import { ReviewManager } from "../src/autolink/review-manager";

class NodeFsVaultAdapter implements IVaultAdapter {
  constructor(private vaultDir: string, private fileList: string[]) {}

  async getMarkdownFiles(): Promise<DiscoveredFile[]> {
    return this.fileList.map((full) => {
      const rel = path.relative(this.vaultDir, full);
      const stat = fs.statSync(full);
      const basename = path.basename(full, ".md");
      return { path: rel, basename, size: stat.size };
    });
  }

  async read(relPath: string): Promise<string> {
    const full = path.join(this.vaultDir, relPath);
    return fs.readFileSync(full, "utf8");
  }
}

function discoverMarkdownFiles(dir: string, result: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (![".obsidian", ".git", ".trash", "node_modules"].includes(ent.name)) {
          discoverMarkdownFiles(full, result);
        }
      } else if (ent.isFile() && (ent.name.endsWith(".md") || ent.name.endsWith(".markdown"))) {
        result.push(full);
      }
    }
  } catch (err) {}
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let vaultPath = "/media/vedha/E2/digital brain/vedha-digital-brain";
  let limit = 500;
  let minSimilarity = 0.15;
  let exportPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault" && args[i + 1]) vaultPath = args[++i];
    if (args[i] === "--limit" && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === "--min-sim" && args[i + 1]) minSimilarity = parseFloat(args[++i]);
    if (args[i] === "--export" && args[i + 1]) exportPath = args[++i];
  }

  console.log("=== Obsidian Semantic Auto-Linker CLI Scanner ===");
  console.log(`Vault: ${vaultPath}`);
  console.log(`Limit: ${limit} files`);
  console.log(`Min Similarity Threshold: ${minSimilarity}`);

  const allFiles = discoverMarkdownFiles(vaultPath);
  console.log(`Total Markdown files found in vault: ${allFiles.length}`);

  const selectedFiles = allFiles.slice(0, limit);
  console.log(`Processing sample of: ${selectedFiles.length} files...`);

  const adapter = new NodeFsVaultAdapter(vaultPath, selectedFiles);
  const storage = new MemoryStorage();
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.similarity.minSimilarityThreshold = minSimilarity;

  const fileFilter = new FileFilter(settings.fileFilter);
  const crawler = new VaultCrawler(adapter, fileFilter);
  const indexManager = new IndexManager(storage, settings);
  const jobManager = new JobManager(storage, settings, crawler, indexManager);
  const reviewManager = new ReviewManager(storage, settings.autolink);

  const startTime = Date.now();

  jobManager.progressManager.subscribe((state) => {
    process.stdout.write(
      `\r[${(state.overallProgress * 100).toFixed(0)}%] Stage: ${state.currentStage.padEnd(12)} - ${state.details.slice(0, 50).padEnd(50)}`
    );
  });

  await jobManager.startFullScan();

  while (jobManager.getStatus()?.status === "running") {
    await new Promise((r) => setTimeout(r, 50));
  }

  const durationMs = Date.now() - startTime;
  console.log("\n\n=== SCAN COMPLETE ===");
  console.log(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`Indexed Notes: ${indexManager.notes.size}`);
  console.log(`Unique Terms/Keywords: ${indexManager.invertedIndex.termCount}`);
  console.log(`Total Relationships Found: ${indexManager.relationships.size}`);

  // Graph summary
  const graph = GraphBuilder.buildGraph(
    indexManager.notes,
    Array.from(indexManager.relationships.values()),
    { mode: "combined", minWeight: minSimilarity }
  );

  console.log(`Graph Nodes: ${graph.nodes.length}`);
  console.log(`Graph Edges: ${graph.edges.length}`);
  console.log(`Orphan Notes: ${graph.stats.orphanCount}`);
  console.log(`Connected Communities: ${graph.stats.componentCount}`);

  // Top 10 strongest relationships
  const rels = Array.from(indexManager.relationships.values());
  rels.sort((a, b) => b.score - a.score);
  console.log("\n--- Top 10 Discovered Relationships ---");
  for (let i = 0; i < Math.min(10, rels.length); i++) {
    const r = rels[i];
    console.log(
      `${i + 1}. [${(r.score * 100).toFixed(1)}%] ${r.sourceId} <--> ${r.targetId} (${r.relationshipType})`
    );
    if (r.evidence && r.evidence.length > 0) {
      console.log(`   Evidence: ${r.evidence[0]}`);
    }
  }

  // Export report if requested
  if (exportPath) {
    const report = {
      timestamp: new Date().toISOString(),
      vault: vaultPath,
      totalNotes: indexManager.notes.size,
      termCount: indexManager.invertedIndex.termCount,
      relationshipsCount: indexManager.relationships.size,
      relationships: rels,
      graphStats: graph.stats,
    };
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2));
    console.log(`\nExported full report to: ${exportPath}`);
  }
}

main().catch(console.error);
