import { IPluginStorage } from "./storage-interface";
import { JobRecord, LinkProposal, NoteRecord, RelationshipRecord, UndoRecord } from "../types";

export class MemoryStorage implements IPluginStorage {
  private notes = new Map<string, NoteRecord>();
  private relationships = new Map<string, RelationshipRecord>();
  private jobs = new Map<string, JobRecord>();
  private checkpoints = new Map<string, any>();
  private proposals = new Map<string, LinkProposal>();
  private undoRecords = new Map<string, UndoRecord>();

  public async initialize(): Promise<void> {}
  public async close(): Promise<void> {}

  public async saveNote(note: NoteRecord): Promise<void> {
    this.notes.set(note.id, { ...note });
  }

  public async saveNotes(notes: NoteRecord[]): Promise<void> {
    for (const note of notes) {
      this.notes.set(note.id, { ...note });
    }
  }

  public async getNote(id: string): Promise<NoteRecord | undefined> {
    const n = this.notes.get(id);
    return n ? { ...n } : undefined;
  }

  public async getAllNotes(): Promise<NoteRecord[]> {
    return Array.from(this.notes.values()).map(n => ({ ...n }));
  }

  public async deleteNote(id: string): Promise<void> {
    this.notes.delete(id);
  }

  private relKey(rel: RelationshipRecord): string {
    return `${rel.sourceId}:::${rel.targetId}`;
  }

  public async saveRelationship(rel: RelationshipRecord): Promise<void> {
    this.relationships.set(this.relKey(rel), { ...rel });
  }

  public async saveRelationships(rels: RelationshipRecord[]): Promise<void> {
    for (const rel of rels) {
      this.relationships.set(this.relKey(rel), { ...rel });
    }
  }

  public async getAllRelationships(): Promise<RelationshipRecord[]> {
    return Array.from(this.relationships.values()).map(r => ({ ...r }));
  }

  public async deleteRelationshipsForNote(noteId: string): Promise<void> {
    for (const [key, rel] of this.relationships.entries()) {
      if (rel.sourceId === noteId || rel.targetId === noteId) {
        this.relationships.delete(key);
      }
    }
  }

  public async saveJob(job: JobRecord): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  public async getJob(id: string): Promise<JobRecord | undefined> {
    const j = this.jobs.get(id);
    return j ? { ...j } : undefined;
  }

  public async getLatestJob(): Promise<JobRecord | undefined> {
    const list = Array.from(this.jobs.values());
    if (list.length === 0) return undefined;
    list.sort((a, b) => b.startedAt - a.startedAt);
    return { ...list[0] };
  }

  public async saveCheckpoint(jobId: string, checkpointData: any): Promise<void> {
    this.checkpoints.set(jobId, JSON.parse(JSON.stringify(checkpointData)));
  }

  public async getCheckpoint(jobId: string): Promise<any | undefined> {
    const data = this.checkpoints.get(jobId);
    return data ? JSON.parse(JSON.stringify(data)) : undefined;
  }

  public async saveProposal(proposal: LinkProposal): Promise<void> {
    this.proposals.set(proposal.id, { ...proposal });
  }

  public async saveProposals(proposals: LinkProposal[]): Promise<void> {
    for (const p of proposals) {
      this.proposals.set(p.id, { ...p });
    }
  }

  public async getProposals(sourcePath?: string): Promise<LinkProposal[]> {
    const list = Array.from(this.proposals.values());
    if (sourcePath) {
      return list.filter(p => p.sourcePath === sourcePath).map(p => ({ ...p }));
    }
    return list.map(p => ({ ...p }));
  }

  public async updateProposalStatus(id: string, status: LinkProposal["status"]): Promise<void> {
    const p = this.proposals.get(id);
    if (p) {
      p.status = status;
    }
  }

  public async saveUndoRecord(record: UndoRecord): Promise<void> {
    this.undoRecords.set(record.id, { ...record });
  }

  public async getUndoRecords(): Promise<UndoRecord[]> {
    return Array.from(this.undoRecords.values()).map(u => ({ ...u }));
  }

  public async getUndoRecord(id: string): Promise<UndoRecord | undefined> {
    const u = this.undoRecords.get(id);
    return u ? { ...u } : undefined;
  }

  public async deleteUndoRecord(id: string): Promise<void> {
    this.undoRecords.delete(id);
  }

  public async clearAll(): Promise<void> {
    this.notes.clear();
    this.relationships.clear();
    this.jobs.clear();
    this.checkpoints.clear();
    this.proposals.clear();
    this.undoRecords.clear();
  }
}
