**Confidence: 99%**

# Complete Implementation Plan: Obsidian Semantic Auto-Linker

**Project type:** Local-first Obsidian plugin  
**Primary objective:** Automatically discover relationships between all Markdown files in an Obsidian vault, generate safe `[[wikilinks]]`, track processing progress, and visualize the entire knowledge network.  
**AI/API requirement:** No LLM, no cloud API, and no external service required.  
**Primary platform:** Ubuntu 24.04 with Obsidian.  
**Implementation approach:** TypeScript, Obsidian Plugin API, classical information retrieval, persistent indexing, and an interactive graph.

The plugin will use deterministic text processing and statistical similarity rather than neural embeddings. This avoids model downloads, inference latency, and API dependencies.

The central design principle is to **separate discovering relationships, approving relationships, and modifying Markdown files**. This prevents a full-vault scan from accidentally creating thousands of incorrect links.

---

## 1. Project objectives

The plugin must accomplish eight objectives.

1. Crawl all eligible Markdown files in the vault.
2. Extract keywords, phrases, headings, aliases, and existing links.
3. Calculate relationships between notes using TF-IDF, cosine similarity, keyword overlap, and existing-link information.
4. Track progress at file, batch, and processing-stage levels.
5. Persist the index and processing state so interrupted jobs can resume.
6. Display an interactive graph containing actual links and inferred relationships.
7. Generate, review, and safely apply automatic wikilinks.
8. Recalculate only affected relationships when notes change.

### Explicit exclusions

The initial implementation will not require:

- Ollama or another model runtime.
- Neural embeddings.
- LLM-generated keywords.
- Cloud services or API keys.
- An external database server.
- Automatic rewriting of every note.
- Automatic creation of a Markdown file for every extracted keyword.

All indexing, similarity calculations, and graph generation will run locally.

### Definition of success

The first production-ready version should:

- Process the entire vault without requiring all files to fit in memory simultaneously.
- Recover from an interrupted scan.
- Avoid duplicate, nested, and self-referencing wikilinks.
- Show measurable progress throughout the scan.
- Distinguish existing links from inferred relationships.
- Allow users to review proposed links before modifying files.
- Support incremental updates after notes change.
- Keep the Markdown vault readable and usable without the plugin.

---

# 2. System architecture

Use a modular architecture with clearly defined responsibilities.

```text
                  OBSIDIAN VAULT
                        |
                        v
              ┌─────────────────────┐
              │   Vault Crawler     │
              │                     │
              │ Discover .md files  │
              │ Read note contents  │
              │ Detect changes      │
              └──────────┬──────────┘
                         |
                         v
              ┌─────────────────────┐
              │ Markdown Processor  │
              │                     │
              │ Parse frontmatter   │
              │ Extract headings    │
              │ Normalize text      │
              │ Exclude code blocks │
              └──────────┬──────────┘
                         |
                         v
              ┌─────────────────────┐
              │ Feature Extractor   │
              │                     │
              │ Tokens and phrases  │
              │ Keywords and aliases│
              │ TF-IDF vectors      │
              └──────────┬──────────┘
                         |
                         v
              ┌─────────────────────┐
              │ Candidate Generator │
              │                     │
              │ Inverted index      │
              │ Shared keywords     │
              │ Existing links      │
              └──────────┬──────────┘
                         |
                         v
              ┌─────────────────────┐
              │ Relationship Engine │
              │                     │
              │ Cosine similarity   │
              │ Keyword overlap     │
              │ Link evidence       │
              │ Confidence ranking  │
              └──────────┬──────────┘
                         |
              ┌──────────┴──────────┐
              v                     v
    ┌──────────────────┐  ┌───────────────────┐
    │ Persistent Index │  │ Progress Manager  │
    │                  │  │                   │
    │ Notes            │  │ Stage progress    │
    │ Keywords         │  │ Batch checkpoints │
    │ Relationships    │  │ Pause and resume  │
    │ Processing state │  │ Error reporting   │
    └─────────┬────────┘  └───────────────────┘
              |
       ┌──────┴─────────┐
       v                v
┌───────────────┐ ┌────────────────────┐
│ Knowledge     │ │ Link Review        │
│ Graph         │ │                    │
│               │ │ Preview             │
│ Nodes and     │ │ Approve / Reject   │
│ weighted edges│ │ Apply / Undo       │
└───────────────┘ └────────────────────┘
```

The graph and link-review interface will use the same relationship index. They must not maintain separate, inconsistent interpretations of note relationships.

## 3. Recommended technology stack

| Component | Technology | Responsibility |
|---|---|---|
| Plugin | TypeScript | Application logic and type safety |
| Plugin integration | Obsidian Plugin API | Vault access, commands, events, views |
| Markdown parsing | `obsidian` APIs and a compatible parser where needed | Note structure and safe text processing |
| Frontmatter | Obsidian metadata cache | Aliases and metadata |
| Tokenization | Lightweight local text-processing library or custom tokenizer | Normalize and tokenize content |
| Similarity | Custom sparse TF-IDF and cosine similarity | Rank related notes |
| Search index | In-memory inverted index | Find candidate notes efficiently |
| Persistence | IndexedDB initially, or a compatible local SQLite implementation | Persistent index and checkpoints |
| Graph visualization | Cytoscape.js | Interactive nodes, edges, filters, and clusters |
| Automated tests | Vitest | Algorithm and integration tests |
| Packaging | Standard Obsidian plugin structure | Distributable plugin |

