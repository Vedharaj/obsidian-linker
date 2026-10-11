import cytoscape from "cytoscape";
import { GraphMode } from "../types";

export interface FilterCriteria {
  mode: GraphMode;
  minWeight: number;
  folderPrefix?: string;
  searchQuery?: string;
  hideOrphans?: boolean;
}

export class GraphFilterManager {
  /**
   * Applies filters dynamically to the Cytoscape graph instance.
   */
  public static applyFilters(cy: cytoscape.Core, criteria: FilterCriteria): void {
    cy.batch(() => {
      // 1. Process Edges
      cy.edges().forEach((edge) => {
        const weight = edge.data("weight") || 0;
        const type = edge.data("type");

        let visible = true;

        if (type !== "explicit" && weight < criteria.minWeight) {
          visible = false;
        }

        if (criteria.mode === "actual" && type !== "explicit") {
          visible = false;
        } else if (criteria.mode === "keyword" && type !== "keyword") {
          visible = false;
        } else if (criteria.mode === "similarity" && type !== "tfidf") {
          visible = false;
        }

        if (visible) {
          edge.show();
        } else {
          edge.hide();
        }
      });

      // 2. Process Nodes
      cy.nodes().forEach((node) => {
        let visible = true;
        const path = node.data("path") || "";
        const label = (node.data("label") || "").toLowerCase();

        // Folder filter
        if (criteria.folderPrefix && !path.startsWith(criteria.folderPrefix)) {
          visible = false;
        }

        // Search query
        if (criteria.searchQuery && criteria.searchQuery.trim().length > 0) {
          const q = criteria.searchQuery.trim().toLowerCase();
          if (!label.includes(q) && !path.toLowerCase().includes(q)) {
            visible = false;
          }
        }

        // Hide orphans
        if (criteria.hideOrphans) {
          const connectedVisibleEdges = node.connectedEdges(":visible");
          if (connectedVisibleEdges.length === 0) {
            visible = false;
          }
        }

        if (visible) {
          node.show();
        } else {
          node.hide();
        }
      });
    });
  }
}
