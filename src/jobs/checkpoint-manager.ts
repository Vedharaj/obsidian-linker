import { IPluginStorage } from "../storage/storage-interface";
import { ProcessingStage } from "../types";

export interface CheckpointData {
  jobId: string;
  stage: ProcessingStage;
  completedNoteIds: string[];
  totalNotes: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class CheckpointManager {
  private storage: IPluginStorage;

  constructor(storage: IPluginStorage) {
    this.storage = storage;
  }

  public async saveCheckpoint(
    jobId: string,
    stage: ProcessingStage,
    completedNoteIds: string[],
    totalNotes: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const data: CheckpointData = {
      jobId,
      stage,
      completedNoteIds: Array.from(new Set(completedNoteIds)),
      totalNotes,
      timestamp: Date.now(),
      metadata,
    };
    await this.storage.saveCheckpoint(jobId, data);
  }

  public async getCheckpoint(jobId: string): Promise<CheckpointData | undefined> {
    return await this.storage.getCheckpoint(jobId);
  }

  public async clearCheckpoint(jobId: string): Promise<void> {
    await this.storage.saveCheckpoint(jobId, null);
  }
}
