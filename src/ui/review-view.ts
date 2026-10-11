import { ItemView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { ReviewManager } from "../autolink/review-manager";
import { IndexManager } from "../indexing/index-manager";

export const REVIEW_VIEW_TYPE = "semantic-autolinker-review-view";

export class ReviewView extends ItemView {
  private reviewManager: ReviewManager;
  private indexManager: IndexManager;

  constructor(leaf: WorkspaceLeaf, reviewManager: ReviewManager, indexManager: IndexManager) {
    super(leaf);
    this.reviewManager = reviewManager;
    this.indexManager = indexManager;
  }

  public getViewType(): string {
    return REVIEW_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return "Wikilink Review Queue";
  }

  public getIcon(): string {
    return "link";
  }

  public async onOpen(): Promise<void> {
    await this.render();
  }

  public async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("semantic-autolinker-container");

    const header = container.createDiv({ cls: "semantic-autolinker-header" });
    header.createEl("h2", { text: "Proposed Wikilinks Review Queue" });

    // Action buttons bar
    const actionsBar = container.createDiv({ cls: "semantic-actions-bar" });

    const genBtn = actionsBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "Scan & Generate Proposals",
    });
    genBtn.addEventListener("click", async () => {
      new Notice("Scanning vault notes for link opportunities...");
      let notesToScan = this.indexManager.notes;
      if (notesToScan.size === 0) {
        notesToScan = new Map();
        const files = this.app.vault.getMarkdownFiles();
        for (const f of files) {
          const cache = this.app.metadataCache.getFileCache(f);
          const aliases = cache?.frontmatter?.aliases
            ? Array.isArray(cache.frontmatter.aliases)
              ? cache.frontmatter.aliases
              : [cache.frontmatter.aliases]
            : [];
          notesToScan.set(f.path, {
            id: f.path,
            path: f.path,
            title: f.basename,
            aliases,
            contentHash: "",
            wordCount: 0,
            indexedAt: Date.now(),
            status: "indexed",
          });
        }
      }

      await this.reviewManager.generateProposalsForVault(
        notesToScan,
        async (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) return await this.app.vault.read(file);
          return "";
        }
      );
      new Notice("Proposal generation complete.");
      await this.render();
    });

    const approveAllBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Approve All Pending",
    });
    approveAllBtn.addEventListener("click", async () => {
      await this.reviewManager.approveAll();
      await this.render();
    });

    const rejectAllBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Reject All Pending",
    });
    rejectAllBtn.addEventListener("click", async () => {
      await this.reviewManager.rejectAll();
      await this.render();
    });

    const applyBtn = actionsBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "Apply Approved to Vault",
    });
    applyBtn.addEventListener("click", async () => {
      const proposals = await this.reviewManager.getProposals();
      const approvedByNote = new Map<string, typeof proposals>();
      for (const p of proposals) {
        if (p.status === "approved") {
          const list = approvedByNote.get(p.sourcePath) || [];
          list.push(p);
          approvedByNote.set(p.sourcePath, list);
        }
      }

      if (approvedByNote.size === 0) {
        new Notice("No approved proposals to apply.");
        return;
      }

      let totalApplied = 0;
      for (const [path] of approvedByNote.entries()) {
        const res = await this.reviewManager.applyApproved(
          path,
          async (p) => {
            const f = this.app.vault.getAbstractFileByPath(p);
            return f instanceof TFile ? await this.app.vault.read(f) : "";
          },
          async (p, c) => {
            const f = this.app.vault.getAbstractFileByPath(p);
            if (f instanceof TFile) await this.app.vault.modify(f, c);
          }
        );
        if (res.success) totalApplied += res.appliedCount;
      }

      new Notice(`Applied ${totalApplied} approved links successfully.`);
      await this.render();
    });

    const undoBtn = actionsBar.createEl("button", {
      cls: "semantic-button-danger",
      text: "Rollback Last Undo",
    });
    undoBtn.addEventListener("click", async () => {
      const history = await this.reviewManager.undoManager.getHistory();
      if (history.length === 0) {
        new Notice("No undo history available.");
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
        new Notice(`Rolled back changes in ${last.sourcePath}`);
      } else {
        new Notice(`Rollback failed: ${res.error}`);
      }
      await this.render();
    });

    // Proposals Table
    const proposals = await this.reviewManager.getProposals();

    if (proposals.length === 0) {
      container.createEl("p", {
        text: "No proposals generated yet. Click 'Scan & Generate Proposals' to find linking opportunities.",
      });
      return;
    }

    const table = container.createEl("table", { cls: "semantic-review-table" });
    const thead = table.createEl("thead");
    const tr = thead.createEl("tr");
    tr.createEl("th", { text: "Source Note" });
    tr.createEl("th", { text: "Matched Text" });
    tr.createEl("th", { text: "Proposed Link" });
    tr.createEl("th", { text: "Confidence" });
    tr.createEl("th", { text: "Status" });
    tr.createEl("th", { text: "Actions" });

    const tbody = table.createEl("tbody");
    for (const p of proposals) {
      const row = tbody.createEl("tr");

      row.createEl("td", { text: p.sourcePath });
      row.createEl("td", { text: p.matchedText });
      row.createEl("td", { text: p.replacementText });
      row.createEl("td", { text: `${(p.score * 100).toFixed(0)}%` });

      const statusTd = row.createEl("td");
      statusTd.createEl("span", {
        cls: `semantic-autolinker-badge badge-${p.status}`,
        text: p.status,
      });

      const actionsTd = row.createEl("td");
      if (p.status === "pending" || p.status === "rejected") {
        const appBtn = actionsTd.createEl("button", { text: "✓", title: "Approve" });
        appBtn.addEventListener("click", async () => {
          await this.reviewManager.approveProposal(p.id);
          await this.render();
        });
      }

      if (p.status === "pending" || p.status === "approved") {
        const rejBtn = actionsTd.createEl("button", { text: "✕", title: "Reject" });
        rejBtn.addEventListener("click", async () => {
          await this.reviewManager.rejectProposal(p.id);
          await this.render();
        });
      }
    }
  }
}
