import { NoteRecord, RelationshipRecord, SemanticAutolinkerSettings } from "../types";
import { InvertedIndex } from "./inverted-index";
import { SparseVector, TfIdfEngine } from "./tfidf";
import { LinkAnalyzer } from "../relationships/link-analyzer";
import { RelationshipScorer } from "../relationships/relationship-scorer";
import { CandidateGenerator } from "../relationships/candidate-generator";
import { IPluginStorage } from "../storage/storage-interface";
import { MarkdownParser } from "../markdown/markdown-parser";
import { Tokenizer } from "../markdown/tokenizer";
import { computeContentHash } from "./content-hash";

export class IndexManager {
  public notes = new Map<string, NoteRecord>();
  public vectors = new Map<string, SparseVector>();
  public termFrequencies = new Map<string, Map<string, number>>();
  public noteTotalTerms = new Map<string, number>();
  public invertedIndex = new InvertedIndex();
  public relationships = new Map<string, RelationshipRecord>();
  public linkAnalyzer = new LinkAnalyzer();

  private storage: IPluginStorage;
  private settings: SemanticAutolinkerSettings;
  private tokenizer: Tokenizer;
  private scorer: RelationshipScorer;
  private candidateGenerator: CandidateGenerator;

  constructor(storage: IPluginStorage, settings: SemanticAutolinkerSettings) {
    this.storage = storage;
    this.settings = settings;
    this.tokenizer = new Tokenizer(settings.similarity.stopwords);
    this.scorer = new RelationshipScorer(settings.similarity.scoringWeights, this.linkAnalyzer);
    this.candidateGenerator = new CandidateGenerator(this.invertedIndex, this.scorer, settings.similarity);
  }

  public updateSettings(settings: SemanticAutolinkerSettings): void {
    this.settings = settings;
    this.tokenizer.setStopwords(settings.similarity.stopwords);
    this.scorer.updateWeights(settings.similarity.scoringWeights);
    this.candidateGenerator.updateSettings(settings.similarity);
  }

  /**
   * Initializes state by loading all persisted records from storage into memory.
   */
  public async loadFromStorage(): Promise<void> {
    const savedNotes = await this.storage.getAllNotes();
    for (const note of savedNotes) {
      this.notes.set(note.id, note);
    }

    const savedRels = await this.storage.getAllRelationships();
    for (const rel of savedRels) {
      const key = `${rel.sourceId}:::${rel.targetId}`;
      this.relationships.set(key, rel);
    }
  }

  /**
   * Ingests a note document into in-memory structures and inverted index.
   */
  public indexNoteContent(path: string, title: string, content: string): NoteRecord {
    const parsed = MarkdownParser.parse(content);
    const { terms, termFrequencies } = this.tokenizer.extractInformativeTerms(parsed.maskedContent);

    // Register existing links
    const targetIds = parsed.existingWikilinks.map(l => l.target);
    this.linkAnalyzer.registerLinks(path, targetIds);

    // Save frequencies
    this.termFrequencies.set(path, termFrequencies);
    this.noteTotalTerms.set(path, terms.length);
    this.invertedIndex.addNote(path, termFrequencies);

    const record: NoteRecord = {
      id: path,
      path,
      title,
      aliases: parsed.aliases,
      contentHash: computeContentHash(content),
      wordCount: parsed.wordCount,
      indexedAt: Date.now(),
      status: "indexed",
      headings: parsed.headings.map(h => h.text),
      existingLinks: targetIds,
    };

    this.notes.set(path, record);
    return record;
  }

  /**
   * Recomputes TF-IDF vectors for all notes currently in the inverted index.
   */
  public recomputeAllVectors(): void {
    for (const [noteId, freqs] of this.termFrequencies.entries()) {
      const totalTerms = this.noteTotalTerms.get(noteId) || 1;
      const vec = TfIdfEngine.computeVector(freqs, totalTerms, this.invertedIndex);
      this.vectors.set(noteId, vec);
    }
  }

