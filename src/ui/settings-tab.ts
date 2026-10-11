import { App, PluginSettingTab, Setting } from "obsidian";
import type SemanticAutolinkerPlugin from "../main";

export class SemanticAutolinkerSettingTab extends PluginSettingTab {
  private plugin: SemanticAutolinkerPlugin;

  constructor(app: App, plugin: SemanticAutolinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Semantic Auto-Linker & Knowledge Graph Settings" });

    // 1. Scanning
    containerEl.createEl("h3", { text: "Vault Scanning & Filtering" });

    new Setting(containerEl)
      .setName("Excluded Folders")
      .setDesc("Comma-separated list of folder paths to exclude from indexing")
      .addText((text) =>
        text
          .setPlaceholder(".obsidian, .trash, .git, node_modules")
          .setValue(this.plugin.settings.fileFilter.excludedFolders.join(", "))
          .onChange(async (val) => {
            this.plugin.settings.fileFilter.excludedFolders = val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum File Size (MB)")
      .setDesc("Skip markdown files larger than this threshold")
      .addSlider((slider) =>
        slider
          .setLimits(1, 25, 1)
          .setValue(Math.round(this.plugin.settings.fileFilter.maximumFileSizeBytes / (1024 * 1024)))
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.fileFilter.maximumFileSizeBytes = val * 1024 * 1024;
            await this.plugin.saveSettings();
          })
      );

    // 2. Similarity & IR
    containerEl.createEl("h3", { text: "Similarity & Relationship Engine" });

    new Setting(containerEl)
      .setName("Minimum Similarity Threshold")
      .setDesc("Minimum multi-factor score required for an inferred relationship edge (0.05 to 0.8)")
      .addSlider((slider) =>
        slider
          .setLimits(0.05, 0.8, 0.05)
          .setValue(this.plugin.settings.similarity.minSimilarityThreshold)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.similarity.minSimilarityThreshold = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max Neighbors Per Note")
      .setDesc("Maximum top candidate relationships stored per note")
      .addSlider((slider) =>
        slider
          .setLimits(5, 50, 5)
          .setValue(this.plugin.settings.similarity.maxNeighborsPerNote)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.similarity.maxNeighborsPerNote = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Min Shared Keywords")
      .setDesc("Minimum shared distinctive keywords for candidate consideration")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.similarity.minSharedKeywords)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.similarity.minSharedKeywords = val;
            await this.plugin.saveSettings();
          })
      );

    // 3. Auto-Linking
    containerEl.createEl("h3", { text: "Auto-Linking Safety" });

    new Setting(containerEl)
      .setName("Automatic Writes Enabled")
      .setDesc("When disabled (recommended), proposed links require review before modifying files")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autolink.autoWriteEnabled)
          .onChange(async (val) => {
            this.plugin.settings.autolink.autoWriteEnabled = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max Links Proposed Per Note")
      .setDesc("Upper cap on number of wikilinks proposed in a single document")
      .addSlider((slider) =>
        slider
          .setLimits(1, 30, 1)
          .setValue(this.plugin.settings.autolink.maxLinksPerNote)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.autolink.maxLinksPerNote = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Require Word Boundary")
      .setDesc("Prevent matching words inside other words (e.g. 'art' inside 'part')")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autolink.requireWordBoundary)
          .onChange(async (val) => {
            this.plugin.settings.autolink.requireWordBoundary = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Match Aliases")
      .setDesc("Index frontmatter aliases as linking targets")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autolink.matchAliases)
          .onChange(async (val) => {
            this.plugin.settings.autolink.matchAliases = val;
            await this.plugin.saveSettings();
          })
      );

    // 4. Graph
    containerEl.createEl("h3", { text: "Interactive Knowledge Graph" });

    new Setting(containerEl)
      .setName("Default Graph Mode")
      .setDesc("Default edge display mode when opening graph")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("combined", "Combined Network")
          .addOption("actual", "Actual Links Only")
          .addOption("similarity", "TF-IDF Similarity")
          .addOption("keyword", "Keyword Network")
          .setValue(this.plugin.settings.graph.defaultMode)
          .onChange(async (val: any) => {
            this.plugin.settings.graph.defaultMode = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max Visible Edges")
      .setDesc("Limit rendering to top weighted edges to preserve UI performance")
      .addSlider((slider) =>
        slider
          .setLimits(100, 1000, 50)
          .setValue(this.plugin.settings.graph.maxVisibleEdges)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.graph.maxVisibleEdges = val;
            await this.plugin.saveSettings();
          })
      );
  }
}
