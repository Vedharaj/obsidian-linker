/**
 * Core type definitions for the Obsidian Semantic Auto-Linker plugin.
 */

export type NoteStatus = "indexed" | "pending" | "error";

export interface NoteRecord {
  id: string; // vault-relative path
  path: string;
  title: string;
  aliases: string[];
  contentHash: string;
  wordCount: number;
  indexedAt: number;
  status: NoteStatus;
  headings?: string[];
  existingLinks?: string[];
}

export interface KeywordRecord {
  term: string;
  documentFrequency: number;
  idf: number;
}

export interface NoteTermRecord {
  noteId: string;
  term: string;
  termFrequency: number;
  tfidfWeight: number;
}

export type RelationshipType = "explicit" | "keyword" | "tfidf" | "cooccurrence";
export type RelationshipStatus = "suggested" | "approved" | "rejected" | "existing";

export interface RelationshipRecord {
  sourceId: string;
  targetId: string;
  score: number;
  relationshipType: RelationshipType;
  sharedTerms: string[];
  evidence: string[];
  status: RelationshipStatus;
  computedAt?: number;
}

export type JobStatus = "queued" | "running" | "paused" | "cancelled" | "failed" | "completed";

export type ProcessingStage =
  | "discover"
  | "preprocess"
  | "keywords"
  | "similarity"
  | "graph"
  | "persist"
  | "validate"
  | "complete";

export interface JobRecord {
  id: string;
  status: JobStatus;
  stage: ProcessingStage;
  totalItems: number;
  processedItems: number;
  lastCheckpoint?: string;
  startedAt: number;
  updatedAt: number;
  errorCount: number;
  errors?: string[];
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "stale";
export type MatchType = "title" | "alias" | "keyword" | "heading";

export interface LinkProposal {
  id: string;
  sourcePath: string;
  targetPath: string;
  matchedText: string;
  replacementText: string;
  matchType: MatchType;
  score: number;
  startOffset?: number;
  endOffset?: number;
  originalContentHash: string;
  status: ProposalStatus;
  createdAt: number;
}

export interface UndoRecord {
  id: string;
  jobId?: string;
  sourcePath: string;
  originalContent: string;
  newContent: string;
  originalContentHash: string;
  appliedContentHash: string;
  timestamp: number;
  proposalIds: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  degree: number;
  community?: string;
  isOrphan: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: RelationshipType;
  sharedTerms?: string[];
  evidence?: string[];
}

export interface FileFilterSettings {
  excludedFolders: string[];
  excludedPaths: string[];
  includeHiddenFolders: boolean;
  maximumFileSizeBytes: number;
}

export interface ScoringWeights {
  tfidf: number;
  keyword: number;
  link: number;
  heading: number;
}

export interface SimilaritySettings {
  minSimilarityThreshold: number;
  maxNeighborsPerNote: number;
  minSharedKeywords: number;
  stopwords: string[];
  scoringWeights: ScoringWeights;
}

export interface ProgressSettings {
  batchSize: number;
  checkpointInterval: number;
  uiUpdateInterval: number;
}

export interface AutolinkSettings {
  autoWriteEnabled: boolean;
  directAutoApply?: boolean;
  linkOnlyTitleHeading?: boolean;
  maxLinksPerNote: number;
  requireWordBoundary: boolean;
  caseSensitive: boolean;
  matchAliases: boolean;
  disambiguateDuplicates: boolean;
  linkKeywords?: boolean;
  linkHeadings?: boolean;
  minKeywordLength?: number;
}

export type GraphMode = "actual" | "keyword" | "similarity" | "combined" | "complete";

export interface GraphSettings {
  defaultMode: GraphMode;
  minEdgeWeight: number;
  maxVisibleEdges: number;
  layoutEngine: string;
}

export interface SemanticAutolinkerSettings {
  fileFilter: FileFilterSettings;
  similarity: SimilaritySettings;
  progress: ProgressSettings;
  autolink: AutolinkSettings;
  graph: GraphSettings;
}

export interface TextRange {
  start: number;
  end: number;
  type: "code_fence" | "inline_code" | "wikilink" | "markdown_link" | "frontmatter" | "url" | "heading";
  rawText?: string;
}
