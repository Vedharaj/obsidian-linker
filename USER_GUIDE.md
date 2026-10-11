# Obsidian Semantic Auto-Linker & Knowledge Graph — User Guide

Welcome to the **Obsidian Semantic Auto-Linker & Knowledge Graph** plugin. This plugin provides local-first semantic analysis, relationship discovery, safe reviewed auto-linking, and interactive network visualization for your Obsidian notes without requiring any cloud APIs, external AI, or neural embedding models.

---

## 1. Quick Start

### Activation
The plugin has already been installed and activated in your Obsidian vault at:
`/media/vedha/E2/digital brain/vedha-digital-brain/.obsidian/plugins/obsidian-semantic-autolinker/`

To verify or access it in Obsidian:
1. Reload or restart Obsidian (or use `Ctrl+P` -> `Reload app without saving`).
2. Go to **Settings** -> **Community Plugins** and confirm **Semantic Auto-Linker & Knowledge Graph** is listed and enabled.

### Accessing Plugin Views
- **Dashboard**: Click the **layout-dashboard** icon in Obsidian's left ribbon, or press `Ctrl+P` and choose `Semantic Auto-Linker: Open Semantic Auto-Linker Dashboard`.
- **Knowledge Graph**: Click the **git-fork** icon in the ribbon, or press `Ctrl+P` and choose `Semantic Auto-Linker: Open Semantic Knowledge Graph`.
- **Review Queue**: Run command `Semantic Auto-Linker: Review Proposed Wikilinks`.

---

## 2. Key Features

### 1. Zero External AI / 100% Local Privacy
- Computes relationships using deterministic Information Retrieval (IR) algorithms:
  - **TF-IDF (Term Frequency - Inverse Document Frequency)** with smoothed logarithmic weighting.
  - **Sparse Cosine Similarity** on normalized multi-dimensional term vectors.
  - **Shared Keyword & Phrase Overlap**.
  - **Bibliographic Coupling & Co-citation Analysis** (common incoming and outgoing wikilinks).
  - **Heading & Title Alignment**.
- Never sends your note data or personal notes over the internet.

### 2. Resumable Vault Crawling & Indexing
- **Observable Progress**: Real-time progress bar across all stages (`discover`, `preprocess`, `keywords`, `similarity`, `graph`, `persist`, `validate`).
- **Pause & Resume**: Pause a scan at any time to preserve system resources, then resume from the exact last batch.
- **Incremental Updates**: Modifying, renaming, or deleting a note in Obsidian automatically updates the index incrementally without having to re-scan thousands of files.

### 3. Safe, Non-Destructive Auto-Linking
- **Dry-Run by Default**: Automatic file modifications are strictly disabled by default.
- **Review Queue**: Inspect every proposed link before applying. See the source note, matched text, target note, confidence score, and diff preview.
- **Protected Markdown Ranges**:
  - Never links inside fenced code blocks (````python ... ````) or inline code (\`...\`).
  - Never creates nested links inside existing `[[wikilinks]]` or Markdown links `[title](url)`.
  - Preserves YAML frontmatter, headers, lists, and tables intact.
  - Strictly avoids self-referencing links (`Note A` linking to `Note A`).
  - Descending character-offset application guarantees string replacements never invalidate later offsets.
- **1-Click Rollback / Undo**: Every link operation is recorded with a before/after snapshot. If you don't like the changes, click **Rollback Last Undo** to restore the note byte-for-byte.

### 4. Interactive Cytoscape Knowledge Graph
- **Network Modes**:
  - `Combined Network`: View all significant connections (explicit links + inferred similarities).
  - `Actual Links Only`: Focus strictly on existing wikilinks.
  - `TF-IDF Similarity`: Visualize statistical content similarity clusters.
  - `Keyword Network`: Explore notes connected through distinctive shared vocabulary.
- **Interactions**:
  - Click any node to highlight its immediate neighborhood and dim unrelated nodes.
  - Double-click a node to instantly open the corresponding Markdown file.
  - Inspector sidebar reveals edge weights, shared keywords, and reasoning evidence.
  - Layout options: `CoSE`, `Concentric`, `Circle`, `Breadthfirst`.

---

## 3. Configuration & Settings

Open **Settings** -> **Semantic Auto-Linker** to customize:

| Group | Setting | Default | Description |
|---|---|---|---|
| **Scanning** | Excluded Folders | `.obsidian, .trash, .git, node_modules` | Folders skipped during indexing |
| | Max File Size | `5 MB` | Notes larger than this are skipped |
| **Similarity** | Min Similarity Threshold | `0.15` | Minimum score (0.05–0.80) to create an inferred edge |
| | Max Neighbors | `25` | Maximum top related notes stored per note |
| | Min Shared Keywords | `2` | Minimum shared terms for candidate generation |
| **Auto-Linking** | Automatic Writes | `Disabled (false)` | Keep disabled to enforce manual review |
| | Max Links Per Note | `15` | Maximum links proposed in a single note |
| | Require Word Boundary | `true` | Prevents matching subwords (e.g. 'art' inside 'part') |
| | Match Aliases | `true` | Resolves frontmatter `aliases:` as valid targets |
| **Graph** | Default Mode | `Combined Network` | Starting view when opening graph |
| | Max Visible Edges | `300` | Caps rendered edges to guarantee smooth 60fps rendering |

---

## 4. Headless CLI Scanner (Terminal Usage)

You can also run benchmarks, audits, or headless scans directly from your terminal:

```bash
# Scan 500 notes from your vault
npx tsx scripts/cli-scan.ts --limit 500

# Export full relationship graph and orphan report to JSON
npx tsx scripts/cli-scan.ts --limit 1000 --export report.json
```
