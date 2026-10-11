import { FileFilterSettings } from "../types";

export interface FilterResult {
  eligible: boolean;
  reason?: string;
}

export class FileFilter {
  private settings: FileFilterSettings;

  constructor(settings: FileFilterSettings) {
    this.settings = settings;
  }

  public updateSettings(settings: FileFilterSettings): void {
    this.settings = settings;
  }

  public isEligible(path: string, sizeBytes?: number): FilterResult {
    // Must be markdown
    const lowerPath = path.toLowerCase();
    if (!lowerPath.endsWith(".md") && !lowerPath.endsWith(".markdown")) {
      return { eligible: false, reason: "Not a markdown file" };
    }

    // Split path into segments
    const segments = path.split("/").filter(Boolean);

    // Check hidden folders
    if (!this.settings.includeHiddenFolders) {
      for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i].startsWith(".")) {
          return { eligible: false, reason: `Inside hidden directory '${segments[i]}'` };
        }
      }
    }

    // Check excluded folders
    for (const folder of this.settings.excludedFolders) {
      const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
      if (!cleanFolder) continue;

      if (segments.some(seg => seg === cleanFolder)) {
        return { eligible: false, reason: `Inside excluded folder '${cleanFolder}'` };
      }
      if (path.startsWith(cleanFolder + "/") || path === cleanFolder) {
        return { eligible: false, reason: `Matches excluded folder path '${cleanFolder}'` };
      }
    }

    // Check explicitly excluded paths
    for (const excPath of this.settings.excludedPaths) {
      if (path === excPath || path.startsWith(excPath + "/")) {
        return { eligible: false, reason: `Matches excluded path '${excPath}'` };
      }
    }

    // Check file size
    if (sizeBytes !== undefined && sizeBytes > this.settings.maximumFileSizeBytes) {
      return {
        eligible: false,
        reason: `File size (${sizeBytes} bytes) exceeds limit of ${this.settings.maximumFileSizeBytes} bytes`,
      };
    }

    return { eligible: true };
  }
}
