import { IPluginStorage } from "./storage-interface";
import { JobRecord, LinkProposal, NoteRecord, RelationshipRecord, UndoRecord } from "../types";

const DB_NAME = "obsidian-semantic-autolinker";
const DB_VERSION = 1;

export class IndexedDbStorage implements IPluginStorage {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName = DB_NAME) {
    this.dbName = dbName;
  }

  public async initialize(): Promise<void> {
    if (this.db) return;

    const idb = typeof window !== "undefined" ? window.indexedDB : (globalThis as any).indexedDB;
    if (!idb) {
      throw new Error("IndexedDB is not available in the current environment");
    }

    return new Promise((resolve, reject) => {
      const request = idb.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Notes store
        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "id" });
        }

        // Relationships store
        if (!db.objectStoreNames.contains("relationships")) {
          const relStore = db.createObjectStore("relationships", { keyPath: "id" });
          relStore.createIndex("sourceId", "sourceId", { unique: false });
          relStore.createIndex("targetId", "targetId", { unique: false });
          relStore.createIndex("score", "score", { unique: false });
        }

        // Jobs store
        if (!db.objectStoreNames.contains("jobs")) {
          const jobStore = db.createObjectStore("jobs", { keyPath: "id" });
          jobStore.createIndex("startedAt", "startedAt", { unique: false });
        }

        // Checkpoints store
        if (!db.objectStoreNames.contains("checkpoints")) {
          db.createObjectStore("checkpoints", { keyPath: "jobId" });
        }

        // Proposals store
        if (!db.objectStoreNames.contains("proposals")) {
          const propStore = db.createObjectStore("proposals", { keyPath: "id" });
          propStore.createIndex("sourcePath", "sourcePath", { unique: false });
          propStore.createIndex("status", "status", { unique: false });
        }

        // Undo store
        if (!db.objectStoreNames.contains("undo")) {
          const undoStore = db.createObjectStore("undo", { keyPath: "id" });
          undoStore.createIndex("sourcePath", "sourcePath", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
    });
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getStore(storeName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // --- Notes ---

  public async saveNote(note: NoteRecord): Promise<void> {
    const store = this.getStore("notes", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(note);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async saveNotes(notes: NoteRecord[]): Promise<void> {
    if (!this.db || notes.length === 0) return;
    const tx = this.db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const note of notes) {
        store.put(note);
      }
    });
  }

  public async getNote(id: string): Promise<NoteRecord | undefined> {
    const store = this.getStore("notes", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllNotes(): Promise<NoteRecord[]> {
    const store = this.getStore("notes", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteNote(id: string): Promise<void> {
    const store = this.getStore("notes", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Relationships ---

  private relKey(rel: RelationshipRecord): string {
    return `${rel.sourceId}:::${rel.targetId}`;
  }

  public async saveRelationship(rel: RelationshipRecord): Promise<void> {
    const store = this.getStore("relationships", "readwrite");
    return new Promise((resolve, reject) => {
      const entry = { ...rel, id: this.relKey(rel) };
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async saveRelationships(rels: RelationshipRecord[]): Promise<void> {
    if (!this.db || rels.length === 0) return;
    const tx = this.db.transaction("relationships", "readwrite");
    const store = tx.objectStore("relationships");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const rel of rels) {
        store.put({ ...rel, id: this.relKey(rel) });
      }
    });
  }

  public async getAllRelationships(): Promise<RelationshipRecord[]> {
    const store = this.getStore("relationships", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteRelationshipsForNote(noteId: string): Promise<void> {
    const all = await this.getAllRelationships();
    const toDelete = all.filter(r => r.sourceId === noteId || r.targetId === noteId);
    if (toDelete.length === 0) return;

    const tx = this.db!.transaction("relationships", "readwrite");
    const store = tx.objectStore("relationships");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const rel of toDelete) {
        store.delete(this.relKey(rel));
      }
    });
  }

  // --- Jobs & Checkpoints ---

  public async saveJob(job: JobRecord): Promise<void> {
    const store = this.getStore("jobs", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(job);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getJob(id: string): Promise<JobRecord | undefined> {
    const store = this.getStore("jobs", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async getLatestJob(): Promise<JobRecord | undefined> {
    const store = this.getStore("jobs", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const jobs: JobRecord[] = req.result || [];
        if (jobs.length === 0) return resolve(undefined);
        jobs.sort((a, b) => b.startedAt - a.startedAt);
        resolve(jobs[0]);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async saveCheckpoint(jobId: string, checkpointData: any): Promise<void> {
    const store = this.getStore("checkpoints", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put({ jobId, data: checkpointData, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getCheckpoint(jobId: string): Promise<any | undefined> {
    const store = this.getStore("checkpoints", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(jobId);
      req.onsuccess = () => resolve(req.result ? req.result.data : undefined);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Proposals ---

  public async saveProposal(proposal: LinkProposal): Promise<void> {
    const store = this.getStore("proposals", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(proposal);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async saveProposals(proposals: LinkProposal[]): Promise<void> {
    if (!this.db || proposals.length === 0) return;
    const tx = this.db.transaction("proposals", "readwrite");
    const store = tx.objectStore("proposals");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const p of proposals) {
        store.put(p);
      }
    });
  }

  public async getProposals(sourcePath?: string): Promise<LinkProposal[]> {
    const store = this.getStore("proposals", "readonly");
    return new Promise((resolve, reject) => {
      if (sourcePath) {
        const idx = store.index("sourcePath");
        const req = idx.getAll(sourcePath);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }
    });
  }

  public async updateProposalStatus(id: string, status: LinkProposal["status"]): Promise<void> {
    const store = this.getStore("proposals", "readwrite");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) return resolve();
        item.status = status;
        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // --- Undo ---

  public async saveUndoRecord(record: UndoRecord): Promise<void> {
    const store = this.getStore("undo", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getUndoRecords(): Promise<UndoRecord[]> {
    const store = this.getStore("undo", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getUndoRecord(id: string): Promise<UndoRecord | undefined> {
    const store = this.getStore("undo", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteUndoRecord(id: string): Promise<void> {
    const store = this.getStore("undo", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async clearAll(): Promise<void> {
    if (!this.db) return;
    const storeNames = ["notes", "relationships", "jobs", "checkpoints", "proposals", "undo"];
    const tx = this.db.transaction(storeNames, "readwrite");
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }
    });
  }
}