### Database decision

For the initial plugin, I recommend **IndexedDB for persistent state and in-memory indexes for active computation**.

Reasons:

- It avoids requiring an external database service.
- It can persist structured records between Obsidian sessions.
- It supports asynchronous access.
- It avoids introducing a native SQLite dependency before performance requirements are known.

If benchmarking later demonstrates that IndexedDB is insufficient, introduce a database adapter and evaluate SQLite for desktop deployments.

Keep the indexing and graph algorithms independent of the storage implementation.

---

# 4. Proposed project directory

Create the following project structure.

```text
obsidian-semantic-autolinker/
│
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── README.md
├── LICENSE
│
├── src/
│   ├── main.ts
│   ├── settings.ts
│   ├── types.ts
│   │
│   ├── crawler/
│   │   ├── vault-crawler.ts
│   │   ├── change-detector.ts
│   │   └── file-filter.ts
│   │
│   ├── markdown/
│   │   ├── markdown-parser.ts
│   │   ├── text-normalizer.ts
│   │   ├── tokenizer.ts
│   │   └── protected-ranges.ts
│   │
│   ├── indexing/
│   │   ├── keyword-extractor.ts
│   │   ├── inverted-index.ts
│   │   ├── tfidf.ts
│   │   ├── content-hash.ts
│   │   └── index-manager.ts
│   │
│   ├── relationships/
│   │   ├── candidate-generator.ts
│   │   ├── cosine-similarity.ts
│   │   ├── keyword-overlap.ts
│   │   ├── link-analyzer.ts
│   │   ├── relationship-scorer.ts
│   │   └── graph-builder.ts
│   │
│   ├── jobs/
│   │   ├── job-manager.ts
│   │   ├── progress-manager.ts
│   │   ├── checkpoint-manager.ts
│   │   └── error-reporter.ts
│   │
│   ├── storage/
│   │   ├── storage-interface.ts
│   │   ├── indexeddb-storage.ts
│   │   └── migrations.ts
│   │
│   ├── autolink/
│   │   ├── title-index.ts
│   │   ├── alias-resolver.ts
│   │   ├── link-proposer.ts
│   │   ├── markdown-rewriter.ts
│   │   ├── review-manager.ts
│   │   └── undo-manager.ts
│   │
│   ├── graph/
│   │   ├── graph-view.ts
│   │   ├── graph-layout.ts
│   │   ├── graph-filters.ts
│   │   └── graph-interactions.ts
│   │
│   └── ui/
│       ├── dashboard-view.ts
│       ├── review-view.ts
│       ├── settings-tab.ts
│       └── progress-panel.ts
│
└── tests/
    ├── tokenizer.test.ts
    ├── tfidf.test.ts
    ├── similarity.test.ts
    ├── markdown-rewriter.test.ts
    ├── checkpoint-manager.test.ts
    ├── graph-builder.test.ts
    └── integration.test.ts
```

This is the proposed target structure, not a claim that these files already exist.

**Implementation rule:** Build only the modules required for the current phase. Do not create dozens of empty files before the core indexing pipeline works.

---

# 5. Data model and persistent storage

The storage layer must support notes, terms, relationships, processing jobs, and proposed link changes.

## 5.1 Notes

```typescript
interface NoteRecord {
  id: string;
  path: string;
  title: string;
  aliases: string[];

  contentHash: string;
  wordCount: number;

  indexedAt: number;
  status: "indexed" | "pending" | "error";
}
```

Use the vault-relative file path as the stable identifier where possible. When a note is renamed, migrate its index records rather than treating the renamed file as an unrelated note.

## 5.2 Keywords

```typescript
interface KeywordRecord {
  term: string;
  documentFrequency: number;
  idf: number;
}
```

Document frequency indicates how many notes contain a term. This allows the system to assign greater importance to distinctive vocabulary.

## 5.3 Note-term relationships

```typescript
interface NoteTermRecord {
  noteId: string;
  term: string;
  termFrequency: number;
  tfidfWeight: number;
}
```

Store sparse term weights. Do not create a record for every possible note-term combination.

## 5.4 Note relationships

```typescript
interface RelationshipRecord {
  sourceId: string;
  targetId: string;

  score: number;
  relationshipType:
    | "explicit"
    | "keyword"
    | "tfidf"
    | "cooccurrence";

  sharedTerms: string[];
  evidence: string[];

  status:
    | "suggested"
    | "approved"
    | "rejected"
    | "existing";
}
```

Normalize the score to the range 0–1 for display. A score is a ranking signal, not a calibrated probability that two notes are related.

Store the source and target in a canonical order for symmetric relationships to prevent duplicate edges.

