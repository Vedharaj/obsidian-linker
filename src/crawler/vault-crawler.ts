import { App, TFile } from "obsidian";
import { FileFilter } from "./file-filter";
import { computeContentHash } from "../indexing/content-hash";

export interface DiscoveredFile {
  path: string;
  basename: string;
  size: number;
}

export interface IVaultAdapter {
  getMarkdownFiles(): Promise<DiscoveredFile[]>;
  read(path: string): Promise<string>;
}

export class ObsidianVaultAdapter implements IVaultAdapter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  public async getMarkdownFiles(): Promise<DiscoveredFile[]> {
    const files = this.app.vault.getMarkdownFiles();
    return files.map((f: TFile) => ({
      path: f.path,
      basename: f.basename,
      size: f.stat.size,
    }));
  }

  public async read(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    throw new Error(`File not found or not a valid TFile: ${path}`);
  }
}

export interface CrawledNoteData {
  path: string;
  title: string;
  content: string;
  contentHash: string;
  sizeBytes: number;
}

export interface CrawlerScanReport {
  totalDiscovered: number;
  filesIndexed: number;
  filesSkipped: number;
  bytesProcessed: number;
  durationMs: number;
  duplicateTitles: Map<string, string[]>;
  errors: Array<{ path: string; error: string }>;
  notes: Map<string, CrawledNoteData>;
}

export class VaultCrawler {
  private adapter: IVaultAdapter;
  private filter: FileFilter;

  constructor(adapter: IVaultAdapter, filter: FileFilter) {
    this.adapter = adapter;
    this.filter = filter;
  }

  public async crawlVault(
    onProgress?: (processed: number, total: number, currentPath: string) => void
  ): Promise<CrawlerScanReport> {
    const startTime = Date.now();
    const files = await this.adapter.getMarkdownFiles();

    const notes = new Map<string, CrawledNoteData>();
    const errors: Array<{ path: string; error: string }> = [];
    const titleToPaths = new Map<string, string[]>();

    let filesIndexed = 0;
    let filesSkipped = 0;
    let bytesProcessed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i, files.length, file.path);
      }

      const eligibility = this.filter.isEligible(file.path, file.size);
      if (!eligibility.eligible) {
        filesSkipped++;
        continue;
      }

      // Track duplicate titles
      const currentList = titleToPaths.get(file.basename) || [];
      currentList.push(file.path);
      titleToPaths.set(file.basename, currentList);

      try {
        const content = await this.adapter.read(file.path);
        const hash = computeContentHash(content);
        bytesProcessed += file.size;

        notes.set(file.path, {
          path: file.path,
          title: file.basename,
          content,
          contentHash: hash,
          sizeBytes: file.size,
        });
        filesIndexed++;
      } catch (err: any) {
        errors.push({
          path: file.path,
          error: err?.message || String(err),
        });
      }
    }

    if (onProgress) {
      onProgress(files.length, files.length, "Scan complete");
    }

    // Filter duplicate titles to only those with >1 occurrences
    const duplicateTitles = new Map<string, string[]>();
    for (const [title, paths] of titleToPaths.entries()) {
      if (paths.length > 1) {
        duplicateTitles.set(title, paths);
      }
    }

    return {
      totalDiscovered: files.length,
      filesIndexed,
      filesSkipped,
      bytesProcessed,
      durationMs: Date.now() - startTime,
      duplicateTitles,
      errors,
      notes,
    };
  }
}
