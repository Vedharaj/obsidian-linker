import { JobRecord, LinkProposal, NoteRecord, RelationshipRecord, UndoRecord } from "../types";

export interface IPluginStorage {
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Notes
  saveNote(note: NoteRecord): Promise<void>;
  saveNotes(notes: NoteRecord[]): Promise<void>;
  getNote(id: string): Promise<NoteRecord | undefined>;
  getAllNotes(): Promise<NoteRecord[]>;
  deleteNote(id: string): Promise<void>;

  // Relationships
  saveRelationship(rel: RelationshipRecord): Promise<void>;
  saveRelationships(rels: RelationshipRecord[]): Promise<void>;
  getAllRelationships(): Promise<RelationshipRecord[]>;
  deleteRelationshipsForNote(noteId: string): Promise<void>;

  // Jobs & Checkpoints
  saveJob(job: JobRecord): Promise<void>;
  getJob(id: string): Promise<JobRecord | undefined>;
  getLatestJob(): Promise<JobRecord | undefined>;
  saveCheckpoint(jobId: string, checkpointData: any): Promise<void>;
  getCheckpoint(jobId: string): Promise<any | undefined>;

  // Proposals
  saveProposal(proposal: LinkProposal): Promise<void>;
  saveProposals(proposals: LinkProposal[]): Promise<void>;
  getProposals(sourcePath?: string): Promise<LinkProposal[]>;
  updateProposalStatus(id: string, status: LinkProposal["status"]): Promise<void>;

  // Undo History
  saveUndoRecord(record: UndoRecord): Promise<void>;
  getUndoRecords(): Promise<UndoRecord[]>;
  getUndoRecord(id: string): Promise<UndoRecord | undefined>;
  deleteUndoRecord(id: string): Promise<void>;

  // Clear all
  clearAll(): Promise<void>;
}
