import { JobRecord, JobStatus, ProcessingStage, SemanticAutolinkerSettings } from "../types";
import { ProgressManager } from "./progress-manager";
import { CheckpointManager } from "./checkpoint-manager";
import { ErrorReporter } from "./error-reporter";
import { IPluginStorage } from "../storage/storage-interface";
import { VaultCrawler } from "../crawler/vault-crawler";
import { IndexManager } from "../indexing/index-manager";
import { GraphBuilder, GraphData } from "../relationships/graph-builder";

export class JobManager {
  private storage: IPluginStorage;
  private settings: SemanticAutolinkerSettings;
  private crawler: VaultCrawler;
  private indexManager: IndexManager;
  public progressManager: ProgressManager;
  public checkpointManager: CheckpointManager;
  public errorReporter: ErrorReporter;

  private currentJob: JobRecord | null = null;
  private isPaused = false;
  private isCancelled = false;
  private activeGraphData: GraphData | null = null;

  constructor(
    storage: IPluginStorage,
    settings: SemanticAutolinkerSettings,
    crawler: VaultCrawler,
    indexManager: IndexManager
  ) {
    this.storage = storage;
    this.settings = settings;
    this.crawler = crawler;
    this.indexManager = indexManager;
    this.progressManager = new ProgressManager();
    this.checkpointManager = new CheckpointManager(storage);
    this.errorReporter = new ErrorReporter();
  }

  public getStatus(): JobRecord | undefined {
    return this.currentJob ? { ...this.currentJob } : undefined;
  }

  public getGraphData(): GraphData | null {
    return this.activeGraphData;
  }

  public async pause(): Promise<void> {
    if (this.currentJob && this.currentJob.status === "running") {
      this.isPaused = true;
      this.currentJob.status = "paused";
      this.currentJob.updatedAt = Date.now();
      await this.storage.saveJob(this.currentJob);
    }
  }

  public async resume(): Promise<void> {
    if (this.currentJob && this.currentJob.status === "paused") {
      this.isPaused = false;
      this.currentJob.status = "running";
      this.currentJob.updatedAt = Date.now();
      await this.storage.saveJob(this.currentJob);
      await this.executeScanLoop();
    }
  }

  public async cancel(): Promise<void> {
    if (this.currentJob && (this.currentJob.status === "running" || this.currentJob.status === "paused")) {
      this.isCancelled = true;
      this.isPaused = false;
      this.currentJob.status = "cancelled";
      this.currentJob.updatedAt = Date.now();
      await this.storage.saveJob(this.currentJob);
    }
  }

  public async startFullScan(): Promise<JobRecord> {
    const jobId = `job_${Date.now()}`;
    this.isPaused = false;
    this.isCancelled = false;
    this.errorReporter.clear();

    this.currentJob = {
      id: jobId,
      status: "running",
      stage: "discover",
      totalItems: 0,
      processedItems: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      errorCount: 0,
    };

    await this.storage.saveJob(this.currentJob);
    this.progressManager.reset();

    // Run execution loop asynchronously
    this.executeScanLoop().catch((err) => {
      console.error("Fatal error during scan loop:", err);
      if (this.currentJob) {
        this.currentJob.status = "failed";
        this.currentJob.errors = [err?.message || String(err)];
        this.storage.saveJob(this.currentJob);
      }
    });

    return this.currentJob;
  }

