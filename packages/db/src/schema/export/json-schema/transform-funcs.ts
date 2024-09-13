export function transformDate(object: any) {
  if (object.type === 'date') {
    object.type = 'string';
    object.format = 'date-time';
  }
  return object;
}

export function transformRecord(object: any) {
  if (object.type === 'record') {
    object.type = 'object';
  }
  return object;
}

export function transformSet(object: any) {
  if (object.type === 'set') {
    object.type = 'array';
    object.uniqueItems = true;
  }
  return object;
}

export function deleteRelationFields(
  object: any,
  overlyingObj: { [key: string]: any } = {},
  currentObjKey = ''
) {
  if ('cardinality' in object) {
    // since we can't do object = undefined as it would only change the ref
    if (overlyingObj) delete overlyingObj[currentObjKey];
  }

  return object;
}

export function transformOptions(object: any, overlyingObj?: any) {
  if (object.options == null) return object;

  transformNullable(object);
  transformDefault(object);
  transformEnum(object);

  delete object.options;
  return object;
}

function transformNullable(object: any) {
  if (object?.options?.nullable === true) {
    // nullable values are indicated as type: ["null"] in JSON schema
    if (Array.isArray(object.type) === false) {
      object.type = [object.type, 'null'];
    } else {
      // normally triplit's schema should just be a string, but
      // just in case it changes to allow array of types
      object.type.push('null');
    }
  }
}

function transformDefault(object: any) {
// if (object?.options?.default != null) {
    // we set the default, though JSON Schema notes that it should be
    // only used for documentation / example values, not as form default
    if (typeof object?.options?.default !== 'function') {
      object.default = object.options.default;
          }

    if (object?.options?.default?.func != null) {
      // Handle triplit's special cases: 'now' and 'uuid'
      object.default = object.options.default.func;
      }
// }
}

function transformEnum(object: any) {
  if (object?.options?.enum != null) {
    object.enum = object?.options?.enum;
  }
}

export function transformPropertiesOptionalToRequired(object: any) {
  // To indicate optional fields, triplit uses an optional array, while
  // JSON schema uses the inverse concept and uses a "required" array field

  if (object.properties != null) {
    const allKeys = Object.keys(object.properties);
    const triplitOptionalKeys = object?.optional ?? [];

    const diff = allKeys.filter((item) => !triplitOptionalKeys?.includes(item));

    // object.required = structuredClone(diff);
    if (diff.length > 0) {
      object.required = structuredClone(diff);
    }

    delete object?.optional;
  }

  return object;
}
