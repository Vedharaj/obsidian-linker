/**
 * Fast, deterministic content hashing for note contents.
 * Uses 64-bit FNV-1a algorithm with BigInt for cross-platform stability.
 */
export function computeContentHash(content: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let i = 0; i < content.length; i++) {
    const code = BigInt(content.charCodeAt(i));
    hash ^= code;
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, "0");
}