## 5.5 Processing jobs

```typescript
interface JobRecord {
  id: string;

  status:
    | "queued"
    | "running"
    | "paused"
    | "cancelled"
    | "failed"
    | "completed";

  stage: string;

  totalItems: number;
  processedItems: number;

  lastCheckpoint?: string;

  startedAt: number;
  updatedAt: number;

  errorCount: number;
}
```

Keep job state separate from note state. A note can be indexed successfully even if the larger graph-building job is paused.

## 5.6 Link proposals

Maintain a separate collection for proposed Markdown edits.

Each proposal should record:

- Source note.
- Original text.
- Proposed text.
- Target note path.
- Match type.
- Evidence and ranking score.
- Review status.
- Content hash at proposal time.

The final field matters: if a note changes after a proposal is generated, invalidate or revalidate that proposal before applying it.

---

# 6. Implementation phases

Use the following sequence. Each phase must produce a working, testable deliverable before the next begins.

## Phase 0 — Environment and plugin foundation

**Objective:** Create a functioning Obsidian plugin before implementing indexing.

### Tasks

1. Create the plugin directory.
2. Initialize a TypeScript project.
3. Configure the Obsidian API dependency.
4. Configure the bundler.
5. Create `manifest.json`.
6. Implement the plugin entry point.
7. Add a settings tab.
8. Register a ribbon icon and command.
9. Add a basic status panel.
10. Verify installation in Obsidian's plugin directory.

### Deliverable

A plugin that loads successfully and displays a dashboard.

### Acceptance criteria

- No runtime errors during startup.
- Plugin commands are registered.
- Settings survive an Obsidian restart.
- The plugin can be disabled without affecting the vault.
- No Markdown files are modified.

---

## Phase 1 — Vault crawler

**Objective:** Discover all eligible Markdown files and read their content.

### Tasks

1. Enumerate files using the Obsidian Vault API.
2. Filter for Markdown files.
3. Support excluded folders.
4. Read file contents asynchronously.
5. Extract file paths and titles.
6. Calculate content hashes.
7. Count total files and bytes processed.
8. Report unreadable files.
9. Detect duplicate or ambiguous titles.
10. Generate a scan report.

Use `app.vault.getMarkdownFiles()` to enumerate notes. Use vault-relative paths for identification and Obsidian APIs for reading and modifying vault files.

### File-filter configuration

```typescript
interface FileFilterSettings {
  excludedFolders: string[];
  excludedPaths: string[];
  includeHiddenFolders: boolean;
  maximumFileSizeBytes: number;
}
```

The maximum file size should be configurable. Oversized notes should be reported as skipped rather than silently ignored.

### Progress tracking

Display:

- Total files discovered.
- Files successfully read.
- Files skipped.
- Files that failed.
- Bytes processed.
- Current file.

### Deliverable

A complete inventory of the vault.

### Acceptance criteria

- Every eligible Markdown file is discovered.
- Excluded folders are respected.
- Failed reads do not terminate the scan.
- A second scan produces the same inventory when the vault has not changed.

---

## Phase 2 — Markdown preprocessing and keyword extraction

**Objective:** Convert Markdown into structured text without destroying the original formatting.

### Tasks

1. Extract YAML frontmatter.
2. Read aliases from frontmatter.
3. Extract headings.
4. Extract existing wikilinks.
5. Extract ordinary text.
6. Ignore fenced code blocks.
7. Ignore inline code during keyword matching.
8. Avoid treating URLs and link destinations as ordinary keywords.
9. Normalize case and whitespace.
10. Tokenize text.
11. Extract frequent terms and candidate phrases.
12. Maintain a configurable stop-word list.

### Keyword extraction approach

Use a combination of:

- Word frequency.
- Document frequency.
- TF-IDF weight.
- Multiword phrase frequency.
- Heading occurrence.
- Existing title and alias matches.

Preserve domain-specific vocabulary. For example, `RISC-V`, `gem5`, `DRAMSim2`, and `OpenClaw` should not be destroyed by generic tokenization rules.

### Important rule

Do not use a simple regex replacement as the complete Markdown parser. Markdown contains nested structures, code fences, links, and formatting that can be damaged by careless processing.

Keep the original content intact. Build a separate normalized representation for indexing.

### Deliverable

A structured index of note text, headings, aliases, links, and candidate keywords.

### Acceptance criteria

- Existing Markdown remains unchanged.
- Code examples do not generate ordinary keyword matches.
- Aliases are indexed correctly.
- Technical identifiers survive preprocessing.
- Tokenization is deterministic.

---

## Phase 3 — Inverted index and TF-IDF engine

**Objective:** Build an efficient local similarity engine.

### Tasks

1. Build a mapping from keywords to note IDs.
2. Calculate term frequency.
3. Calculate document frequency.
4. Calculate inverse document frequency.
5. Generate sparse TF-IDF vectors.
6. Normalize vectors.
7. Implement cosine similarity.
8. Generate candidate note pairs from shared terms.
9. Exclude self-pairs.
10. Rank candidate notes.
11. Keep the top \(k\) candidates per note.
12. Cache calculated results.

