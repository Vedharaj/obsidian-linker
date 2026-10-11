import { ItemView, WorkspaceLeaf } from "obsidian";
import cytoscape from "cytoscape";
import { GraphData } from "../relationships/graph-builder";
import { GraphLayoutManager } from "./graph-layout";
import { GraphFilterManager } from "./graph-filters";
import { GraphInteractionManager } from "./graph-interactions";
import { GraphMode } from "../types";

export const GRAPH_VIEW_TYPE = "semantic-autolinker-graph-view";

export class GraphView extends ItemView {
  private cy: cytoscape.Core | null = null;
  private graphData: GraphData | null = null;
  private currentMode: GraphMode = "combined";
  private currentMinWeight = 0.2;
  private currentLayout = "cose";
  private searchQuery = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public getViewType(): string {
    return GRAPH_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return "Semantic Knowledge Graph";
  }

  public getIcon(): string {
    return "git-fork";
  }

  public setGraphData(data: GraphData): void {
    this.graphData = data;
    this.renderCytoscape();
  }

  public async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("semantic-graph-container");

    // Toolbar
    const toolbar = container.createDiv({ cls: "semantic-graph-toolbar" });

    // Mode selector
    const modeSelect = toolbar.createEl("select");
    const modes: Array<{ id: GraphMode; label: string }> = [
      { id: "combined", label: "Combined Network" },
      { id: "actual", label: "Actual Links Only" },
      { id: "similarity", label: "TF-IDF Similarity" },
      { id: "keyword", label: "Keyword Network" },
    ];
    for (const m of modes) {
      const opt = modeSelect.createEl("option", { text: m.label, value: m.id });
      if (m.id === this.currentMode) opt.selected = true;
    }
    modeSelect.addEventListener("change", () => {
      this.currentMode = modeSelect.value as GraphMode;
      this.applyCurrentFilters();
    });

    // Min weight slider
    const weightLabel = toolbar.createEl("span", { text: `Min weight: ${this.currentMinWeight}` });
    const weightSlider = toolbar.createEl("input", { type: "range" });
    weightSlider.min = "0.05";
    weightSlider.max = "0.8";
    weightSlider.step = "0.05";
    weightSlider.value = String(this.currentMinWeight);
    weightSlider.addEventListener("input", () => {
      this.currentMinWeight = parseFloat(weightSlider.value);
      weightLabel.setText(`Min weight: ${this.currentMinWeight}`);
      this.applyCurrentFilters();
    });

    // Layout selector
    const layoutSelect = toolbar.createEl("select");
    const layouts = ["cose", "concentric", "circle", "breadthfirst"];
    for (const l of layouts) {
      const opt = layoutSelect.createEl("option", { text: l.toUpperCase(), value: l });
      if (l === this.currentLayout) opt.selected = true;
    }
    layoutSelect.addEventListener("change", () => {
      this.currentLayout = layoutSelect.value;
      if (this.cy) {
        this.cy.layout(GraphLayoutManager.getLayoutOptions(this.currentLayout)).run();
      }
    });

    // Search bar
    const searchInput = toolbar.createEl("input", {
      type: "search",
      placeholder: "Search notes...",
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.applyCurrentFilters();
    });

    // Reset view button
    const resetBtn = toolbar.createEl("button", { text: "Fit" });
    resetBtn.addEventListener("click", () => {
      if (this.cy) this.cy.fit(undefined, 30);
    });

    // Canvas container
    const canvasEl = container.createDiv({ cls: "semantic-graph-canvas" });

    // Sidebar inspector
    const sidebar = container.createDiv({ cls: "semantic-graph-sidebar" });
    sidebar.style.display = "none";

