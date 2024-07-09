function isPatternWildcard(match: any): match is string {
  return typeof match === 'string' && match.startsWith('$');
}

export function matchPattern(
  pattern: Record<string, any>,
  value: Record<string, any>
) {
  const wildcardValues: Record<string, any> = {};
  for (const key in pattern) {
    const matcher = pattern[key];
    const matchValue = value[key];

    // If the key is not present in the value, the pattern does not match
    if (matchValue === undefined) return undefined;

    // If the matcher is an object, we need to recursively match the nested object
    if (typeof matcher === 'object') {
      const nestedWildcards = matchPattern(matcher, matchValue);
      if (nestedWildcards === undefined) {
        return undefined;
      }
      Object.assign(wildcardValues, nestedWildcards);
      continue;
    }

    // If the matcher is a wildcard, we assign the value to the key
    if (isPatternWildcard(matcher)) {
      const assignment = matcher.slice(1);
      wildcardValues[assignment] = matchValue;
      continue;
    }

    // If the value does not match the pattern, the pattern does not match
    if (matcher !== matchValue) {
      return undefined;
    }
  }
  return wildcardValues;
}