### Core algorithms

Term frequency:

\[
TF(t,d)=\frac{f(t,d)}{\max(1,\text{terms}(d))}
\]

Smoothed inverse document frequency:

\[
IDF(t)=\log\left(\frac{N+1}{DF(t)+1}\right)+1
\]

TF-IDF:

\[
w(t,d)=TF(t,d)\times IDF(t)
\]

Cosine similarity:

\[
\operatorname{sim}(A,B)=
\frac{A\cdot B}{\|A\|\|B\|}
\]

Use sparse vectors and calculate the dot product only over terms shared by the two candidate notes.

### Candidate generation

For each note:

1. Retrieve notes from the inverted index using its informative terms.
2. Count shared terms.
3. Exclude candidates that share only generic terms.
4. Calculate cosine similarity for remaining candidates.
5. Rank the results.
6. Store the top candidates and their evidence.

Do not calculate a dense all-pairs similarity matrix.

### Deliverable

A reusable similarity engine that ranks related notes.

### Acceptance criteria

- Identical or near-identical documents rank highly.
- Notes with unrelated vocabulary generally rank lower.
- Similarity is symmetric.
- Similarity scores are finite.
- Self-similarity is excluded from relationship proposals.
- Large candidate sets are processed in batches.

---

## Phase 4 — Relationship scoring and graph construction

**Objective:** Convert similarity results into meaningful graph edges.

### Relationship types

**Explicit relationships**

Existing Obsidian wikilinks.

**Keyword relationships**

Connections based on shared keywords or phrases.

**TF-IDF relationships**

Connections based on statistical text similarity.

**Co-occurrence relationships**

Connections based on concepts repeatedly appearing together across notes.

### Relationship scoring

Start with a configurable formula:

\[
S(A,B)=
0.50T(A,B)+
0.20K(A,B)+
0.20L(A,B)+
0.10H(A,B)
\]

Where:

- \(T\): normalized TF-IDF similarity.
- \(K\): keyword overlap.
- \(L\): existing-link evidence.
- \(H\): title and heading alignment.

Normalize the component scores before combining them.

For an initial version, use explicit links primarily as a graph edge type rather than automatically allowing them to inflate semantic similarity. Otherwise, notes with existing links can appear semantically related simply because they already reference one another.

### Graph rules

1. Create one node for each indexed note.
2. Create edges only when the evidence satisfies configured rules.
3. Keep actual links separate from inferred edges.
4. Remove self-edges.
5. Canonicalize symmetric relationships.
6. Store evidence for each inferred edge.
7. Allow the user to change thresholds.
8. Preserve approved and rejected review decisions.

### Deliverable

A persistent weighted graph of the vault.

### Acceptance criteria

- Every edge references valid notes.
- Duplicate edges are eliminated.
- Actual links are distinguishable from inferred relationships.
- Each inferred edge includes evidence.
- Graph construction can resume after interruption.

---

## Phase 5 — Progress manager and resumable jobs

**Objective:** Make the entire indexing process observable and recoverable.

This phase should be implemented early enough to be reused by the crawler, tokenizer, similarity engine, and graph builder.

### Job lifecycle

```text
QUEUED
   |
   v
RUNNING
   |
   +------> PAUSED ------> RUNNING
   |
   +------> CANCELLED
   |
   +------> FAILED
   |
   v
COMPLETED
```

### Progress requirements

Track:

- Overall percentage.
- Current stage.
- Stage percentage.
- Files processed.
- Candidate pairs processed.
- Relationships generated.
- Relationships saved.
- Errors.
- Processing duration.
- Estimated remaining time when enough measurements are available.

### Checkpoint strategy

1. Divide the workload into batches.
2. Process one batch.
3. Commit its results.
4. Save the checkpoint.
5. Update the UI.
6. Yield control to Obsidian.
7. Continue with the next batch.

For similarity calculation, use candidate-pair or batch counts. File counts alone do not accurately represent progress during a pairwise workload.

### Pause and cancellation

- **Pause:** Finish the current safe unit of work and persist state.
- **Cancel:** Stop at a safe checkpoint without deleting completed results.
- **Resume:** Validate the saved index and continue pending work.
- **Restart:** Create a new job while retaining valid cached index data.

Use asynchronous batching rather than processing the entire vault synchronously. Long-running loops can freeze the Obsidian interface.

### Deliverable

A processing system that can resume after a restart.

### Acceptance criteria

- Progress updates throughout the run.
- A paused job can resume.
- A cancelled job does not corrupt the index.
- Completed batches are not needlessly recalculated.
- Errors are recorded per item or batch.
- The dashboard remains responsive.

---

## Phase 6 — Persistent storage and incremental indexing

**Objective:** Avoid rescanning and rebuilding the entire graph after every edit.

### Tasks

