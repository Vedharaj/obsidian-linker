import { SemanticAutolinkerSettings } from "./types";

export const DEFAULT_STOPWORDS: string[] = [
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further",
  "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's",
  "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into",
  "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor",
  "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
  "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's",
  "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll",
  "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's",
  "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
];

export const DEFAULT_SETTINGS: SemanticAutolinkerSettings = {
  fileFilter: {
    excludedFolders: [".obsidian", ".trash", ".git", "node_modules"],
    excludedPaths: [],
    includeHiddenFolders: false,
    maximumFileSizeBytes: 1024 * 1024 * 5, // 5MB
  },
  similarity: {
    minSimilarityThreshold: 0.15,
    maxNeighborsPerNote: 25,
    minSharedKeywords: 2,
    stopwords: DEFAULT_STOPWORDS,
    scoringWeights: {
      tfidf: 0.50,
      keyword: 0.20,
      link: 0.20,
      heading: 0.10,
    },
  },
  progress: {
    batchSize: 20,
    checkpointInterval: 50,
    uiUpdateInterval: 200,
  },
  autolink: {
    autoWriteEnabled: false, // strictly dry-run by default
    directAutoApply: false,
    linkOnlyTitleHeading: false,
    linkDates: true,
    maxLinksPerNote: 15,
    requireWordBoundary: true,
    caseSensitive: false,
    matchAliases: true,
    disambiguateDuplicates: true,
    linkKeywords: true,
    linkHeadings: true,
    minKeywordLength: 3,
  },
  graph: {
    defaultMode: "combined",
    minEdgeWeight: 0.20,
    maxVisibleEdges: 300,
    layoutEngine: "cose",
  },
};
