import { GraphEdge, GraphMode, GraphNode, NoteRecord, RelationshipRecord } from "../types";

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanCount: number;
    componentCount: number;
  };
}

export class GraphBuilder {
  /**
   * Constructs graph nodes and edges from note and relationship records.
   */
  public static buildGraph(
    notes: Map<string, NoteRecord>,
    relationships: RelationshipRecord[],
    options: {
      mode?: GraphMode;
      minWeight?: number;
      maxEdges?: number;
      folderFilter?: string;
    } = {}
  ): GraphData {
    const mode = options.mode || "combined";
    const minWeight = options.minWeight !== undefined ? options.minWeight : 0.15;
    const maxEdges = options.maxEdges || 500;
    const folderFilter = options.folderFilter;

    // Filter edges by mode and weight
    let filteredRelationships = relationships.filter(rel => {
      // Weight check
      if (rel.score < minWeight && rel.relationshipType !== "explicit") {
        return false;
      }

      // Mode check
      if (mode === "actual") {
        return rel.relationshipType === "explicit";
      } else if (mode === "keyword") {
        return rel.relationshipType === "keyword";
      } else if (mode === "similarity") {
        return rel.relationshipType === "tfidf";
      } else if (mode === "combined") {
        return true; // all valid above minWeight
      }
      return true; // complete
    });

    // Sort edges by score descending and limit to maxEdges to prevent rendering freezes
    filteredRelationships.sort((a, b) => b.score - a.score);
    if (filteredRelationships.length > maxEdges) {
      filteredRelationships = filteredRelationships.slice(0, maxEdges);
    }

    // Build degree map and adjacency
    const degreeMap = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();

    for (const id of notes.keys()) {
      degreeMap.set(id, 0);
      adjacency.set(id, new Set());
    }

    const edges: GraphEdge[] = [];
    const activeNodeIds = new Set<string>();

    for (const rel of filteredRelationships) {
      if (!notes.has(rel.sourceId) || !notes.has(rel.targetId)) {
        continue;
      }

      // Folder filter on nodes
      if (folderFilter) {
        const srcMatch = rel.sourceId.startsWith(folderFilter);
        const tgtMatch = rel.targetId.startsWith(folderFilter);
        if (!srcMatch && !tgtMatch) continue;
      }

      const edgeId = `e_${rel.sourceId}_${rel.targetId}`;
      edges.push({
        id: edgeId,
        source: rel.sourceId,
        target: rel.targetId,
        weight: rel.score,
        type: rel.relationshipType,
        sharedTerms: rel.sharedTerms,
        evidence: rel.evidence,
      });

      degreeMap.set(rel.sourceId, (degreeMap.get(rel.sourceId) || 0) + 1);
      degreeMap.set(rel.targetId, (degreeMap.get(rel.targetId) || 0) + 1);
      adjacency.get(rel.sourceId)?.add(rel.targetId);
      adjacency.get(rel.targetId)?.add(rel.sourceId);

      activeNodeIds.add(rel.sourceId);
      activeNodeIds.add(rel.targetId);
    }

    // Compute simple connected components for communities
    const visited = new Set<string>();
    const communityMap = new Map<string, string>();
    let componentIndex = 0;

    for (const id of notes.keys()) {
      if (!visited.has(id)) {
        componentIndex++;
        const queue = [id];
        visited.add(id);

        while (queue.length > 0) {
          const curr = queue.shift()!;
          communityMap.set(curr, `community-${componentIndex}`);
          const neighbors = adjacency.get(curr) || new Set();
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
      }
    }

    // Build nodes
    const nodes: GraphNode[] = [];
    let orphanCount = 0;

    for (const [id, note] of notes.entries()) {
      if (folderFilter && !id.startsWith(folderFilter)) {
        continue;
      }

      const degree = degreeMap.get(id) || 0;
      const isOrphan = degree === 0;
      if (isOrphan) orphanCount++;

      nodes.push({
        id: note.id,
        label: note.title,
        path: note.path,
        degree,
        community: communityMap.get(id),
        isOrphan,
      });
    }

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        orphanCount,
        componentCount: componentIndex,
      },
    };
  }
}
