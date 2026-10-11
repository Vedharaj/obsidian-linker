import { IPluginStorage } from "../storage/storage-interface";
import { LinkProposal, UndoRecord } from "../types";
import { MarkdownRewriter } from "./markdown-rewriter";
import { computeContentHash } from "../indexing/content-hash";

export class UndoManager {
  private storage: IPluginStorage;

  constructor(storage: IPluginStorage) {
    this.storage = storage;
  }

  /**
   * Applies approved link proposals to a note file, creating an atomic UndoRecord before modifying.
   */
  public async applyProposalsWithUndo(
    sourcePath: string,
    proposals: LinkProposal[],
    readFile: (path: string) => Promise<string>,
    writeFile: (path: string, content: string) => Promise<void>
  ): Promise<{ success: boolean; appliedCount: number; error?: string }> {
    const originalContent = await readFile(sourcePath);
    const originalHash = computeContentHash(originalContent);

    const rewriteResult = MarkdownRewriter.rewriteContent(originalContent, proposals);
    if (!rewriteResult.success || rewriteResult.appliedProposals.length === 0) {
      return {
        success: false,
        appliedCount: 0,
        error: rewriteResult.error || "No eligible approved proposals to apply",
      };
    }

    // Save UndoRecord first
    const undoId = `undo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const undoRecord: UndoRecord = {
      id: undoId,
      sourcePath,
      originalContent,
      newContent: rewriteResult.modifiedContent,
      originalContentHash: originalHash,
      appliedContentHash: rewriteResult.newContentHash,
      timestamp: Date.now(),
      proposalIds: rewriteResult.appliedProposals.map(p => p.id),
    };

    await this.storage.saveUndoRecord(undoRecord);

    // Write modified content to disk/vault
    await writeFile(sourcePath, rewriteResult.modifiedContent);

    // Update proposal statuses in storage
    for (const p of rewriteResult.appliedProposals) {
      await this.storage.updateProposalStatus(p.id, "applied");
    }

    return {
      success: true,
      appliedCount: rewriteResult.appliedProposals.length,
    };
  }

  /**
   * Rolls back a specific undo record, restoring the note's original content.
   */
  public async rollback(
    recordId: string,
    readFile: (path: string) => Promise<string>,
    writeFile: (path: string, content: string) => Promise<void>
  ): Promise<{ success: boolean; error?: string }> {
    const record = await this.storage.getUndoRecord(recordId);
    if (!record) {
      return { success: false, error: "Undo record not found" };
    }

    // Verify current content hasn't drifted unpredictably
    const currentContent = await readFile(record.sourcePath);
    const currentHash = computeContentHash(currentContent);

    if (currentHash !== record.appliedContentHash) {
      return {
        success: false,
        error: `Cannot rollback safely: file '${record.sourcePath}' was edited after auto-link was applied.`,
      };
    }

    // Restore original content
    await writeFile(record.sourcePath, record.originalContent);

    // Remove or mark undo record
    await this.storage.deleteUndoRecord(record.id);

    // Revert proposal statuses
    for (const propId of record.proposalIds) {
      await this.storage.updateProposalStatus(propId, "pending");
    }

    return { success: true };
  }

  public async getHistory(): Promise<UndoRecord[]> {
    const list = await this.storage.getUndoRecords();
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }
}
