import { ProcessingStage } from "../types";

export interface StageWeightConfig {
  discover: number;
  preprocess: number;
  keywords: number;
  similarity: number;
  graph: number;
  persist: number;
  validate: number;
}

export const DEFAULT_STAGE_WEIGHTS: StageWeightConfig = {
  discover: 0.05,
  preprocess: 0.15,
  keywords: 0.15,
  similarity: 0.35,
  graph: 0.15,
  persist: 0.10,
  validate: 0.05,
};

export interface ProgressState {
  currentStage: ProcessingStage;
  stageProgress: number; // 0 to 1
  overallProgress: number; // 0 to 1
  completedUnits: number;
  totalUnits: number;
  details: string;
  durationMs: number;
  estimatedRemainingMs?: number;
}

export type ProgressListener = (state: ProgressState) => void;

export class ProgressManager {
  private weights: StageWeightConfig;
  private currentStage: ProcessingStage = "discover";
  private stageCompleted: Record<ProcessingStage, number>;
  private stageTotal: Record<ProcessingStage, number>;
  private maxOverallProgress = 0;
  private startTime = 0;
  private listeners: Set<ProgressListener> = new Set();
  private details = "";

  constructor(weights: StageWeightConfig = DEFAULT_STAGE_WEIGHTS) {
    this.weights = weights;
    this.stageCompleted = {
      discover: 0,
      preprocess: 0,
      keywords: 0,
      similarity: 0,
      graph: 0,
      persist: 0,
      validate: 0,
      complete: 1,
    };
    this.stageTotal = {
      discover: 1,
      preprocess: 1,
      keywords: 1,
      similarity: 1,
      graph: 1,
      persist: 1,
      validate: 1,
      complete: 1,
    };
  }

  public reset(): void {
    this.currentStage = "discover";
    this.maxOverallProgress = 0;
    this.startTime = Date.now();
    this.details = "Starting scan...";
    for (const key of Object.keys(this.stageCompleted) as ProcessingStage[]) {
      this.stageCompleted[key] = 0;
      this.stageTotal[key] = 1;
    }
    this.notify();
  }

  public subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setStage(stage: ProcessingStage, totalUnits = 1, details = ""): void {
    // If transitioning from previous stage, mark previous stage complete
    const stages: ProcessingStage[] = [
      "discover",
      "preprocess",
      "keywords",
      "similarity",
      "graph",
      "persist",
      "validate",
    ];
    const prevIdx = stages.indexOf(this.currentStage);
    const newIdx = stages.indexOf(stage);

    if (newIdx > prevIdx) {
      for (let i = 0; i < newIdx; i++) {
        const s = stages[i];
        this.stageCompleted[s] = this.stageTotal[s] || 1;
      }
    }

    this.currentStage = stage;
    this.stageTotal[stage] = Math.max(1, totalUnits);
    this.stageCompleted[stage] = 0;
    if (details) this.details = details;

    this.notify();
  }

  public updateWork(completedUnits: number, totalUnits?: number, details?: string): void {
    if (totalUnits !== undefined && totalUnits > 0) {
      this.stageTotal[this.currentStage] = totalUnits;
    }
    this.stageCompleted[this.currentStage] = Math.min(
      this.stageTotal[this.currentStage],
      completedUnits
    );
    if (details !== undefined) {
      this.details = details;
    }

    this.notify();
  }

  public getStageProgress(stage: ProcessingStage): number {
    const total = this.stageTotal[stage] || 1;
    const completed = this.stageCompleted[stage] || 0;
    return Math.min(1, Math.max(0, completed / total));
  }

  public getOverallProgress(): number {
    if (this.currentStage === "complete") return 1.0;

    let overall = 0;
    overall += (this.weights.discover || 0) * this.getStageProgress("discover");
    overall += (this.weights.preprocess || 0) * this.getStageProgress("preprocess");
    overall += (this.weights.keywords || 0) * this.getStageProgress("keywords");
    overall += (this.weights.similarity || 0) * this.getStageProgress("similarity");
    overall += (this.weights.graph || 0) * this.getStageProgress("graph");
    overall += (this.weights.persist || 0) * this.getStageProgress("persist");
    overall += (this.weights.validate || 0) * this.getStageProgress("validate");

    // Monotonic guarantee: never regress
    if (overall > this.maxOverallProgress) {
      this.maxOverallProgress = overall;
    }

    // Never show 100% until complete
    return Math.min(0.99, Math.round(this.maxOverallProgress * 1000) / 1000);
  }

  public getState(): ProgressState {
    const overall = this.currentStage === "complete" ? 1.0 : this.getOverallProgress();
    const durationMs = this.startTime > 0 ? Date.now() - this.startTime : 0;

    let estimatedRemainingMs: number | undefined;
    if (overall > 0.05 && overall < 1.0 && durationMs > 1000) {
      const estimatedTotal = durationMs / overall;
      estimatedRemainingMs = Math.max(0, Math.round(estimatedTotal - durationMs));
    }

    return {
      currentStage: this.currentStage,
      stageProgress: this.getStageProgress(this.currentStage),
      overallProgress: overall,
      completedUnits: this.stageCompleted[this.currentStage] || 0,
      totalUnits: this.stageTotal[this.currentStage] || 1,
      details: this.details,
      durationMs,
      estimatedRemainingMs,
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("Error in progress listener:", err);
      }
    }
  }
}
