import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type SemanticAutolinkerPlugin from "../main";
import { ProgressState } from "../jobs/progress-manager";
import { REVIEW_VIEW_TYPE } from "./review-view";

export const DASHBOARD_VIEW_TYPE = "semantic-autolinker-dashboard-view";

export class DashboardView extends ItemView {
  private plugin: SemanticAutolinkerPlugin;
  private unsubscribeProgress?: () => void;
  private activityLogs: string[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: SemanticAutolinkerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  public getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return "Semantic Auto-Linker Dashboard";
  }

  public getIcon(): string {
    return "layout-dashboard";
  }

  public async onOpen(): Promise<void> {
    await this.render();
    this.unsubscribeProgress = this.plugin.jobManager.progressManager.subscribe((state) => {
      this.updateProgressUI(state);
    });
  }

  public async onClose(): Promise<void> {
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
    }
  }

  public logActivity(message: string): void {
    const time = new Date().toLocaleTimeString();
    this.activityLogs.push(`[${time}] ${message}`);
    if (this.activityLogs.length > 200) this.activityLogs.shift();
    const listEl = this.contentEl.querySelector(".semantic-activity-list");
    if (listEl) {
      const item = document.createElement("div");
      item.className = "semantic-activity-item";
      item.innerHTML = `<span class="semantic-activity-time">[${time}]</span> <span>${message}</span>`;
      listEl.appendChild(item);
    }
  }

  private async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("semantic-autolinker-container");

    // Header
    const header = container.createDiv({ cls: "semantic-autolinker-header" });
    header.createEl("h2", { text: "Semantic Auto-Linker" });

    // Active Note banner
    const activeFile = this.app.workspace.getActiveFile();
    const activeNoteCard = container.createDiv({ cls: "semantic-active-note-card" });
    if (activeFile && activeFile.extension === "md") {
      activeNoteCard.createEl("span", {
        text: `📄 Active Note: ${activeFile.basename}`,
        cls: "semantic-active-note-title",
      });
    } else {
      activeNoteCard.createEl("span", {
        text: "📄 No active markdown note open in editor",
        cls: "semantic-active-note-dim",
      });
    }

    // Quick Action Bar for Instant Auto-Linking
    const quickBar = container.createDiv({ cls: "semantic-actions-bar" });
    const quickLinkBtn = quickBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "⚡ Auto-Link Current Note (Instant)",
    });
    quickLinkBtn.addEventListener("click", async () => {
      this.logActivity(`Auto-linking current note...`);
      await this.plugin.autoLinkActiveNote(true);
      await this.render();
    });

    const proposeActiveBtn = quickBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "📋 Propose for Current Note",
    });
    proposeActiveBtn.addEventListener("click", async () => {
      this.logActivity(`Proposing links for current note...`);
      await this.plugin.autoLinkActiveNote(false);
      await this.render();
    });

    const linkTitleHeadingActiveBtn = quickBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "🏷️ Link by Titles & Headings Only",
    });
    linkTitleHeadingActiveBtn.addEventListener("click", async () => {
      this.logActivity("Auto-linking current note by titles & headings only...");
      const prev = this.plugin.settings.autolink.linkOnlyTitleHeading;
      this.plugin.settings.autolink.linkOnlyTitleHeading = true;
      try {
        await this.plugin.autoLinkActiveNote(true);
      } finally {
        this.plugin.settings.autolink.linkOnlyTitleHeading = prev;
      }
      await this.render();
    });

    const undoBtn = quickBar.createEl("button", {
      cls: "semantic-button-danger",
      text: "↩ Rollback Last Auto-Link",
    });
    undoBtn.addEventListener("click", async () => {
      await this.plugin.rollbackLastAutoLink();
      this.logActivity("Triggered rollback of last auto-link operation");
      await this.render();
    });

    // Metrics Grid: Base Obsidian Architecture
    const metricsGrid = container.createDiv({ cls: "semantic-metrics-grid" });

    const notesCount = this.plugin.indexManager.notes.size;
    const titleIndex = this.plugin.reviewManager.getTitleIndex();
    const titlesAliasesCount = titleIndex.titleCount + titleIndex.aliasCount;
    const headingsCount = titleIndex.headingCount;
    const keywordsCount = titleIndex.keywordCount;
    const proposals = await this.plugin.reviewManager.getProposals();
    const pendingCount = proposals.filter((p) => p.status === "pending").length;

    this.createMetricCard(metricsGrid, "Indexed Notes", String(notesCount), "notes-metric");
    this.createMetricCard(metricsGrid, "Titles & Aliases", String(titlesAliasesCount), "titles-metric");
    this.createMetricCard(metricsGrid, "Headings", String(headingsCount), "headings-metric");
    this.createMetricCard(metricsGrid, "Common Linkers", String(keywordsCount), "keywords-metric");
    this.createMetricCard(metricsGrid, "Pending Links", String(pendingCount), "proposals-metric");

    // Current Job & Progress Card
    const progressCard = container.createDiv({ cls: "semantic-progress-card" });
    const progHeader = progressCard.createDiv({ cls: "semantic-progress-header" });
    progHeader.createEl("h3", { text: "Full Vault Indexing Engine" });
    const statusBadge = progHeader.createEl("span", {
      cls: "semantic-autolinker-badge badge-pending",
      text: this.plugin.jobManager.getStatus()?.status || "Idle",
    });
    statusBadge.id = "semantic-job-status-badge";

    const progressBarBg = progressCard.createDiv({ cls: "semantic-progress-bar-bg" });
    const progressBarFill = progressBarBg.createDiv({ cls: "semantic-progress-bar-fill" });
    progressBarFill.style.width = "0%";

    const progDetails = progressCard.createDiv({ cls: "semantic-progress-details" });
    const stageText = progDetails.createEl("span", { text: "Stage: Idle" });
    stageText.id = "semantic-stage-text";
    const percentText = progDetails.createEl("span", { text: "0%" });
    percentText.id = "semantic-percent-text";

    // Vault Indexing Actions Bar
    const actionsBar = container.createDiv({ cls: "semantic-actions-bar" });

    const startBtn = actionsBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "Start Full Vault Scan",
    });
    startBtn.addEventListener("click", async () => {
      this.logActivity("Started full vault scan");
      await this.plugin.jobManager.startFullScan();
    });

    const pauseBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Pause",
    });
    pauseBtn.addEventListener("click", async () => {
      await this.plugin.jobManager.pause();
      this.logActivity("Job paused");
    });

    const resumeBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Resume",
    });
    resumeBtn.addEventListener("click", async () => {
      await this.plugin.jobManager.resume();
      this.logActivity("Job resumed");
    });

    const cancelBtn = actionsBar.createEl("button", {
      cls: "semantic-button-danger",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", async () => {
      await this.plugin.jobManager.cancel();
      this.logActivity("Job cancelled");
    });

    // Secondary Views Actions Bar
    const secondaryBar = container.createDiv({ cls: "semantic-actions-bar" });

    const autoLinkVaultBtn = secondaryBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "🌐 Auto-Link Entire Vault",
    });
    autoLinkVaultBtn.addEventListener("click", async () => {
      this.logActivity("Triggered vault-wide auto-linking");
      await this.plugin.autoLinkVault(true);
      await this.render();
    });

    const autoLinkVaultTitleHeadingBtn = secondaryBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "🏷️ Auto-Link Vault (Titles/Headings Only)",
    });
    autoLinkVaultTitleHeadingBtn.addEventListener("click", async () => {
      this.logActivity("Triggered vault-wide auto-linking by titles & headings only");
      const prev = this.plugin.settings.autolink.linkOnlyTitleHeading;
      this.plugin.settings.autolink.linkOnlyTitleHeading = true;
      try {
        await this.plugin.autoLinkVault(true);
      } finally {
        this.plugin.settings.autolink.linkOnlyTitleHeading = prev;
      }
      await this.render();
    });

    const reviewBtn = secondaryBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Review Link Proposals",
    });
    reviewBtn.addEventListener("click", async () => {
      await this.plugin.activateView(REVIEW_VIEW_TYPE);
    });

    // Activity Log Section
    container.createEl("h3", { text: "Recent Activity" });
    const activityList = container.createDiv({ cls: "semantic-activity-list" });
    for (const log of this.activityLogs) {
      const item = activityList.createDiv({ cls: "semantic-activity-item" });
      const match = log.match(/^(\[[^\]]+\])\s*(.*)$/);
      if (match) {
        item.createSpan({ cls: "semantic-activity-time", text: match[1] });
        item.createSpan({ text: ` ${match[2]}` });
      } else {
        item.setText(log);
      }
    }
  }

  private createMetricCard(parent: HTMLElement, label: string, value: string, id: string): void {
    const card = parent.createDiv({ cls: "semantic-metric-card" });
    const valEl = card.createDiv({ cls: "semantic-metric-value", text: value });
    valEl.id = id;
    card.createDiv({ cls: "semantic-metric-label", text: label });
  }

  private updateProgressUI(state: ProgressState): void {
    const fillEl = this.contentEl.querySelector(".semantic-progress-bar-fill") as HTMLElement;
    const stageEl = this.contentEl.querySelector("#semantic-stage-text") as HTMLElement;
    const percentEl = this.contentEl.querySelector("#semantic-percent-text") as HTMLElement;
    const statusBadge = this.contentEl.querySelector("#semantic-job-status-badge") as HTMLElement;

    const percent = Math.round(state.overallProgress * 100);
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.setText(`${percent}%`);
    if (stageEl) stageEl.setText(`Stage: ${state.currentStage} (${state.details})`);

    if (statusBadge) {
      const job = this.plugin.jobManager.getStatus();
      statusBadge.setText(job?.status || "Idle");
      statusBadge.className = `semantic-autolinker-badge badge-${job?.status || "pending"}`;
    }

    // Update notes count
    const notesEl = this.contentEl.querySelector("#notes-metric");
    if (notesEl) {
      notesEl.setText(String(this.plugin.indexManager.notes.size));
    }
    const relsEl = this.contentEl.querySelector("#rels-metric");
    if (relsEl) {
      relsEl.setText(String(this.plugin.indexManager.relationships.size));
    }
    const phrasesEl = this.contentEl.querySelector("#phrases-metric");
    if (phrasesEl) {
      phrasesEl.setText(String(this.plugin.reviewManager.getTitleIndex().phraseCount));
    }
  }
}
