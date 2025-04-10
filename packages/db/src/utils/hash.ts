/**
 * FNV-1a hash function for strings
 */
export function fnv1aHash(str: string, seed = 2166136261 >>> 0): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // fnv prime * hash, mod 2^32
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Combines two 32-bit hashes into one
 */
export function combineHashes(h1: number, h2: number): number {
  let combined = h1 ^ h2;
  combined = Math.imul(combined, 16777619);
  return combined >>> 0;
}

export function hashObject(obj: any) {
  function serialize(value: any): string {
    if (typeof value !== 'object' || value === null) {
      return String(value); // Convert primitive values and null to strings directly
    }

    if (Array.isArray(value)) {
      return '[' + value.map(serialize).join(',') + ']'; // Recursively handle arrays
    }

    // Handle objects by sorting keys to ensure consistent ordering
    const keys = Object.keys(value).sort();
    return (
      '{' + keys.map((key) => `${key}:${serialize(value[key])}`).join(',') + '}'
    );
  }

  const str = serialize(obj); // Serialized deep object representation

  // Apply FNV-1a hash
  return fnv1aHash(str);
}

export function hash(value: unknown): string {
  return hashObject(value).toString();
}
