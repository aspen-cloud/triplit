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
  let hash = 2166136261; // FNV offset basis for 32-bit hash
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i); // XOR with each character
    hash = (hash * 16777619) >>> 0; // FNV prime and force to 32-bit integer
  }
  return hash;
}

export function hash(value: unknown): string {
  // return Value.Hash(value).toString();
  return hashObject(value).toString();
}
