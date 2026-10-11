export class AliasResolver {
  /**
   * Formats a clean Obsidian wikilink string.
   * If matched text matches note title, formats as `[[Title]]`.
   * If matched text is an alias or differs in casing, formats as `[[Title|Matched Text]]`.
   */
  public static formatWikilink(targetPath: string, matchedText: string, subpath?: string): string {
    // Extract base note title without directory path and without .md
    const segments = targetPath.split("/");
    const filename = segments[segments.length - 1];
    const noteTitle = filename.replace(/\.(md|markdown)$/i, "");

    const target = subpath ? `${noteTitle}#${subpath}` : noteTitle;

    if (noteTitle.trim().toLowerCase() === matchedText.trim().toLowerCase() && !subpath) {
      return `[[${noteTitle}]]`;
    }

    return `[[${target}|${matchedText}]]`;
  }
}
