import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../src/storage/memory-storage";
import { CheckpointManager } from "../src/jobs/checkpoint-manager";
import { JobRecord } from "../src/types";

describe("Checkpoint Manager and Job State", () => {
  it("persists checkpoints and restores job state", async () => {
    const storage = new MemoryStorage();
    const checkpointManager = new CheckpointManager(storage);

    const jobId = "job_test_123";
    const jobRecord: JobRecord = {
      id: jobId,
      status: "running",
      stage: "similarity",
      totalItems: 50,
      processedItems: 25,
      startedAt: Date.now() - 5000,
      updatedAt: Date.now(),
      errorCount: 0,
    };

    await storage.saveJob(jobRecord);

    const completedNotes = ["note1.md", "note2.md", "note3.md"];
    await checkpointManager.saveCheckpoint(jobId, "similarity", completedNotes, 50, {
      candidatePairsProcessed: 120,
    });

    const retrieved = await checkpointManager.getCheckpoint(jobId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.stage).toBe("similarity");
    expect(retrieved?.completedNoteIds).toEqual(completedNotes);
    expect(retrieved?.metadata?.candidatePairsProcessed).toBe(120);

    const latestJob = await storage.getLatestJob();
    expect(latestJob?.id).toBe(jobId);
    expect(latestJob?.status).toBe("running");

    // Clear checkpoint on completion
    await checkpointManager.clearCheckpoint(jobId);
    const afterClear = await checkpointManager.getCheckpoint(jobId);
    expect(afterClear).toBeFalsy();
  });
});