1. Define a storage interface.
2. Implement persistent note records.
3. Persist keyword records and TF-IDF weights.
4. Persist relationships.
5. Persist job checkpoints.
6. Add schema migrations.
7. Detect created, modified, renamed, and deleted notes.
8. Recalculate changed note vectors.
9. Update affected candidate relationships.
10. Rebuild global IDF weights when necessary.

### Incremental update strategy

When a note changes:

1. Read its current content.
2. Compare its content hash.
3. Skip reprocessing if unchanged.
4. Recalculate its tokens and term frequencies.
5. Update document frequencies.
6. Recalculate its TF-IDF vector.
7. Recalculate relationships involving that note.
8. Update affected graph edges.
9. Save the changes.

A subtle issue: TF-IDF uses document frequency across the vault. Adding or removing a document can change IDF weights for terms used in other notes.

For the initial implementation, support two operations:

- **Fast incremental update:** Reindex the changed note and recalculate its candidate relationships using the current IDF snapshot.
- **Full statistics refresh:** Recalculate global document frequencies and TF-IDF weights when the index becomes stale or a full rebuild is requested.

Clearly indicate whether the graph reflects the latest global statistics.

### Deliverable

A persistent index that survives restarts and supports incremental updates.

### Acceptance criteria

- Restarting Obsidian does not erase the index.
- Unchanged notes are not needlessly reprocessed.
- Renamed notes do not leave orphaned graph edges.
- Deleted notes are removed from the active graph.
- Full rebuilds can restore consistency.

---

## Phase 7 — Automatic wikink generation

**Objective:** Convert selected keywords into safe Obsidian links.

This phase must remain separate from semantic graph construction. An inferred relationship does not automatically justify modifying a note.

### Step 1: Build a target index

Index all note titles and aliases.

Example:

```text
"Machine Learning"  → Machine Learning.md
"ML"                → Machine Learning.md
"Neural Networks"   → Neural Networks.md
"AI"                → Artificial Intelligence.md
```

If multiple notes resolve to the same alias, mark that alias as ambiguous rather than selecting an arbitrary target.

### Step 2: Find occurrences

For every source note:

1. Extract eligible text ranges.
2. Match known titles and aliases.
3. Prefer longer phrases.
4. Check word boundaries.
5. Exclude the current note.
6. Exclude existing wikilinks and Markdown links.
7. Exclude code blocks, inline code, and URLs.
8. Resolve the target path.
9. Generate a proposed replacement.

For example:

Before:

```markdown
Machine learning is useful in artificial intelligence.
```

After:

```markdown
[[Machine Learning]] is useful in
[[Artificial Intelligence]].
```

This example assumes both targets exist and neither match is ambiguous.

### Step 3: Use safe replacement rules

The implementation must preserve:

- Frontmatter.
- Heading levels.
- Lists and tables.
- Code fences.
- Existing links.
- Inline formatting.
- Line endings.
- Unmatched text.

When modifying a note, calculate replacements against the original content and apply them in descending character-offset order. This prevents earlier replacements from shifting the positions of later replacements.

Use `Vault.process()` for modifications that must be performed against the latest file content, and verify the content hash before applying reviewed proposals.

### Step 4: Create a review queue

Each proposal should contain:

```typescript
interface LinkProposal {
  id: string;
  sourcePath: string;
  targetPath: string;

  matchedText: string;
  replacementText: string;

  matchType: "title" | "alias" | "keyword";
  score: number;

  status:
    | "pending"
    | "approved"
    | "rejected"
    | "applied"
    | "stale";
}
```

The `score` should be used for ranking and filtering. Exact title matches and semantic similarity scores are different kinds of evidence and should not be treated as equivalent probabilities.

### Step 5: Add an undo mechanism

Before applying edits, record:

- Source path.
- Original content.
- New content or reversible patch.
- Original content hash.
- Updated content hash.
- Timestamp.
- Associated job ID.

Initially, keep automatic writing disabled. Enable it only after dry-run tests and review workflows have been validated.

### Deliverable

A safe auto-linking system with preview, approval, application, and rollback.

### Acceptance criteria

- No self-links are created.
- No nested wikilinks are created.
- Ambiguous aliases are flagged.
- Repeated runs do not repeatedly modify the same text.
- Changed notes invalidate stale proposals.
- Undo restores the original content.
- Rejected suggestions remain excluded unless explicitly reconsidered.

---

## Phase 8 — Interactive knowledge graph

**Objective:** Display the relationships among all indexed notes.

Use Cytoscape.js for the custom graph view.

### Node model

Each note becomes a node.

```typescript
interface GraphNode {
  id: string;
  label: string;
  path: string;

  degree: number;
  community?: string;

  isOrphan: boolean;
}
```

### Edge model

Each relationship becomes an edge.

```typescript
interface GraphEdge {
  id: string;
  source: string;
  target: string;

  weight: number;

  type:
    | "explicit"
    | "keyword"
    | "tfidf"
    | "cooccurrence";
}
```

### Graph interaction requirements

Implement these features:

