import { ItemView, WorkspaceLeaf } from "obsidian";
import { JobManager } from "../jobs/job-manager";
import { ReviewManager } from "../autolink/review-manager";
import { ProgressState } from "../jobs/progress-manager";

export const DASHBOARD_VIEW_TYPE = "semantic-autolinker-dashboard-view";

export class DashboardView extends ItemView {
  private jobManager: JobManager;
  private reviewManager: ReviewManager;
  private unsubscribeProgress?: () => void;
  private activityLogs: string[] = [];

  constructor(leaf: WorkspaceLeaf, jobManager: JobManager, reviewManager: ReviewManager) {
    super(leaf);
    this.jobManager = jobManager;
    this.reviewManager = reviewManager;
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
    this.render();
    this.unsubscribeProgress = this.jobManager.progressManager.subscribe((state) => {
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
    if (this.activityLogs.length > 50) this.activityLogs.shift();
    const listEl = this.contentEl.querySelector(".semantic-activity-list");
    if (listEl) {
      const item = document.createElement("div");
      item.className = "semantic-activity-item";
      item.innerHTML = `<span class="semantic-activity-time">${time}</span> <span>${message}</span>`;
      listEl.appendChild(item);
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  private async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("semantic-autolinker-container");

    // Header
    const header = container.createDiv({ cls: "semantic-autolinker-header" });
    header.createEl("h2", { text: "Semantic Auto-Linker & Knowledge Graph" });

    // Metrics Grid
    const metricsGrid = container.createDiv({ cls: "semantic-metrics-grid" });

    const notesCount = (this.jobManager as any).indexManager.notes.size;
    const relsCount = (this.jobManager as any).indexManager.relationships.size;
    const proposals = await this.reviewManager.getProposals();
    const pendingCount = proposals.filter(p => p.status === "pending").length;

    this.createMetricCard(metricsGrid, "Notes Indexed", String(notesCount), "notes-metric");
    this.createMetricCard(metricsGrid, "Relationships", String(relsCount), "rels-metric");
    this.createMetricCard(metricsGrid, "Pending Links", String(pendingCount), "proposals-metric");

    // Current Job & Progress Card
    const progressCard = container.createDiv({ cls: "semantic-progress-card" });
    const progHeader = progressCard.createDiv({ cls: "semantic-progress-header" });
    progHeader.createEl("h3", { text: "Current Job Status" });
    const statusBadge = progHeader.createEl("span", {
      cls: "semantic-autolinker-badge badge-pending",
      text: this.jobManager.getStatus()?.status || "Idle",
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

    // Action Buttons Bar
    const actionsBar = container.createDiv({ cls: "semantic-actions-bar" });

    const startBtn = actionsBar.createEl("button", {
      cls: "semantic-button-primary",
      text: "Start Vault Scan",
    });
    startBtn.addEventListener("click", async () => {
      this.logActivity("Started full vault scan");
      await this.jobManager.startFullScan();
    });

    const pauseBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Pause",
    });
    pauseBtn.addEventListener("click", async () => {
      await this.jobManager.pause();
      this.logActivity("Job paused");
    });

    const resumeBtn = actionsBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Resume",
    });
    resumeBtn.addEventListener("click", async () => {
      await this.jobManager.resume();
      this.logActivity("Job resumed");
    });

    const cancelBtn = actionsBar.createEl("button", {
      cls: "semantic-button-danger",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", async () => {
      await this.jobManager.cancel();
      this.logActivity("Job cancelled");
    });

    // Secondary Actions Bar
    const secondaryBar = container.createDiv({ cls: "semantic-actions-bar" });

    const openGraphBtn = secondaryBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Open Knowledge Graph",
    });
    openGraphBtn.addEventListener("click", () => {
      this.app.workspace.getLeavesOfType("semantic-autolinker-graph-view")[0]?.setViewState({
        type: "semantic-autolinker-graph-view",
        active: true,
      });
    });

    const reviewBtn = secondaryBar.createEl("button", {
      cls: "semantic-button-secondary",
      text: "Review Link Proposals",
    });
    reviewBtn.addEventListener("click", () => {
      this.app.workspace.getLeavesOfType("semantic-autolinker-review-view")[0]?.setViewState({
        type: "semantic-autolinker-review-view",
        active: true,
      });
    });

    // Activity Log Section
    container.createEl("h3", { text: "Recent Activity" });
    const activityList = container.createDiv({ cls: "semantic-activity-list" });
    for (const log of this.activityLogs) {
      const item = activityList.createDiv({ cls: "semantic-activity-item" });
      item.setText(log);
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
      const job = this.jobManager.getStatus();
      statusBadge.setText(job?.status || "Idle");
      statusBadge.className = `semantic-autolinker-badge badge-${job?.status || "pending"}`;
    }

    // Update notes count
    const notesEl = this.contentEl.querySelector("#notes-metric");
    if (notesEl) {
      notesEl.setText(String((this.jobManager as any).indexManager.notes.size));
    }
    const relsEl = this.contentEl.querySelector("#rels-metric");
    if (relsEl) {
      relsEl.setText(String((this.jobManager as any).indexManager.relationships.size));
    }
  }
}
