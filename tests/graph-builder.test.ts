import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/relationships/graph-builder";
import { NoteRecord, RelationshipRecord } from "../src/types";

describe("Graph Builder", () => {
  const notes = new Map<string, NoteRecord>([
    [
      "NoteA.md",
      {
        id: "NoteA.md",
        path: "NoteA.md",
        title: "Note A",
        aliases: [],
        contentHash: "hA",
        wordCount: 100,
        indexedAt: Date.now(),
        status: "indexed",
      },
    ],
    [
      "NoteB.md",
      {
        id: "NoteB.md",
        path: "NoteB.md",
        title: "Note B",
        aliases: [],
        contentHash: "hB",
        wordCount: 120,
        indexedAt: Date.now(),
        status: "indexed",
      },
    ],
    [
      "Orphan.md",
      {
        id: "Orphan.md",
        path: "Orphan.md",
        title: "Orphan Note",
        aliases: [],
        contentHash: "hO",
        wordCount: 50,
        indexedAt: Date.now(),
        status: "indexed",
      },
    ],
  ]);

  const relationships: RelationshipRecord[] = [
    {
      sourceId: "NoteA.md",
      targetId: "NoteB.md",
      score: 0.75,
      relationshipType: "explicit",
      sharedTerms: ["machine", "learning"],
      evidence: ["Explicit wikilink between Note A and Note B"],
      status: "existing",
    },
    {
      sourceId: "NoteA.md",
      targetId: "NoteB.md",
      score: 0.65,
      relationshipType: "tfidf",
      sharedTerms: ["neural"],
      evidence: ["High TF-IDF cosine similarity"],
      status: "suggested",
    },
  ];

  it("constructs valid graph nodes and edges without duplicates", () => {
    const graph = GraphBuilder.buildGraph(notes, relationships, {
      mode: "combined",
      minWeight: 0.1,
    });

    expect(graph.nodes.length).toBe(3);
    // Should have 2 edges (or 2 distinct relationship entries)
    expect(graph.edges.length).toBe(2);

    const orphanNode = graph.nodes.find((n) => n.id === "Orphan.md");
    expect(orphanNode?.isOrphan).toBe(true);
    expect(orphanNode?.degree).toBe(0);

    const connectedNode = graph.nodes.find((n) => n.id === "NoteA.md");
    expect(connectedNode?.isOrphan).toBe(false);
    expect(connectedNode?.degree).toBe(2);
  });

  it("filters edges by mode (actual links vs inferred)", () => {
    const actualGraph = GraphBuilder.buildGraph(notes, relationships, {
      mode: "actual",
    });

    // Only explicit link edge should be included
    expect(actualGraph.edges.length).toBe(1);
    expect(actualGraph.edges[0].type).toBe("explicit");

    const tfidfGraph = GraphBuilder.buildGraph(notes, relationships, {
      mode: "similarity",
    });

    // Only tfidf edge should be included
    expect(tfidfGraph.edges.length).toBe(1);
    expect(tfidfGraph.edges[0].type).toBe("tfidf");
  });
});