1. Zoom and pan.
2. Search by note title.
3. Open a note by selecting its node.
4. Highlight neighboring nodes.
5. Show relationship scores.
6. Filter by relationship type.
7. Filter by folder.
8. Display orphan notes.
9. Show the strongest relationships.
10. Limit graph depth around a selected note.
11. Show clusters of related notes.
12. Switch between actual links and inferred relationships.

### Graph modes

| Mode | Contents |
|---|---|
| Actual Links | Existing wikilinks only |
| Keyword Network | Connections derived from shared terms |
| Similarity Network | TF-IDF relationships |
| Combined Network | Selected relationship types together |
| Complete Graph | Every possible pair of notes, for controlled experiments |

The Complete Graph mode should be disabled by default because it becomes visually and computationally expensive for large vaults.

### Graph performance

Do not render every node and edge immediately when opening a large vault.

Instead:

1. Load graph statistics.
2. Render a filtered or sampled overview if necessary.
3. Expand selected clusters on demand.
4. Load a node's neighbors when selected.
5. Apply edge thresholds before rendering.
6. Update only affected graph elements after incremental indexing.

The underlying index must remain complete even when the visible graph is filtered.

### Deliverable

A custom interactive graph that distinguishes actual links from inferred relationships.

### Acceptance criteria

- Clicking a node opens the correct note.
- Relationship types can be filtered.
- Search finds indexed notes.
- Selecting a node reveals its neighbors.
- The graph updates after indexing completes.
- Filtering the graph does not delete underlying relationships.

---

## Phase 9 — Dashboard and settings

**Objective:** Provide a central interface for operating and monitoring the plugin.

### Dashboard layout

```text
┌──────────────────────────────────────────────────────────┐
│ SEMANTIC AUTO-LINKER                                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Notes indexed       Relationships       Pending links    │
│    2,400                8,750                 320         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ CURRENT JOB                                               │
│                                                          │
│ Overall progress: 47%                                     │
│ [█████████░░░░░░░░░░░]                                   │
│                                                          │
│ Stage: Relationship calculation                          │
│ Completed: 600 / 2,400                                   │
│ Errors: 0                                                │
│                                                          │
│ [Start Scan] [Pause] [Resume] [Cancel]                   │
├──────────────────────────────────────────────────────────┤
│ ACTIONS                                                  │
│                                                          │
│ [Review Links] [Open Knowledge Graph] [Rebuild Index]    │
│ [Validate Index] [Export Report]                         │
├──────────────────────────────────────────────────────────┤
│ RECENT ACTIVITY                                          │
│                                                          │
│ 14:32  Indexed Machine Learning.md                       │
│ 14:32  Calculated 14 candidate relationships             │
│ 14:33  Saved checkpoint                                  │
└──────────────────────────────────────────────────────────┘
```

All numbers shown here are illustrative.

### Settings

Organize settings into five groups.

**Scanning**
- Included folders.
- Excluded folders.
- Maximum file size.
- Batch size.
- Whether hidden folders are included.

**Similarity**
- Minimum similarity threshold.
- Maximum neighbors per note.
- Minimum shared keywords.
- Stop-word list.
- Phrase matching.
- Relationship scoring weights.

**Progress**
- Automatic checkpoint interval.
- Batch size.
- UI update interval.
- Resume interrupted jobs.
- Error retry policy.

**Auto-Linking**
- Link mode.
- Title and alias matching.
- Ambiguity handling.
- Maximum links proposed per note.
- Preview before writing.
- Undo history.

**Graph**
- Default graph mode.
- Maximum visible edges.
- Minimum edge weight.
- Node labels.
- Cluster visibility.
- Folder filters.

### Deliverable

A usable dashboard and persistent settings panel.

### Acceptance criteria

- Settings persist after restart.
- Invalid thresholds are rejected.
- A user can start, pause, resume, and cancel a job.
- Errors can be inspected.
- A dry run is available before modifying notes.

---

## Phase 10 — Testing, validation, and release

**Objective:** Ensure the plugin works correctly on real vaults before enabling automatic writes.

### Unit tests

| Test | Expected result |
|---|---|
| Tokenization | Normalized tokens are deterministic |
| Stop-word filtering | Configured stop words are removed |
| TF-IDF | Weights match the documented formula |
| Cosine similarity | Identical vectors score 1 when nonzero |
| Empty vectors | Similarity returns a defined safe value |
| Candidate generation | Self-pairs and duplicate candidates are excluded |
| Alias resolution | Ambiguous aliases are flagged |
| Markdown protection | Code and existing links are not rewritten |
| Checkpointing | Saved jobs can resume |
| Incremental indexing | Unchanged notes are skipped |
| Graph construction | Edges reference existing notes |
| Undo | Original Markdown is restored |

### Integration tests

Create a small temporary vault containing:

- Ten related Markdown notes.
- Several unrelated notes.
- Duplicate titles in different folders.
- Aliases.
- Nested headings.
- Fenced code blocks.
- Inline code.
- Markdown links.
- Existing wikilinks.
- Empty files.
- A malformed or oversized note.

Run the entire pipeline and inspect the output.

### Performance tests

Test at increasing vault sizes.

