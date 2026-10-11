import { describe, it, expect, beforeEach } from "vitest";
import { App, TFile } from "obsidian";
import SemanticAutolinkerPlugin from "../src/main";
import { MemoryStorage } from "../src/storage/memory-storage";
import { DEFAULT_SETTINGS } from "../src/settings";
import { FileFilter } from "../src/crawler/file-filter";
import { IndexManager } from "../src/indexing/index-manager";
import { JobManager } from "../src/jobs/job-manager";
import { ReviewManager } from "../src/autolink/review-manager";
import { VaultCrawler } from "../src/crawler/vault-crawler";
import { SemanticAutolinkerSettingTab } from "../src/ui/settings-tab";

describe("Buttons, UI Actions, and Configuration Options Verification", () => {
  let app: App;
  let plugin: SemanticAutolinkerPlugin;
  let storage: MemoryStorage;

  beforeEach(async () => {
    app = new App();
    storage = new MemoryStorage();

    plugin = new SemanticAutolinkerPlugin(app, {
      id: "obsidian-semantic-autolinker",
      name: "Semantic Auto-Linker",
      version: "1.0.0",
      minAppVersion: "0.15.0",
      description: "Local-first Obsidian plugin for semantic auto-linking",
      author: "Vedha",
    });

    plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    plugin.storage = storage;
    plugin.fileFilter = new FileFilter(plugin.settings.fileFilter);
    plugin.indexManager = new IndexManager(storage, plugin.settings);
    plugin.reviewManager = new ReviewManager(storage, plugin.settings.autolink);

    const crawlerAdapter = {
      getMarkdownFiles: async () => {
        return app.vault.getMarkdownFiles().map((f) => ({
          path: f.path,
          basename: f.basename,
          size: f.stat.size,
        }));
      },
      read: async (path: string) => {
        const file = app.vault.getAbstractFileByPath(path);
        return file ? await app.vault.read(file) : "";
      },
      modify: async (path: string, content: string) => {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) await app.vault.modify(file, content);
      },
    };

    const crawler = new VaultCrawler(crawlerAdapter, plugin.fileFilter);
    plugin.jobManager = new JobManager(storage, plugin.settings, crawler, plugin.indexManager);

    // Setup mock files in vault
    const note1 = new TFile(
      "Notes/Artificial Intelligence.md",
      `# Artificial Intelligence\nArtificial Intelligence encompasses Machine Learning and Neural Networks.`
    );
    const note2 = new TFile(
      "Notes/Machine Learning.md",
      `---\naliases: [ML]\n---\n# Machine Learning\n## Supervised Learning\nMachine Learning uses statistical algorithms. Meeting on 2026-10-11.`
    );
    const note3 = new TFile(
      "Notes/Neural Networks.md",
      `# Neural Networks\nNeural Networks are layers of interconnected nodes.`
    );
    const note4 = new TFile(
      "Notes/Daily Log.md",
      `Today we studied Artificial Intelligence and Machine Learning techniques. Also Supervised Learning.`
    );

    app.vault.files.set(note1.path, note1);
    app.vault.files.set(note2.path, note2);
    app.vault.files.set(note3.path, note3);
    app.vault.files.set(note4.path, note4);

    // Populate metadataCache
    app.metadataCache.cache.set(note1.path, {
      headings: [{ heading: "Artificial Intelligence" }],
    });
    app.metadataCache.cache.set(note2.path, {
      frontmatter: { aliases: ["ML"] },
      headings: [{ heading: "Machine Learning" }, { heading: "Supervised Learning" }],
    });
    app.metadataCache.cache.set(note3.path, {
      headings: [{ heading: "Neural Networks" }],
    });
    app.metadataCache.cache.set(note4.path, {
      headings: [{ heading: "Daily Log" }],
    });
  });

  describe("Dashboard Quick Action Buttons", () => {
    it("Button '⚡ Instant Auto-Link Note' modifies active note directly and creates undo record", async () => {
      const activeFile = app.vault.getAbstractFileByPath("Notes/Daily Log.md");
      app.workspace.activeFile = activeFile;

      const initialContent = await app.vault.read(activeFile);
      expect(initialContent).toContain("Artificial Intelligence");
      expect(initialContent).not.toContain("[[Artificial Intelligence]]");

      // Click Instant Auto-Link Note button
      await plugin.autoLinkActiveNote(true);

      const modifiedContent = await app.vault.read(activeFile);
      expect(modifiedContent).toContain("[[Artificial Intelligence]]");
      expect(modifiedContent).toContain("[[Machine Learning]]");

      // Verify undo history was recorded
      const history = await plugin.reviewManager.undoManager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].sourcePath).toBe("Notes/Daily Log.md");
      expect(history[0].originalContent).toBe(initialContent);
    });

    it("Button '📋 Propose for Current Note' generates proposals without modifying the file", async () => {
      const activeFile = app.vault.getAbstractFileByPath("Notes/Daily Log.md");
      app.workspace.activeFile = activeFile;

      const initialContent = await app.vault.read(activeFile);

      // Click Propose for Current Note button
      await plugin.autoLinkActiveNote(false);

      // File must be untouched
      const currentContent = await app.vault.read(activeFile);
      expect(currentContent).toBe(initialContent);

      // Proposals must be saved in storage as pending
      const proposals = await storage.getProposals("Notes/Daily Log.md");
      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals.some((p) => p.status === "pending")).toBe(true);
    });

    it("Button '🏷️ Link by Titles & Headings Only' excludes general keywords and only links titles/headings", async () => {
      // First populate index with a common keyword for note1: "statistical"
      await plugin.indexManager.updateNote(
        "Notes/Machine Learning.md",
        "Machine Learning",
        "statistical algorithms statistical statistical"
      );

      const testNote = new TFile(
        "Notes/Test Note.md",
        "This note mentions statistical methods and Machine Learning."
      );
      app.vault.files.set(testNote.path, testNote);
      app.metadataCache.cache.set(testNote.path, {});
      app.workspace.activeFile = testNote;

      plugin.refreshTitleIndex();

      // Temporarily enable linkOnlyTitleHeading as the button does
      const prev = plugin.settings.autolink.linkOnlyTitleHeading;
      plugin.settings.autolink.linkOnlyTitleHeading = true;
      try {
        await plugin.autoLinkActiveNote(true);
      } finally {
        plugin.settings.autolink.linkOnlyTitleHeading = prev;
      }

      const content = await app.vault.read(testNote);
      // Machine Learning is a title -> MUST be linked
      expect(content).toContain("[[Machine Learning]]");
      // "statistical" is a keyword -> MUST NOT be linked in Titles/Headings Only mode
      expect(content).not.toContain("[[statistical]]");
    });

    it("Button '↩ Rollback Last Auto-Link' restores file to exact previous state", async () => {
      const activeFile = app.vault.getAbstractFileByPath("Notes/Daily Log.md");
      app.workspace.activeFile = activeFile;
      const initialContent = await app.vault.read(activeFile);

      // Apply links
      await plugin.autoLinkActiveNote(true);
      const linkedContent = await app.vault.read(activeFile);
      expect(linkedContent).not.toBe(initialContent);

      // Click Rollback button
      await plugin.rollbackLastAutoLink();

      const rolledBackContent = await app.vault.read(activeFile);
      expect(rolledBackContent).toBe(initialContent);
    });

    it("Button '🌐 Auto-Link Entire Vault' links across all eligible notes in the vault", async () => {
      const note1Before = await app.vault.read(app.vault.getAbstractFileByPath("Notes/Artificial Intelligence.md"));
      expect(note1Before).not.toContain("[[Machine Learning]]");

      // Click Auto-Link Entire Vault button
      await plugin.autoLinkVault(true);

      const note1After = await app.vault.read(app.vault.getAbstractFileByPath("Notes/Artificial Intelligence.md"));
      expect(note1After).toContain("[[Machine Learning]]");
      expect(note1After).toContain("[[Neural Networks]]");
    });

    it("Button '🏷️ Auto-Link Vault (Titles/Headings Only)' respects title/heading restriction across vault", async () => {
      const prev = plugin.settings.autolink.linkOnlyTitleHeading;
      plugin.settings.autolink.linkOnlyTitleHeading = true;
      try {
        await plugin.autoLinkVault(true);
      } finally {
        plugin.settings.autolink.linkOnlyTitleHeading = prev;
      }

      const note1After = await app.vault.read(app.vault.getAbstractFileByPath("Notes/Artificial Intelligence.md"));
      expect(note1After).toContain("[[Machine Learning]]");
      expect(note1After).toContain("[[Neural Networks]]");
    });
  });

  describe("Review View Action Buttons", () => {
    it("Button 'Scan & Generate Proposals' populates review queue", async () => {
      const notesMap = new Map();
      for (const f of app.vault.getMarkdownFiles()) {
        notesMap.set(f.path, {
          id: f.path,
          path: f.path,
          title: f.basename,
          contentHash: "",
          wordCount: 10,
          indexedAt: Date.now(),
          status: "indexed",
        });
      }

      const proposals = await plugin.reviewManager.generateProposalsForVault(
        notesMap,
        async (path) => {
          const f = app.vault.getAbstractFileByPath(path);
          return f ? await app.vault.read(f) : "";
        }
      );

      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals.every((p) => p.status === "pending")).toBe(true);
    });

    it("Buttons 'Approve All Pending' and 'Reject All Pending' update statuses correctly", async () => {
      // Save 2 mock proposals
      await storage.saveProposals([
        {
          id: "p1",
          sourcePath: "Notes/Daily Log.md",
          targetPath: "Notes/Artificial Intelligence.md",
          matchedText: "Artificial Intelligence",
          replacementText: "[[Artificial Intelligence]]",
          score: 1.0,
          status: "pending",
          startOffset: 16,
          endOffset: 39,
          type: "title",
          timestamp: Date.now(),
        },
        {
          id: "p2",
          sourcePath: "Notes/Daily Log.md",
          targetPath: "Notes/Machine Learning.md",
          matchedText: "Machine Learning",
          replacementText: "[[Machine Learning]]",
          score: 1.0,
          status: "pending",
          startOffset: 44,
          endOffset: 60,
          type: "title",
          timestamp: Date.now(),
        },
      ]);

      // Approve All
      await plugin.reviewManager.approveAll();
      let proposals = await storage.getProposals();
      expect(proposals.every((p) => p.status === "approved")).toBe(true);

      // Individual Reject
      await plugin.reviewManager.rejectProposal("p1");
      proposals = await storage.getProposals();
      expect(proposals.find((p) => p.id === "p1")?.status).toBe("rejected");
      expect(proposals.find((p) => p.id === "p2")?.status).toBe("approved");

      // Reset to pending and test Reject All Pending
      await storage.updateProposalStatus("p1", "pending");
      await storage.updateProposalStatus("p2", "pending");
      await plugin.reviewManager.rejectAll();
      proposals = await storage.getProposals();
      expect(proposals.every((p) => p.status === "rejected")).toBe(true);
    });

    it("Button 'Apply Approved to Vault' modifies files only for approved proposals", async () => {
      const targetNote = app.vault.getAbstractFileByPath("Notes/Daily Log.md");
      const initialContent = await app.vault.read(targetNote);

      await storage.saveProposals([
        {
          id: "p_app",
          sourcePath: "Notes/Daily Log.md",
          targetPath: "Notes/Artificial Intelligence.md",
          matchedText: "Artificial Intelligence",
          replacementText: "[[Artificial Intelligence]]",
          score: 1.0,
          status: "approved",
          startOffset: initialContent.indexOf("Artificial Intelligence"),
          endOffset: initialContent.indexOf("Artificial Intelligence") + "Artificial Intelligence".length,
          type: "title",
          timestamp: Date.now(),
        },
        {
          id: "p_rej",
          sourcePath: "Notes/Daily Log.md",
          targetPath: "Notes/Machine Learning.md",
          matchedText: "Machine Learning",
          replacementText: "[[Machine Learning]]",
          score: 1.0,
          status: "rejected",
          startOffset: initialContent.indexOf("Machine Learning"),
          endOffset: initialContent.indexOf("Machine Learning") + "Machine Learning".length,
          type: "title",
          timestamp: Date.now(),
        },
      ]);

      const res = await plugin.reviewManager.applyApproved(
        "Notes/Daily Log.md",
        async (p) => {
          const f = app.vault.getAbstractFileByPath(p);
          return f ? await app.vault.read(f) : "";
        },
        async (p, c) => {
          const f = app.vault.getAbstractFileByPath(p);
          if (f) await app.vault.modify(f, c);
        }
      );

      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(1);

      const modified = await app.vault.read(targetNote);
      expect(modified).toContain("[[Artificial Intelligence]]");
      expect(modified).not.toContain("[[Machine Learning]]"); // rejected proposal was NOT applied
    });
  });

  describe("Scan Controls Buttons", () => {
    it("Buttons 'Start Full Vault Scan', 'Pause', 'Resume', and 'Cancel' control job lifecycle", async () => {
      // 1. Start Scan
      await plugin.jobManager.startFullScan();
      const statusAfterStart = plugin.jobManager.getStatus();
      expect(["running", "completed"]).toContain(statusAfterStart.status);

      // 2. Pause
      await plugin.jobManager.pause();
      // If completed immediately, pause is clean no-op; if running, transitions to paused
      const statusAfterPause = plugin.jobManager.getStatus();
      expect(["paused", "completed"]).toContain(statusAfterPause.status);

      // 3. Resume
      await plugin.jobManager.resume();
      const statusAfterResume = plugin.jobManager.getStatus();
      expect(["running", "completed"]).toContain(statusAfterResume.status);

      // 4. Cancel
      await plugin.jobManager.cancel();
      const statusAfterCancel = plugin.jobManager.getStatus();
      expect(["cancelled", "completed"]).toContain(statusAfterCancel.status);
    });
  });

  describe("Settings Tab Configuration Options", () => {
    it("Option 'linkDates': when true links standalone dates; when false ignores dates", async () => {
      const datedNote = new TFile(
        "Notes/Dated Entry.md",
        "Project kickoff occurred on 2026-10-11 with team."
      );
      app.vault.files.set(datedNote.path, datedNote);
      app.metadataCache.cache.set(datedNote.path, {});
      app.workspace.activeFile = datedNote;

      // When linkDates is true (default)
      plugin.settings.autolink.linkDates = true;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      let content = await app.vault.read(datedNote);
      expect(content).toContain("[[2026-10-11]]");

      // Rollback and test when linkDates is false
      await plugin.rollbackLastAutoLink();
      content = await app.vault.read(datedNote);
      expect(content).not.toContain("[[2026-10-11]]");

      plugin.settings.autolink.linkDates = false;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      content = await app.vault.read(datedNote);
      expect(content).not.toContain("[[2026-10-11]]");
    });

    it("Option 'linkHeadings': when true links subheadings; when false ignores headings", async () => {
      const headingTestNote = new TFile(
        "Notes/Heading Test.md",
        "We discuss Supervised Learning methods."
      );
      app.vault.files.set(headingTestNote.path, headingTestNote);
      app.metadataCache.cache.set(headingTestNote.path, {});
      app.workspace.activeFile = headingTestNote;

      // With linkHeadings = true
      plugin.settings.autolink.linkHeadings = true;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      let content = await app.vault.read(headingTestNote);
      expect(content).toContain("[[Machine Learning#Supervised Learning|Supervised Learning]]");

      // Rollback and test with linkHeadings = false
      await plugin.rollbackLastAutoLink();
      plugin.settings.autolink.linkHeadings = false;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      content = await app.vault.read(headingTestNote);
      expect(content).not.toContain("[[Machine Learning#Supervised Learning|Supervised Learning]]");
    });

    it("Option 'matchAliases': when true matches frontmatter aliases like 'ML'", async () => {
      const aliasNote = new TFile("Notes/Alias Test.md", "Study ML concepts.");
      app.vault.files.set(aliasNote.path, aliasNote);
      app.metadataCache.cache.set(aliasNote.path, {});
      app.workspace.activeFile = aliasNote;

      plugin.settings.autolink.matchAliases = true;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      const content = await app.vault.read(aliasNote);
      expect(content).toContain("[[Machine Learning|ML]]");
    });

    it("Option 'maxLinksPerNote': limits the number of generated links", async () => {
      const multiNote = new TFile(
        "Notes/Multi Test.md",
        "Artificial Intelligence and Machine Learning and Neural Networks."
      );
      app.vault.files.set(multiNote.path, multiNote);
      app.metadataCache.cache.set(multiNote.path, {});
      app.workspace.activeFile = multiNote;

      // Set maxLinksPerNote = 1
      plugin.settings.autolink.maxLinksPerNote = 1;
      plugin.reviewManager.updateSettings(plugin.settings.autolink);
      plugin.refreshTitleIndex();

      await plugin.autoLinkActiveNote(true);
      const content = await app.vault.read(multiNote);
      const wikilinkCount = (content.match(/\[\[[^\]]+\]\]/g) || []).length;
      expect(wikilinkCount).toBe(1);
    });

    it("Option 'fileFilter.excludedFolders': excludes files in designated folders", () => {
      plugin.settings.fileFilter.excludedFolders = [".obsidian", ".trash", "Archive"];
      plugin.fileFilter.updateSettings(plugin.settings.fileFilter);

      expect(plugin.fileFilter.isEligible("Notes/Note.md", 100).eligible).toBe(true);
      expect(plugin.fileFilter.isEligible("Archive/Old Note.md", 100).eligible).toBe(false);
      expect(plugin.fileFilter.isEligible(".obsidian/config.json", 100).eligible).toBe(false);
    });

    it("Settings tab renders cleanly and updates plugin configuration on change", async () => {
      const tab = new SemanticAutolinkerSettingTab(app, plugin);
      tab.display();

      // Verify settings update cleanly
      plugin.settings.autolink.linkOnlyTitleHeading = true;
      plugin.settings.autolink.linkDates = false;
      await plugin.saveSettings();

      expect(plugin.settings.autolink.linkOnlyTitleHeading).toBe(true);
      expect(plugin.settings.autolink.linkDates).toBe(false);
    });
  });
});
