# Obsidian Semantic Auto-Linker & Knowledge Graph

A local-first, zero-external-AI Obsidian plugin that discovers deep semantic relationships across your vault, builds interactive Cytoscape knowledge graphs, and provides a safe, reviewed auto-linking workflow with full undo support.

## Features

- **100% Local & Private**: No LLM, no cloud services, no API keys, and no external database required.
- **Classical Semantic Engine**: TF-IDF, sparse cosine similarity, multiword phrase and keyword extraction, link co-occurrence, and heading alignment.
- **Safe Auto-Linking**: Strict boundary matching, protected markdown ranges (code blocks, inline code, existing links, frontmatter), proposal review queue, and 1-click rollback/undo.
- **Interactive Cytoscape Graph**:
  - Filter by relationship type: Actual links, TF-IDF semantic similarity, shared keywords, or combined.
  - Neighborhood exploration, folder filtering, clustering, and orphan detection.
  - Distinction between explicit links and inferred relationships.
- **Resumable Background Jobs**: Checkpointed batch processing with stage-weighted progress tracking, pause/resume, and cancellation support.
- **Incremental Indexing**: Automatic re-indexing of modified, renamed, or deleted notes using content hashes without full rescans.