| Test dataset | What to measure |
|---|---|
| 100 notes | Functional correctness |
| 1,000 notes | Basic responsiveness |
| 5,000 notes | Indexing throughput and memory |
| 10,000 notes | Candidate generation and graph rendering |

These are benchmark targets, not claims about the performance of an unimplemented plugin.

Measure:

- Total scan duration.
- Tokenization throughput.
- Candidate pairs per second.
- Relationships generated per second.
- Peak memory usage.
- Time to resume.
- Time to update a changed note.
- Graph interaction latency.

The actual results will depend on note length, vocabulary distribution, hardware, and the number of candidate relationships.

### Release acceptance criteria

The initial release is ready when:

1. A full scan completes successfully.
2. A cancelled scan can resume.
3. Indexing does not require a network connection.
4. Actual and inferred relationships are distinguishable.
5. Auto-linking works in dry-run mode.
6. Reviewed changes can be applied and undone.
7. No known Markdown corruption occurs in the test suite.
8. Incremental updates pass consistency tests.
9. The graph remains usable on the target vault size.
10. The plugin reports errors instead of silently discarding failed work.

---

# 7. Progress reporting: exact implementation design

Progress reporting deserves its own technical design because it affects every processing phase.

## 7.1 Stage definitions

```typescript
type ProcessingStage =
  | "discover"
  | "preprocess"
  | "keywords"
  | "similarity"
  | "graph"
  | "persist"
  | "validate"
  | "complete";
```

Use the following initial weights:

| Stage | Weight |
|---|---:|
| Discover | 5% |
| Preprocess | 15% |
| Keywords | 15% |
| Similarity | 35% |
| Graph | 15% |
| Persist | 10% |
| Validate | 5% |
| **Total** | **100%** |

These weights should be configurable during development and later tuned from benchmark measurements.

## 7.2 Progress calculation

For each stage, calculate:

\[
p_i=\frac{\text{completed work units}}{\text{total work units}}
\]

Then calculate:

\[
P=\sum_i w_i p_i
\]

Clamp stage progress to \([0,1]\).

A stage with no work should be marked as skipped and treated as completed for overall progress accounting. Otherwise, a vault with no eligible notes could remain stuck at 0%.

### Important progress rules

- Do not display 100% until persistence and validation finish.
- Keep progress monotonic within a job.
- If the workload estimate changes, update the estimate without making the progress bar jump backwards.
- Use completed work units rather than elapsed time as the primary measure.
- Display estimated remaining time only after enough throughput measurements are available.
- Distinguish successful work from skipped or failed work.

For similarity calculation, candidate pairs are not known until candidate generation finishes. Therefore, either make candidate generation an explicit substage or calculate its expected workload before processing the candidates.

## 7.3 Job manager interface

```typescript
interface JobManager {
  startFullScan(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(): Promise<void>;

  getStatus(): JobRecord | undefined;
}
```

The job manager should orchestrate work rather than implement the algorithms itself.

Each processing module should report completed work units to the progress manager.

## 7.4 Checkpoint transaction

A batch should be persisted in this order:

1. Write the batch's index and relationship changes.
2. Verify that the writes succeeded.
3. Save the corresponding checkpoint.
4. Update the in-memory job state.
5. Notify the dashboard.

Use transactions where supported. If index data and checkpoints cannot be committed atomically, design recovery so that a repeated batch is idempotent.

---

# 8. Relationship quality and limitations

The system must not equate text similarity with conceptual truth.

### Example

These two notes may be closely related:

```text
Machine Learning
Neural Networks
```

These two notes may share vocabulary but have different purposes:

```text
Python Tutorial
Python Installation Troubleshooting
```

The relationship engine should therefore preserve the underlying evidence and allow the user to inspect it.

### Recommended evidence hierarchy

| Evidence | Interpretation |
|---|---|
| Exact title or alias match | Strong candidate for a direct link |
| Multiple distinctive shared phrases | Useful evidence of topical overlap |
| High TF-IDF similarity | Similar vocabulary and content |
| Existing wikilink | Explicitly documented relationship |
| Generic word overlap | Weak evidence |
| Fuzzy spelling match | Candidate requiring validation |

### Do not call this a neural network

Without embeddings or a neural model, this is a **classical semantic-analysis and knowledge-graph system**.

It can discover lexical relationships, statistical similarity, explicit links, and repeated concept patterns. It cannot reliably infer all synonym relationships or understand context the way a sufficiently capable language model can.

The architecture should make it possible to add an optional embedding backend later, but the first implementation must work entirely without it.

---

# 9. Development schedule and priorities

A practical development schedule is **approximately 3–5 weeks for a functional first version**, assuming focused development and no major compatibility issues. A polished, large-vault-ready release may take longer.

| Week | Priority | Main deliverable |
|---|---|---|
| Week 1 | Foundation | Plugin setup, crawler, Markdown preprocessing |
| Week 2 | Core engine | Keyword index, TF-IDF, candidate generation |
| Week 3 | Reliability | Progress dashboard, checkpoints, persistent storage |
| Week 4 | User interface | Graph view, link review, safe Markdown modification |
| Week 5 | Release readiness | Incremental updates, performance tests, bug fixes |

