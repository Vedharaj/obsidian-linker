import { Plugin, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { SemanticAutolinkerSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { IndexedDbStorage } from "./storage/indexeddb-storage";
import { FileFilter } from "./crawler/file-filter";
import { ObsidianVaultAdapter, VaultCrawler } from "./crawler/vault-crawler";
import { IndexManager } from "./indexing/index-manager";
import { JobManager } from "./jobs/job-manager";
import { ReviewManager } from "./autolink/review-manager";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./ui/dashboard-view";
import { GraphView, GRAPH_VIEW_TYPE } from "./graph/graph-view";
import { ReviewView, REVIEW_VIEW_TYPE } from "./ui/review-view";
import { SemanticAutolinkerSettingTab } from "./ui/settings-tab";

export default class SemanticAutolinkerPlugin extends Plugin {
  public settings: SemanticAutolinkerSettings = DEFAULT_SETTINGS;
  public storage!: IndexedDbStorage;
  public fileFilter!: FileFilter;
  public vaultAdapter!: ObsidianVaultAdapter;
  public crawler!: VaultCrawler;
  public indexManager!: IndexManager;
  public jobManager!: JobManager;
  public reviewManager!: ReviewManager;

  public async onload(): Promise<void> {
    console.log("Loading Obsidian Semantic Auto-Linker plugin");
    await this.loadSettings();

    // Initialize Storage
    this.storage = new IndexedDbStorage();
    try {
      await this.storage.initialize();
    } catch (err) {
      console.warn("Could not initialize IndexedDB directly, continuing with in-memory fallback:", err);
    }

    // Initialize Core Services
    this.fileFilter = new FileFilter(this.settings.fileFilter);
    this.vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.crawler = new VaultCrawler(this.vaultAdapter, this.fileFilter);
    this.indexManager = new IndexManager(this.storage, this.settings);
    this.jobManager = new JobManager(this.storage, this.settings, this.crawler, this.indexManager);
    this.reviewManager = new ReviewManager(this.storage, this.settings.autolink);

    // Load existing index from persistent storage into memory
    await this.indexManager.loadFromStorage();

    // Register Custom Views
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DashboardView(leaf, this.jobManager, this.reviewManager)
    );

    this.registerView(
      GRAPH_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new GraphView(leaf)
    );

    this.registerView(
      REVIEW_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new ReviewView(leaf, this.reviewManager, this.indexManager)
    );

    // Register Ribbon Icons
    this.addRibbonIcon("layout-dashboard", "Semantic Auto-Linker Dashboard", () => {
      this.activateView(DASHBOARD_VIEW_TYPE);
    });

    this.addRibbonIcon("git-fork", "Semantic Knowledge Graph", () => {
      this.activateView(GRAPH_VIEW_TYPE);
    });

    // Register Commands
    this.addCommand({
      id: "open-dashboard",
      name: "Open Semantic Auto-Linker Dashboard",
      callback: () => this.activateView(DASHBOARD_VIEW_TYPE),
    });

    this.addCommand({
      id: "open-graph",
      name: "Open Semantic Knowledge Graph",
      callback: () => this.activateView(GRAPH_VIEW_TYPE),
    });

    this.addCommand({
      id: "review-proposals",
      name: "Review Proposed Wikilinks",
      callback: () => this.activateView(REVIEW_VIEW_TYPE),
    });

    this.addCommand({
      id: "start-scan",
      name: "Start Full Vault Indexing Scan",
      callback: async () => {
        new Notice("Starting semantic vault scan...");
        await this.jobManager.startFullScan();
      },
    });

    this.addCommand({
      id: "propose-for-active-note",
      name: "Scan & Propose Links for Active Note",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            this.proposeForFile(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    // Register Settings Tab
    this.addSettingTab(new SemanticAutolinkerSettingTab(this.app, this));

    // Register Incremental Vault Event Listeners
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          const eligibility = this.fileFilter.isEligible(file.path, file.stat.size);
          if (eligibility.eligible) {
            const content = await this.app.vault.read(file);
            await this.indexManager.updateNote(file.path, file.basename, content);
          }
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          await this.indexManager.removeNote(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          await this.indexManager.renameNote(oldPath, file.path, file.basename);
        }
      })
    );
  }

  public async onunload(): Promise<void> {
    console.log("Unloading Obsidian Semantic Auto-Linker plugin");
    if (this.jobManager) {
      await this.jobManager.pause();
    }
    if (this.storage) {
      await this.storage.close();
    }
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.fileFilter) this.fileFilter.updateSettings(this.settings.fileFilter);
    if (this.indexManager) this.indexManager.updateSettings(this.settings);
    if (this.reviewManager) this.reviewManager.updateSettings(this.settings.autolink);
  }

  public async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: viewType, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);

      // If opening graph view, pass active graph data
      if (viewType === GRAPH_VIEW_TYPE) {
        const view = leaf.view as GraphView;
        const graphData = this.jobManager.getGraphData();
        if (graphData && view.setGraphData) {
          view.setGraphData(graphData);
        }
      }
    }
  }

  private async proposeForFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const titleIndex = (this.reviewManager as any).titleIndex;
    titleIndex.buildIndex(this.indexManager.notes, this.settings.autolink.matchAliases);

    const proposer = (this.reviewManager as any).proposer;
    const proposals = proposer.generateProposals(file.path, content);

    if (proposals.length === 0) {
      new Notice(`No new link proposals found for ${file.basename}`);
      return;
    }

    await this.storage.saveProposals(proposals);
    new Notice(`Found ${proposals.length} link proposals for ${file.basename}. Opening review queue...`);
    await this.activateView(REVIEW_VIEW_TYPE);
  }
}
