export function transformObjectDeeply(
  object: any,
  transformFunction: Function,
  overlyingObj = {},
  currentObjKey = ''
) {
  // guard
  if (!object) return;
  if (typeof object !== 'object') return;

  // NOTE: we cant iterate over all keys and apply transformations
  // since this will miss keys with transforms that mutate keys (eg omitRelationship deltes keys)
  // instead, we must one transform after another to the whole object
  transformFunction.apply(null, [object, overlyingObj, currentObjKey]);

  if (object) {
    // Recursively apply to sub nodes
    for (const key in object) {
      // go a level deeper
      transformObjectDeeply(object[key], transformFunction, object, key);
    }
  }

  return object;
}
