import { IPluginStorage } from "../storage/storage-interface";
import { AutolinkSettings, LinkProposal, NoteRecord } from "../types";
import { TitleIndex } from "./title-index";
import { LinkProposer } from "./link-proposer";
import { UndoManager } from "./undo-manager";

export class ReviewManager {
  private storage: IPluginStorage;
  private settings: AutolinkSettings;
  private titleIndex: TitleIndex;
  private proposer: LinkProposer;
  public undoManager: UndoManager;

  constructor(storage: IPluginStorage, settings: AutolinkSettings) {
    this.storage = storage;
    this.settings = settings;
    this.titleIndex = new TitleIndex();
    this.proposer = new LinkProposer(this.titleIndex, settings);
    this.undoManager = new UndoManager(storage);
  }

  public getTitleIndex(): TitleIndex {
    return this.titleIndex;
  }

  public getProposer(): LinkProposer {
    return this.proposer;
  }

  public updateSettings(settings: AutolinkSettings): void {
    this.settings = settings;
    this.proposer.updateSettings(settings);
  }

  public async generateProposalsForVault(
    notes: Map<string, NoteRecord>,
    readFile: (path: string) => Promise<string>
  ): Promise<LinkProposal[]> {
    this.titleIndex.buildIndex(
      notes,
      this.settings.matchAliases,
      this.settings.linkHeadings ?? true,
      this.settings.linkOnlyTitleHeading === true
    );

    const allProposals: LinkProposal[] = [];

    for (const note of notes.values()) {
      try {
        const content = await readFile(note.path);
        const noteProposals = this.proposer.generateProposals(note.path, content);
        allProposals.push(...noteProposals);
      } catch (err) {
        console.error(`Failed to generate proposals for note ${note.path}:`, err);
      }
    }

    await this.storage.saveProposals(allProposals);
    return allProposals;
  }

  public async getProposals(sourcePath?: string): Promise<LinkProposal[]> {
    return await this.storage.getProposals(sourcePath);
  }

  public async approveProposal(id: string): Promise<void> {
    await this.storage.updateProposalStatus(id, "approved");
  }

  public async rejectProposal(id: string): Promise<void> {
    await this.storage.updateProposalStatus(id, "rejected");
  }

  public async approveAll(sourcePath?: string): Promise<void> {
    const list = await this.storage.getProposals(sourcePath);
    for (const p of list) {
      if (p.status === "pending") {
        await this.storage.updateProposalStatus(p.id, "approved");
      }
    }
  }

  public async rejectAll(sourcePath?: string): Promise<void> {
    const list = await this.storage.getProposals(sourcePath);
    for (const p of list) {
      if (p.status === "pending") {
        await this.storage.updateProposalStatus(p.id, "rejected");
      }
    }
  }

  public async applyApproved(
    sourcePath: string,
    readFile: (path: string) => Promise<string>,
    writeFile: (path: string, content: string) => Promise<void>
  ): Promise<{ success: boolean; appliedCount: number; error?: string }> {
    const proposals = await this.storage.getProposals(sourcePath);
    const approved = proposals.filter(p => p.status === "approved");
    if (approved.length === 0) {
      return { success: false, appliedCount: 0, error: "No approved proposals for this note" };
    }

    return await this.undoManager.applyProposalsWithUndo(sourcePath, approved, readFile, writeFile);
  }

  public async applyProposalsDirectly(
    sourcePath: string,
    proposals: LinkProposal[],
    readFile: (path: string) => Promise<string>,
    writeFile: (path: string, content: string) => Promise<void>
  ): Promise<{ success: boolean; appliedCount: number; error?: string }> {
    for (const p of proposals) {
      p.status = "approved";
    }
    await this.storage.saveProposals(proposals);
    return await this.undoManager.applyProposalsWithUndo(sourcePath, proposals, readFile, writeFile);
  }
}
