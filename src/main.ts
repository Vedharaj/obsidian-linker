import { Plugin, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { SemanticAutolinkerSettings } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { IPluginStorage } from "./storage/storage-interface";
import { IndexedDbStorage } from "./storage/indexeddb-storage";
import { MemoryStorage } from "./storage/memory-storage";
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
  public storage!: IPluginStorage;
  public fileFilter!: FileFilter;
  public vaultAdapter!: ObsidianVaultAdapter;
  public crawler!: VaultCrawler;
  public indexManager!: IndexManager;
  public jobManager!: JobManager;
  public reviewManager!: ReviewManager;

  public async onload(): Promise<void> {
    console.log("Loading Obsidian Semantic Auto-Linker plugin");
    await this.loadSettings();

    // Initialize Storage with safe timeout & in-memory fallback
    let storage: IPluginStorage = new IndexedDbStorage();
    try {
      await Promise.race([
        storage.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("IndexedDB initialization timed out")), 2500)
        ),
      ]);
    } catch (err) {
      console.warn("Could not initialize IndexedDB directly, falling back to MemoryStorage:", err);
      storage = new MemoryStorage();
      await storage.initialize();
    }
    this.storage = storage;

    // Initialize Core Services
    this.fileFilter = new FileFilter(this.settings.fileFilter);
    this.vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.crawler = new VaultCrawler(this.vaultAdapter, this.fileFilter);
    this.indexManager = new IndexManager(this.storage, this.settings);
    this.jobManager = new JobManager(this.storage, this.settings, this.crawler, this.indexManager);
    this.reviewManager = new ReviewManager(this.storage, this.settings.autolink);

    // Load existing index from persistent storage into memory (if previously indexed)
    try {
      await this.indexManager.loadFromStorage();
    } catch (err) {
      console.warn("Could not load index from storage:", err);
    }

    // Immediately build Title & Keyword Index from vault metadata cache
    this.refreshTitleIndex();

    // Register Custom Views
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DashboardView(leaf, this)
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

    this.addRibbonIcon("link", "Auto-Link Current Note (Instant)", async () => {
      await this.autoLinkActiveNote(true);
    });

    // Register Commands
    this.addCommand({
      id: "auto-link-active-note-instant",
      name: "Auto-Link Current Note (Instant)",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            this.autoLinkActiveNote(true);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "propose-for-active-note",
      name: "Scan & Propose Links for Active Note (Review Queue)",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            this.autoLinkActiveNote(false);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "auto-link-vault-instant",
      name: "Auto-Link Entire Vault (Instant with Undo)",
      callback: async () => {
        await this.autoLinkVault(true);
      },
    });

    this.addCommand({
      id: "rollback-last-autolink",
      name: "Rollback Last Auto-Link (Undo)",
      callback: async () => {
        await this.rollbackLastAutoLink();
      },
    });

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
            this.refreshTitleIndex();
          }
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof TFile && file.extension === "md") {
          await this.indexManager.removeNote(file.path);
          this.refreshTitleIndex();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          await this.indexManager.renameNote(oldPath, file.path, file.basename);
          this.refreshTitleIndex();
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
    this.refreshTitleIndex();
  }

  public refreshTitleIndex(): void {
    if (!this.reviewManager) return;
    const titleIndex = this.reviewManager.getTitleIndex();

    if (this.indexManager && this.indexManager.notes.size > 0) {
      titleIndex.buildIndex(
        this.indexManager.notes,
        this.settings.autolink.matchAliases,
        this.settings.autolink.linkHeadings ?? true
      );

      if (this.settings.autolink.linkKeywords ?? true) {
        const minLen = this.settings.autolink.minKeywordLength ?? 3;
        for (const [path, note] of this.indexManager.notes.entries()) {
          const freqs = this.indexManager.termFrequencies.get(path);
          if (freqs) {
            const topTerms = Array.from(freqs.entries())
              .filter(([t]) => t.length >= minLen)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([t]) => t);
            titleIndex.addKeywordsForNote(path, topTerms);
          }
        }
      }
    } else {
      const files = this.app.vault.getMarkdownFiles().filter((f) => {
        return this.fileFilter ? this.fileFilter.isEligible(f.path, f.stat.size).eligible : true;
      });

      titleIndex.buildFromVaultFiles(
        files.map((f) => ({ path: f.path, basename: f.basename })),
        (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            const cache = this.app.metadataCache.getFileCache(file);
            return {
              aliases: cache?.frontmatter?.aliases
                ? Array.isArray(cache.frontmatter.aliases)
                  ? cache.frontmatter.aliases
                  : [cache.frontmatter.aliases]
                : undefined,
              headings: cache?.headings?.map((h) => h.heading) || undefined,
            };
          }
          return undefined;
        },
        {
          matchAliases: this.settings.autolink.matchAliases,
          matchHeadings: this.settings.autolink.linkHeadings ?? true,
        }
      );
    }
  }

  public async autoLinkActiveNote(directApply = false): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new Notice("Please open a markdown note first.");
      return;
    }

    await this.autoLinkFile(activeFile, directApply);
  }

  public async autoLinkFile(file: TFile, directApply: boolean): Promise<void> {
    this.refreshTitleIndex();

    const content = await this.app.vault.read(file);
    const proposer = this.reviewManager.getProposer();
    const proposals = proposer.generateProposals(file.path, content);

    if (proposals.length === 0) {
      new Notice(`No unlinked notes or keywords found for "${file.basename}".`);
      return;
    }

    if (directApply || this.settings.autolink.autoWriteEnabled) {
      const res = await this.reviewManager.applyProposalsDirectly(
        file.path,
        proposals,
        async (p) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          return f instanceof TFile ? await this.app.vault.read(f) : "";
        },
        async (p, c) => {
          const f = this.app.vault.getAbstractFileByPath(p);
          if (f instanceof TFile) await this.app.vault.modify(f, c);
        }
      );

      if (res.success && res.appliedCount > 0) {
        const topLinks = proposals
          .slice(0, 4)
          .map((p) => p.replacementText)
          .join(", ");
        const extra = proposals.length > 4 ? ` and ${proposals.length - 4} more` : "";
        new Notice(
          `Auto-linked ${res.appliedCount} references in "${file.basename}": ${topLinks}${extra}. (Rollback available)`
        );
      } else {
        new Notice(res.error || "No links were applied.");
      }
    } else {
      await this.storage.saveProposals(proposals);
      new Notice(`Found ${proposals.length} link proposals for "${file.basename}". Opening review queue...`);
      await this.activateView(REVIEW_VIEW_TYPE);
    }
  }

  public async autoLinkVault(directApply: boolean): Promise<void> {
    this.refreshTitleIndex();
    const files = this.app.vault.getMarkdownFiles().filter((f) => {
      return this.fileFilter.isEligible(f.path, f.stat.size).eligible;
    });

    if (files.length === 0) {
      new Notice("No eligible markdown files found in vault.");
      return;
    }

    new Notice(`Scanning & auto-linking across ${files.length} notes...`);
    let totalLinkedNotes = 0;
    let totalLinksCreated = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await this.app.vault.read(file);
        const proposer = this.reviewManager.getProposer();
        const proposals = proposer.generateProposals(file.path, content);

        if (proposals.length > 0) {
          if (directApply) {
            const res = await this.reviewManager.applyProposalsDirectly(
              file.path,
              proposals,
              async (p) => {
                const f = this.app.vault.getAbstractFileByPath(p);
                return f instanceof TFile ? await this.app.vault.read(f) : "";
              },
              async (p, c) => {
                const f = this.app.vault.getAbstractFileByPath(p);
                if (f instanceof TFile) await this.app.vault.modify(f, c);
              }
            );
            if (res.success && res.appliedCount > 0) {
              totalLinkedNotes++;
              totalLinksCreated += res.appliedCount;
            }
          } else {
            await this.storage.saveProposals(proposals);
            totalLinksCreated += proposals.length;
          }
        }
      } catch (err) {
        console.warn(`Error auto-linking ${file.path}:`, err);
      }

      if (i % 25 === 0) {
        await new Promise((r) => setTimeout(r, 2));
      }
    }

    if (directApply) {
      new Notice(`Completed: Auto-linked ${totalLinksCreated} references across ${totalLinkedNotes} notes.`);
    } else {
      new Notice(`Generated ${totalLinksCreated} proposals. Opening review queue...`);
      await this.activateView(REVIEW_VIEW_TYPE);
    }
  }

  public async rollbackLastAutoLink(): Promise<void> {
    const history = await this.reviewManager.undoManager.getHistory();
    if (history.length === 0) {
      new Notice("No auto-link history to undo.");
      return;
    }

    const last = history[0];
    const res = await this.reviewManager.undoManager.rollback(
      last.id,
      async (p) => {
        const f = this.app.vault.getAbstractFileByPath(p);
        return f instanceof TFile ? await this.app.vault.read(f) : "";
      },
      async (p, c) => {
        const f = this.app.vault.getAbstractFileByPath(p);
        if (f instanceof TFile) await this.app.vault.modify(f, c);
      }
    );

    if (res.success) {
      new Notice(`Successfully rolled back links in "${last.sourcePath}".`);
    } else {
      new Notice(`Rollback failed: ${res.error}`);
    }
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
}