    if (this.graphData) {
      this.renderCytoscape();
    }
  }

  private renderCytoscape(): void {
    const canvasEl = this.contentEl.querySelector(".semantic-graph-canvas") as HTMLElement;
    if (!canvasEl || !this.graphData) return;

    if (this.cy) {
      this.cy.destroy();
    }

    const elements: cytoscape.ElementDefinition[] = [];

    // Add nodes
    for (const node of this.graphData.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.label,
          path: node.path,
          degree: node.degree,
          community: node.community,
        },
      });
    }

    // Add edges
    for (const edge of this.graphData.edges) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          type: edge.type,
          evidence: edge.evidence,
          sharedTerms: edge.sharedTerms,
        },
      });
    }

    this.cy = cytoscape({
      container: canvasEl,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "var(--text-normal, #dcddde)",
            "font-size": "10px",
            "background-color": "var(--interactive-accent, #7c3aed)",
            width: "mapData(degree, 0, 20, 14, 34)",
            height: "mapData(degree, 0, 20, 14, 34)",
            "text-valign": "bottom",
            "text-margin-y": 4,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 0.1, 1.0, 1, 4)",
            "line-color": "var(--background-modifier-border, #4b5563)",
            "curve-style": "bezier",
            opacity: 0.65,
          },
        },
        {
          selector: "edge[type = 'explicit']",
          style: {
            "line-color": "var(--color-green, #10b981)",
            opacity: 0.85,
          },
        },
        {
          selector: "edge[type = 'keyword']",
          style: {
            "line-color": "var(--color-orange, #f59e0b)",
          },
        },
        {
          selector: ".dimmed",
          style: {
            opacity: 0.15,
          },
        },
        {
          selector: ".highlighted",
          style: {
            opacity: 1.0,
            "font-weight": "bold",
            "z-index": 99,
          },
        },
      ],
      layout: GraphLayoutManager.getLayoutOptions(this.currentLayout),
    });

    const sidebar = this.contentEl.querySelector(".semantic-graph-sidebar") as HTMLElement;

    GraphInteractionManager.setupInteractions(
      this.cy,
      (nodeDetail) => {
        if (!sidebar) return;
        sidebar.empty();
        sidebar.style.display = "block";

        sidebar.createEl("h3", { text: nodeDetail.label });
        sidebar.createEl("p", { text: `Path: ${nodeDetail.path}` });
        sidebar.createEl("p", { text: `Connections: ${nodeDetail.degree}` });

        const openBtn = sidebar.createEl("button", {
          cls: "semantic-button-primary",
          text: "Open Note",
        });
        openBtn.addEventListener("click", () => {
          this.app.workspace.openLinkText(nodeDetail.path, "");
        });

        if (nodeDetail.connectedEdges.length > 0) {
          sidebar.createEl("h4", { text: "Connected Notes" });
          const list = sidebar.createEl("ul");
          for (const edge of nodeDetail.connectedEdges) {
            const item = list.createEl("li");
            item.createEl("strong", { text: edge.targetLabel });
            item.createEl("span", {
              text: ` (${edge.type}, ${(edge.weight * 100).toFixed(0)}%)`,
            });
          }
        }
      },
      (edgeDetail) => {
        if (!sidebar) return;
        sidebar.empty();
        sidebar.style.display = "block";

        sidebar.createEl("h3", { text: "Relationship Details" });
        sidebar.createEl("p", { text: `${edgeDetail.sourceLabel} ⟷ ${edgeDetail.targetLabel}` });
        sidebar.createEl("p", { text: `Type: ${edgeDetail.type}` });
        sidebar.createEl("p", { text: `Score: ${(edgeDetail.weight * 100).toFixed(1)}%` });

        if (edgeDetail.evidence && edgeDetail.evidence.length > 0) {
          sidebar.createEl("h4", { text: "Evidence" });
          const ul = sidebar.createEl("ul");
          for (const ev of edgeDetail.evidence) {
            ul.createEl("li", { text: ev });
          }
        }
      },
      (path) => {
        this.app.workspace.openLinkText(path, "");
      }
    );

    this.applyCurrentFilters();
  }

  private applyCurrentFilters(): void {
    if (!this.cy) return;
    GraphFilterManager.applyFilters(this.cy, {
      mode: this.currentMode,
      minWeight: this.currentMinWeight,
      searchQuery: this.searchQuery,
      hideOrphans: false,
    });
  }

  public async onClose(): Promise<void> {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }
}
