import { NoteRecord } from "../types";

export interface VaultFileItem {
  path: string;
  sizeBytes?: number;
  contentHash?: string;
}

export interface DiffReport {
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ oldPath: string; newPath: string; noteId: string }>;
  unchanged: string[];
}

export class ChangeDetector {
  /**
   * Compares the current vault files against existing indexed note records.
   */
  public detectChanges(
    currentFiles: VaultFileItem[],
    indexedNotes: Map<string, NoteRecord>
  ): DiffReport {
    const currentPaths = new Set(currentFiles.map(f => f.path));
    const indexedPaths = new Set(indexedNotes.keys());

    const added: string[] = [];
    const modified: string[] = [];
    const unchanged: string[] = [];
    const deleted: string[] = [];
    const renamed: Array<{ oldPath: string; newPath: string; noteId: string }> = [];

    // Map content hashes of currently missing indexed notes to detect renames
    const missingIndexedByHash = new Map<string, NoteRecord>();
    for (const [path, record] of indexedNotes.entries()) {
      if (!currentPaths.has(path)) {
        missingIndexedByHash.set(record.contentHash, record);
      }
    }

    const handledAddedPaths = new Set<string>();

    for (const current of currentFiles) {
      const existing = indexedNotes.get(current.path);
      if (!existing) {
        // Check if this newly discovered file matches a missing note's content hash
        if (current.contentHash && missingIndexedByHash.has(current.contentHash)) {
          const oldRecord = missingIndexedByHash.get(current.contentHash)!;
          renamed.push({
            oldPath: oldRecord.path,
            newPath: current.path,
            noteId: oldRecord.id,
          });
          missingIndexedByHash.delete(current.contentHash);
          handledAddedPaths.add(current.path);
        } else {
          added.push(current.path);
        }
      } else {
        // Exists in both
        if (current.contentHash && current.contentHash !== existing.contentHash) {
          modified.push(current.path);
        } else {
          unchanged.push(current.path);
        }
      }
    }

    // Any missing indexed note not resolved as renamed is considered deleted
    for (const [path, record] of indexedNotes.entries()) {
      if (!currentPaths.has(path)) {
        if (!renamed.some(r => r.oldPath === path)) {
          deleted.push(path);
        }
      }
    }

    return {
      added,
      modified,
      deleted,
      renamed,
      unchanged,
    };
  }
}
