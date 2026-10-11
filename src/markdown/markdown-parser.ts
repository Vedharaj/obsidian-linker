import { ProtectedRangeDetector } from "./protected-ranges";
import { TextNormalizer } from "./text-normalizer";
import { TextRange } from "../types";

export interface ParsedWikilink {
  raw: string;
  target: string;
  alias?: string;
  start: number;
  end: number;
}

export interface ParsedHeading {
  level: number;
  text: string;
  start: number;
  end: number;
}

export interface ParsedMarkdown {
  rawContent: string;
  frontmatter: Record<string, any>;
  aliases: string[];
  tags: string[];
  headings: ParsedHeading[];
  existingWikilinks: ParsedWikilink[];
  protectedRanges: TextRange[];
  maskedContent: string;
  wordCount: number;
}

export class MarkdownParser {
  /**
   * Parses markdown document into structured components.
   */
  public static parse(content: string): ParsedMarkdown {
    const protectedRanges = ProtectedRangeDetector.findProtectedRanges(content);
    const { frontmatter, aliases, tags } = this.extractFrontmatter(content);
    const headings = this.extractHeadings(content, protectedRanges);
    const existingWikilinks = this.extractWikilinks(content);
    const maskedContent = TextNormalizer.maskProtectedRanges(content, protectedRanges);

    // Approximate word count from words outside code/frontmatter
    const words = maskedContent.trim().split(/\s+/).filter(w => w.length > 0);

    return {
      rawContent: content,
      frontmatter,
      aliases,
      tags,
      headings,
      existingWikilinks,
      protectedRanges,
      maskedContent,
      wordCount: words.length,
    };
  }

  private static extractFrontmatter(content: string): {
    frontmatter: Record<string, any>;
    aliases: string[];
    tags: string[];
  } {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!fmMatch) {
      return { frontmatter: {}, aliases: [], tags: [] };
    }

    const fmText = fmMatch[1];
    const frontmatter: Record<string, any> = {};
    const aliases: string[] = [];
    const tags: string[] = [];

    // Simple deterministic YAML parser for common Obsidian frontmatter keys
    const lines = fmText.split(/\r?\n/);
    let currentKey: string | null = null;
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const listItemMatch = line.match(/^\s*-\s+(.*)$/);
      if (listItemMatch && currentKey) {
        const val = listItemMatch[1].replace(/^["']|["']$/g, "").trim();
        if (!Array.isArray(frontmatter[currentKey])) {
          frontmatter[currentKey] = [];
        }
        frontmatter[currentKey].push(val);
        continue;
      }

      const keyValMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (keyValMatch) {
        currentKey = keyValMatch[1].toLowerCase();
        const rawVal = keyValMatch[2].trim();

        if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
          // Inline array: [alias1, alias2]
          const items = rawVal
            .slice(1, -1)
            .split(",")
            .map(s => s.replace(/^["']|["']$/g, "").trim())
            .filter(Boolean);
          frontmatter[currentKey] = items;
        } else if (rawVal === "") {
          frontmatter[currentKey] = [];
          inList = true;
        } else {
          frontmatter[currentKey] = rawVal.replace(/^["']|["']$/g, "").trim();
          inList = false;
        }
      }
    }

    // Extract aliases
    const rawAliases = frontmatter["aliases"] || frontmatter["alias"];
    if (Array.isArray(rawAliases)) {
      aliases.push(...rawAliases.map(String).map(s => s.trim()).filter(Boolean));
    } else if (typeof rawAliases === "string") {
      aliases.push(rawAliases.trim());
    }

    // Extract tags
    const rawTags = frontmatter["tags"] || frontmatter["tag"];
    if (Array.isArray(rawTags)) {
      tags.push(...rawTags.map(String).map(s => s.trim()).filter(Boolean));
    } else if (typeof rawTags === "string") {
      tags.push(rawTags.trim());
    }

    return { frontmatter, aliases, tags };
  }

  private static extractHeadings(content: string, protectedRanges: TextRange[]): ParsedHeading[] {
    const headings: ParsedHeading[] = [];
    const headingRegex = /^(#{1,6})\s+(.*)$/gm;

    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(content)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;

      // Ensure this heading isn't inside a fenced code block
      if (ProtectedRangeDetector.isRangeProtected(start, end, protectedRanges)) {
        continue;
      }

      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        start,
        end,
      });
    }

    return headings;
  }

  private static extractWikilinks(content: string): ParsedWikilink[] {
    const links: ParsedWikilink[] = [];
    const wikilinkRegex = /\[\[([^\]\r\n]+)\]\]/g;

    let match: RegExpExecArray | null;
    while ((match = wikilinkRegex.exec(content)) !== null) {
      const rawInner = match[1];
      const start = match.index;
      const end = match.index + match[0].length;

      let target = rawInner;
      let alias: string | undefined = undefined;

      if (rawInner.includes("|")) {
        const parts = rawInner.split("|");
        target = parts[0].trim();
        alias = parts.slice(1).join("|").trim();
      }

      // Handle anchor links: Note#Heading
      if (target.includes("#")) {
        target = target.split("#")[0].trim();
      }

      links.push({
        raw: match[0],
        target: target.trim(),
        alias,
        start,
        end,
      });
    }

    return links;
  }
}
