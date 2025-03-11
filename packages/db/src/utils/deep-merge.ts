type DeepMergeable = any;

export function deepObjectAssign(
  target: DeepMergeable,
  ...sources: DeepMergeable[]
): DeepMergeable {
  // Return target if no sources provided
  if (sources.length === 0) return target;

  // Handle null/undefined target
  target = target ?? {};

  for (const source of sources) {
    // Overwrite with null to handle delete
    if (source === null) {
      target = null;
      return target;
    }

    // Skip undefined sources
    if (!source) continue;

    // TODO: ensure this is an object
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        // Handle arrays separately to avoid treating them as plain objects
        if (Array.isArray(sourceValue)) {
          target[key] = [...sourceValue];
          // target[key] = Array.isArray(targetValue)
          //   ? [...targetValue, ...sourceValue]
          //   : [...sourceValue];
          continue;
        }

        // If both values are objects, merge them recursively
        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          target[key] = deepObjectAssign({}, targetValue, sourceValue);
          continue;
        }

        // For all other cases, simply assign the source value
        target[key] = sourceValue;
      }
    }
  }

  return target;
}