  /**
   * Incremental update when a single note's content changes.
   */
  public async updateNote(path: string, title: string, content: string): Promise<RelationshipRecord[]> {
    const newHash = computeContentHash(content);
    const existing = this.notes.get(path);

    if (existing && existing.contentHash === newHash) {
      return []; // Unchanged, skip!
    }

    // Index new content
    const record = this.indexNoteContent(path, title, content);
    await this.storage.saveNote(record);

    // Recompute vector for this note
    const freqs = this.termFrequencies.get(path) || new Map();
    const totalTerms = this.noteTotalTerms.get(path) || 1;
    const vec = TfIdfEngine.computeVector(freqs, totalTerms, this.invertedIndex);
    this.vectors.set(path, vec);

    // Recompute relationships for this note
    const newRels = this.candidateGenerator.generateForNote(path, this.notes, this.vectors);

    // Update in memory and storage
    await this.storage.deleteRelationshipsForNote(path);
    for (const [k, r] of this.relationships.entries()) {
      if (r.sourceId === path || r.targetId === path) {
        this.relationships.delete(k);
      }
    }

    for (const rel of newRels) {
      const key = `${rel.sourceId}:::${rel.targetId}`;
      this.relationships.set(key, rel);
    }

    await this.storage.saveRelationships(newRels);
    return newRels;
  }

  /**
   * Incremental removal when a note is deleted from the vault.
   */
  public async removeNote(path: string): Promise<void> {
    this.notes.delete(path);
    this.vectors.delete(path);
    this.termFrequencies.delete(path);
    this.noteTotalTerms.delete(path);
    this.invertedIndex.removeNote(path);

    // Remove relationships involving this note
    for (const [key, rel] of this.relationships.entries()) {
      if (rel.sourceId === path || rel.targetId === path) {
        this.relationships.delete(key);
      }
    }

    await this.storage.deleteNote(path);
    await this.storage.deleteRelationshipsForNote(path);
  }

  /**
   * Handles note rename without full recalculation.
   */
  public async renameNote(oldPath: string, newPath: string, newTitle: string): Promise<void> {
    const existing = this.notes.get(oldPath);
    if (!existing) return;

    // Migrate in-memory structures
    existing.id = newPath;
    existing.path = newPath;
    existing.title = newTitle;

    this.notes.delete(oldPath);
    this.notes.set(newPath, existing);

    const vec = this.vectors.get(oldPath);
    if (vec) {
      this.vectors.delete(oldPath);
      this.vectors.set(newPath, vec);
    }

    const freqs = this.termFrequencies.get(oldPath);
    if (freqs) {
      this.termFrequencies.delete(oldPath);
      this.termFrequencies.set(newPath, freqs);
      this.invertedIndex.removeNote(oldPath);
      this.invertedIndex.addNote(newPath, freqs);
    }

    // Migrate relationships
    const relsToUpdate: RelationshipRecord[] = [];
    for (const [key, rel] of this.relationships.entries()) {
      if (rel.sourceId === oldPath || rel.targetId === oldPath) {
        this.relationships.delete(key);
        const updatedRel: RelationshipRecord = {
          ...rel,
          sourceId: rel.sourceId === oldPath ? newPath : rel.sourceId,
          targetId: rel.targetId === oldPath ? newPath : rel.targetId,
        };
        // Re-canonicalize
        if (updatedRel.sourceId > updatedRel.targetId) {
          const temp = updatedRel.sourceId;
          updatedRel.sourceId = updatedRel.targetId;
          updatedRel.targetId = temp;
        }
        this.relationships.set(`${updatedRel.sourceId}:::${updatedRel.targetId}`, updatedRel);
        relsToUpdate.push(updatedRel);
      }
    }

    await this.storage.deleteNote(oldPath);
    await this.storage.saveNote(existing);
    await this.storage.deleteRelationshipsForNote(oldPath);
    await this.storage.saveRelationships(relsToUpdate);
  }

  public clear(): void {
    this.notes.clear();
    this.vectors.clear();
    this.termFrequencies.clear();
    this.noteTotalTerms.clear();
    this.invertedIndex.clear();
    this.relationships.clear();
    this.linkAnalyzer.clear();
  }
}
