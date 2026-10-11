import cytoscape from "cytoscape";

export class GraphLayoutManager {
  /**
   * Returns layout options tailored for Cytoscape.js knowledge graph.
   */
  public static getLayoutOptions(name = "cose"): cytoscape.LayoutOptions {
    switch (name) {
      case "concentric":
        return {
          name: "concentric",
          concentric: (node: any) => node.data("degree") || 1,
          levelWidth: () => 2,
          padding: 30,
          animate: true,
          animationDuration: 500,
        } as any;

      case "circle":
        return {
          name: "circle",
          padding: 30,
          animate: true,
          animationDuration: 500,
        };

      case "breadthfirst":
        return {
          name: "breadthfirst",
          directed: false,
          padding: 30,
          animate: true,
          animationDuration: 500,
        };

      case "grid":
        return {
          name: "grid",
          padding: 30,
        };

      case "cose":
      default:
        return {
          name: "cose",
          idealEdgeLength: 100,
          nodeOverlap: 20,
          refresh: 20,
          fit: true,
          padding: 30,
          randomize: false,
          componentSpacing: 100,
          nodeRepulsion: () => 400000,
          edgeElasticity: () => 100,
          nestingFactor: 5,
          gravity: 80,
          numIter: 1000,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0,
          animate: false,
        } as any;
    }
  }
}