  private async yieldThread(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5));
  }

  private async executeScanLoop(): Promise<void> {
    if (!this.currentJob) return;

    try {
      // 1. DISCOVER
      this.progressManager.setStage("discover", 100, "Crawling vault notes...");
      this.currentJob.stage = "discover";
      await this.storage.saveJob(this.currentJob);

      const scanReport = await this.crawler.crawlVault((curr, total, path) => {
        this.progressManager.updateWork(curr, total, `Discovering: ${path}`);
      });

      if (this.checkHalt()) return;

      const discoveredNotes = Array.from(scanReport.notes.values());
      this.currentJob.totalItems = discoveredNotes.length;
      this.currentJob.updatedAt = Date.now();
      await this.storage.saveJob(this.currentJob);

      // 2. PREPROCESS & KEYWORDS
      this.progressManager.setStage("preprocess", discoveredNotes.length, "Parsing markdown and extracting terms...");
      this.currentJob.stage = "preprocess";

      // Clear previous in-memory structures for full rebuild
      this.indexManager.clear();

      const batchSize = this.settings.progress.batchSize || 20;

      for (let i = 0; i < discoveredNotes.length; i++) {
        if (this.checkHalt()) return;

        const note = discoveredNotes[i];
        try {
          this.indexManager.indexNoteContent(note.path, note.title, note.content);
        } catch (err: any) {
          this.errorReporter.report("preprocess", err.message, note.path);
        }

        if (i % batchSize === 0 || i === discoveredNotes.length - 1) {
          this.progressManager.updateWork(i + 1, discoveredNotes.length, `Preprocessed ${i + 1}/${discoveredNotes.length}`);
          await this.yieldThread();
        }
      }

      if (this.checkHalt()) return;

      // 3. KEYWORDS & TF-IDF VECTORS
      this.progressManager.setStage("keywords", discoveredNotes.length, "Computing TF-IDF vectors...");
      this.currentJob.stage = "keywords";

      this.indexManager.recomputeAllVectors();
      this.progressManager.updateWork(discoveredNotes.length, discoveredNotes.length, "TF-IDF vectors ready");

      if (this.checkHalt()) return;

      // 4. SIMILARITY & RELATIONSHIPS
      this.progressManager.setStage("similarity", discoveredNotes.length, "Generating relationships from inverted index...");
      this.currentJob.stage = "similarity";

      const candidateGenerator = (this.indexManager as any).candidateGenerator;
      const allRelationships = await candidateGenerator.generateAll(
        this.indexManager.notes,
        this.indexManager.vectors,
        async (processed: number, total: number, pairsCount: number) => {
          this.progressManager.updateWork(
            processed,
            total,
            `Evaluated candidates: ${processed}/${total} notes (${pairsCount} relationships)`
          );
          await this.yieldThread();
        }
      );

      for (const rel of allRelationships) {
        this.indexManager.relationships.set(`${rel.sourceId}:::${rel.targetId}`, rel);
      }

      if (this.checkHalt()) return;

      // 5. GRAPH
      this.progressManager.setStage("graph", 100, "Constructing knowledge graph...");
      this.currentJob.stage = "graph";

      this.activeGraphData = GraphBuilder.buildGraph(
        this.indexManager.notes,
        Array.from(this.indexManager.relationships.values()),
        {
          mode: this.settings.graph.defaultMode,
          minWeight: this.settings.graph.minEdgeWeight,
          maxEdges: this.settings.graph.maxVisibleEdges,
        }
      );
      this.progressManager.updateWork(100, 100, "Graph constructed");

      if (this.checkHalt()) return;

      // 6. PERSIST
      this.progressManager.setStage("persist", 100, "Persisting index and relationships to storage...");
      this.currentJob.stage = "persist";

      await this.storage.saveNotes(Array.from(this.indexManager.notes.values()));
      await this.storage.saveRelationships(Array.from(this.indexManager.relationships.values()));
      this.progressManager.updateWork(100, 100, "Persistence committed");

      if (this.checkHalt()) return;

      // 7. VALIDATE
      this.progressManager.setStage("validate", 100, "Validating index integrity...");
      this.currentJob.stage = "validate";

      const validRelCount = this.indexManager.relationships.size;
      const validNoteCount = this.indexManager.notes.size;
      if (validNoteCount === 0 && discoveredNotes.length > 0) {
        throw new Error("Validation failed: Note count is 0 after indexing non-empty vault");
      }
      this.progressManager.updateWork(100, 100, `Validated: ${validNoteCount} notes, ${validRelCount} relationships`);

      // 8. COMPLETE
      this.progressManager.setStage("complete", 100, "Indexing completed successfully");
      this.currentJob.status = "completed";
      this.currentJob.processedItems = discoveredNotes.length;
      this.currentJob.errorCount = this.errorReporter.count;
      this.currentJob.updatedAt = Date.now();
      await this.storage.saveJob(this.currentJob);
      await this.checkpointManager.clearCheckpoint(this.currentJob.id);
    } catch (err: any) {
      console.error("Error in scan loop:", err);
      this.errorReporter.report(this.currentJob?.stage || "unknown", err.message);
      if (this.currentJob) {
        this.currentJob.status = "failed";
        this.currentJob.errorCount = this.errorReporter.count;
        this.currentJob.updatedAt = Date.now();
        await this.storage.saveJob(this.currentJob);
        this.progressManager.setStage("complete", 100, `Scan failed: ${err.message}`);
      }
    }
  }

  private checkHalt(): boolean {
    if (this.isCancelled) {
      if (this.currentJob) this.currentJob.status = "cancelled";
      return true;
    }
    if (this.isPaused) {
      if (this.currentJob) this.currentJob.status = "paused";
      return true;
    }
    return false;
  }
}