### Milestone gates

Do not proceed solely because a week has ended.

- **Gate 1:** The crawler reliably inventories the vault.
- **Gate 2:** The similarity engine produces useful, testable relationships.
- **Gate 3:** Jobs survive cancellation and restart.
- **Gate 4:** The graph accurately displays actual and inferred relationships.
- **Gate 5:** Auto-linking passes safety tests and supports undo.

The most important dependency is the indexing engine. Build and validate it before investing heavily in graph styling.

---

# 10. First implementation sprint

Start with a narrow, working implementation rather than creating the complete directory structure immediately.

### Sprint 1 tasks

**Task 1 — Initialize the plugin**

Create:
- `manifest.json`
- `package.json`
- `tsconfig.json`
- `src/main.ts`
- `src/settings.ts`

Verify that Obsidian loads the plugin.

**Task 2 — Implement the crawler**

Create `src/crawler/vault-crawler.ts`.

It should:
- Enumerate Markdown files.
- Read their content.
- Apply folder exclusions.
- Calculate content hashes.
- Report counts and errors.

**Task 3 — Implement preprocessing**

Create:
- `src/markdown/text-normalizer.ts`
- `src/markdown/tokenizer.ts`

Test the code against Markdown containing headings, code blocks, tables, aliases, and existing links.

**Task 4 — Implement the inverted index**

Create `src/indexing/inverted-index.ts`.

Store the mapping:

```text
keyword → note IDs
```

**Task 5 — Implement TF-IDF**

Create:
- `src/indexing/tfidf.ts`
- `src/relationships/cosine-similarity.ts`

Verify the formulas with small, manually calculated examples.

**Task 6 — Display progress**

Create:
- `src/jobs/progress-manager.ts`
- `src/ui/dashboard-view.ts`

Show the current stage, completed work units, total work units, and errors.

**Task 7 — Run an initial vault scan**

Generate a report without modifying any Markdown.

The report should contain:

```text
Vault scan complete

Markdown files discovered: ...
Files indexed: ...
Files skipped: ...
Errors: ...

Unique keywords: ...
Candidate relationships: ...

Duration: ...
Index status: ...
```

The values must come from the actual run.

### Sprint 1 exit criteria

The first sprint is complete when the plugin can scan the vault, generate an index, calculate preliminary relationships, and report progress without changing any notes.

---

# 11. Operational safety for your existing vault

Your existing Obsidian vault is located at:

`/media/vedha/E2/digital brain/vedha-digital-brain`

Treat it as the canonical knowledge base.

Before running the plugin against the full vault:

1. Create a backup outside the vault.
2. Begin with a small test folder or temporary vault.
3. Run the full pipeline in read-only mode.
4. Inspect the generated relationship report.
5. Test proposed links against representative notes.
6. Verify that existing links, frontmatter, and code blocks remain unchanged.
7. Enable reviewed writes only after the tests pass.

Do not store a growing index, debug logs, or temporary processing files inside the vault unless the user explicitly configures that behavior. Keep plugin data in an appropriate local application-data location.

Also, avoid making automatic writes while another synchronization process is modifying the same notes. Revalidate content hashes immediately before applying edits.

---

# 12. Final implementation specification

Use this as the project's technical baseline.

| Requirement | Decision |
|---|---|
| Plugin language | TypeScript |
| Processing | Fully local |
| Semantic algorithm | TF-IDF + cosine similarity |
| Candidate generation | Inverted index |
| Keyword discovery | Frequency, document frequency, and phrase extraction |
| Graph structure | Weighted, typed relationships |
| Visualization | Cytoscape.js |
| Persistent storage | IndexedDB initially |
| Progress tracking | Stage-weighted, work-unit-based progress |
| Recovery | Checkpoints and idempotent batches |
| Incremental updates | Content hashes and vault change events |
| Auto-linking | Title and alias matching, followed by reviewed proposals |
| Default write mode | Dry run / review first |
| Rollback | Original content or reversible patches |
| External services | None required |
| LLM or neural model | None required |
| Validation | Unit, integration, and performance tests |

## Reference documentation

| Source | Implementation use | Link |
|---|---|---|
| Obsidian Developer Documentation | Plugin architecture and vault operations | [Obsidian developer docs](https://docs.obsidian.md/) |
| Obsidian API Reference | Vault file operations and metadata | [TypeScript API](https://docs.obsidian.md/Reference/TypeScript%2BAPI/App/vault) |
| Cytoscape.js | Interactive graph visualization | [Cytoscape.js documentation](https://js.cytoscape.org/) |
| IndexedDB API | Persistent browser-side storage | [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) |
| Vitest | Unit and integration testing | [Vitest documentation](https://vitest.dev/) |

**My recommendation:** Build the first working version around the crawler, inverted index, TF-IDF engine, and progress manager. Add persistent checkpoints next, followed by the graph and reviewed auto-linking. This order minimizes risk and gives you a measurable, usable result before the more complex features are introduced.
