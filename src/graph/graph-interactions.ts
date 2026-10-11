import cytoscape from "cytoscape";

export interface NodeSelectionDetail {
  id: string;
  label: string;
  path: string;
  degree: number;
  community?: string;
  connectedEdges: Array<{
    targetLabel: string;
    weight: number;
    type: string;
    evidence?: string[];
  }>;
}

export interface EdgeSelectionDetail {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  weight: number;
  type: string;
  evidence?: string[];
  sharedTerms?: string[];
}

export class GraphInteractionManager {
  /**
   * Sets up interactive highlights, clicks, and neighborhood exploration.
   */
  public static setupInteractions(
    cy: cytoscape.Core,
    onNodeSelect: (details: NodeSelectionDetail) => void,
    onEdgeSelect: (details: EdgeSelectionDetail) => void,
    onNodeOpen: (path: string) => void
  ): void {
    // Clear selections on background tap
    cy.on("tap", (event) => {
      if (event.target === cy) {
        cy.elements().removeClass("dimmed highlighted");
      }
    });

    // Node tap
    cy.on("tap", "node", (event) => {
      const node = event.target;
      const neighborhood = node.neighborhood().add(node);

      cy.batch(() => {
        cy.elements().addClass("dimmed").removeClass("highlighted");
        neighborhood.removeClass("dimmed").addClass("highlighted");
      });

      // Prepare details
      const edges = node.connectedEdges();
      const connectedEdges = edges.map((e: any) => {
        const otherNode = e.source().id() === node.id() ? e.target() : e.source();
        return {
          targetLabel: otherNode.data("label") || otherNode.id(),
          weight: e.data("weight") || 0,
          type: e.data("type") || "tfidf",
          evidence: e.data("evidence"),
        };
      });

      onNodeSelect({
        id: node.id(),
        label: node.data("label") || node.id(),
        path: node.data("path") || node.id(),
        degree: node.data("degree") || 0,
        community: node.data("community"),
        connectedEdges,
      });
    });

    // Node double click or taphold to open note
    cy.on("dbltap", "node", (event) => {
      const path = event.target.data("path") || event.target.id();
      onNodeOpen(path);
    });

    // Edge tap
    cy.on("tap", "edge", (event) => {
      const edge = event.target;
      const srcNode = edge.source();
      const tgtNode = edge.target();

      cy.batch(() => {
        cy.elements().addClass("dimmed").removeClass("highlighted");
        edge.removeClass("dimmed").addClass("highlighted");
        srcNode.removeClass("dimmed").addClass("highlighted");
        tgtNode.removeClass("dimmed").addClass("highlighted");
      });

      onEdgeSelect({
        id: edge.id(),
        sourceLabel: srcNode.data("label") || srcNode.id(),
        targetLabel: tgtNode.data("label") || tgtNode.id(),
        weight: edge.data("weight") || 0,
        type: edge.data("type") || "tfidf",
        evidence: edge.data("evidence"),
        sharedTerms: edge.data("sharedTerms"),
      });
    });
  }
}
