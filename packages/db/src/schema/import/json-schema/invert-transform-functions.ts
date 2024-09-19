import { JSONSchema7 } from 'json-schema';
import { tranformKeysRequirementsContext } from '../../export/json-schema/transform-funcs';

/**
 * @param object the (sub)object transforms are applied to
 * @param useJsonSchemaDefault whether the jsonSchema's default value should be used to fill in default - jsonSchema's default is per spec only meant to be used for examples in doc generation, but might be used otherwise depending on generator
 **/
export function invertTransformations(
  object: JSONSchema7,
  useJsonSchemaDefault = true
): any {
  let result: any = { ...object };
  // const omittedConstraints: omittedConstraints = [];

  result = checkJsonDataCompatibility(result);
  result = omitConstraints(result);

  result = transform(result, useJsonSchemaDefault);

  if (result.properties) {
    for (const [key, value] of Object.entries(result.properties)) {
      result.properties[key] = invertTransformations(value as JSONSchema7);
    }
  }

  // Remove any undefined properties
  Object.keys(result).forEach(
    (key) => result[key] === undefined && delete result[key]
  );

  return result;
}

function checkJsonDataCompatibility(result: any) {
  result = checkDateFormats(result);
  result = checkConst(result);
  result = checkObjectHasProperties(result);
  result = checkCombinations(result);
  result = checkArray(result);
  result = checkRef(result);

  return result;
}

function omitConstraints(
  result: any,
  omittedConstraints: omittedConstraints = []
) {
  result = checkPropPatternsAndDependencies(result);
  result = checkStringConstraints(result);
  result = checkNumberConstraints(result);
  result = checkArrayConstraints(result);
  result = checkObjectConstraints(result);
  result = checkConditionals(result);

  return result;
}

function transform(result: any, useJsonSchemaDefault = true) {
  // order is significant !
  result = transformInteger(result);
  result = transformNull(result);
  result = invertTransformRecord(result);
  result = invertTransformSet(result);
  result = invertTransformOptions(result, useJsonSchemaDefault);
  result = invertTransformDate(result);
  result = transformPropertiesRequiredToOptional(result);
  result = handleIdKey(result);

  return result;
}

// ========================================================================
// Throw Error Heuristic
// errors are only thrown if there's no type counterpart in triplit

// We only throw error if we can't convert the type to a data type in triplit
// as long as it's only validation rules/constraints, they are simply removed
// ========================================================================

export function checkDateFormats(object: any): any {
  if (object.format === 'time' || object.format === 'duration') {
    throw new Error(
      'date formats "time" and "duration" are not supported by Triplit - please remove them from your JSON data'
    );
  }
  return object;
}

export function checkArray(object: any): any {
  if (object.type !== 'array') return object;

  if (object.uniqueItems !== true) {
    throw new Error(
      'Only array types with uniqueItems = true are supported, since Triplit only yet supports set type'
    );
  }

  if (
    Array.isArray(object.items) === true ||
    object.items.type === 'object' ||
    object.unevaluatedItems != null ||
    object.prefixItems != null
  ) {
    throw new Error(
      "Arrays that hold objects or tuples are not supported, as Triplit's Set can only have primitives - please remove them from your JSON data"
    );
  }

  return object;
}

export function checkObjectHasProperties(object: any): any {
  if (object.type === 'object' && object.properties == null) {
    throw new Error(
      'each type object requires a properties field for Triplit Schema to process it'
    );
  }
  return object;
}

export function checkConst(object: any): any {
  if (object.type != null && object.const != null) {
    throw new Error(
      'const type is not supported by Triplit - please remove them from your JSON data'
    );
  }
  return object;
}

// ========================================================================
// Constraints deletion
// constraints are simply removed since we assume they are enforced by
// application logic using the jsonSchema in a validator
// ========================================================================

type omittedConstraints = { name: string; object: string; desc: string }[];

export function checkRef(object: any): any {
  if (object.$ref) {
    throw new Error(
      "'$ref' are not supported by Triplit - please remove them from your JSON data"
    );
  }

  return object;
}

function omitProperties(
  object: any,
  propertiesToDelete: string[],
  // omittedConstraints: omittedConstraints,
  desc: string
) {
  // omittedConstraints.push({
  //   name: String(property),
  //   object: JSON.stringify(object),
  //   desc: desc,
  // });
  for (const property of propertiesToDelete) {
    delete object[property];
  }
  console.warn(
    `'omittedConstraints:'
    ${propertiesToDelete.join(', ')}
    in
    ${JSON.stringify(object)}
    \n ${desc}`
  );
  // console.warn(
  //   `Constraints/Validation rules that are not natively supported on Triplit's db schema have been omited.
  //   As long as you use the jsonSchema to enforce the schema in your application code, this should not be an issue.
  //   You can check the omitted constraints in the 'omittedConstraints' return field.`
  // );
}

export function checkStringConstraints(object: any): any {
  if (object.type !== 'string') return object;

  if (
    object.maxLength != null ||
    object.minLength != null ||
    object.pattern != null
  ) {
    // throw new Error(
    //   'JSON string constraints (" 6.3. Validation Keywords for Strings ") are not supported by Triplit - please remove them from your JSON data'
    // );
    omitProperties(
      object,
      ['maxLength', 'minLength', 'pattern'],
      'JSON string constraints (" 6.3. Validation Keywords for Strings ") are not supported by Triplit - please remove them from your JSON data'
    );
  }
  return object;
}

export function checkNumberConstraints(object: any): any {
  if (object.type !== 'number' && object.type !== 'integer') return object;

  if (
    object.multipleOf != null ||
    object.maximum != null ||
    object.exclusiveMaximum != null ||
    object.minimum != null ||
    object.exclusiveMinimum != null
  ) {
    // throw new Error(
    //   'JSON number constraints ("6.2. Validation Keywords for Numeric Instances (number and integer)") are not supported by Triplit - please remove them from your JSON data'
    // );

    omitProperties(
      object,
      [
        'multipleOf',
        'maximum',
        'exclusiveMaximum',
        'minimum',
        'exclusiveMinimum',
      ],
      'JSON number constraints ("6.2. Validation Keywords for Numeric Instances (number and integer)") are not supported by Triplit - please remove them from your JSON data'
    );
  }
  return object;
}

export function checkArrayConstraints(object: any): any {
  if (object.type !== 'array') return object;

  if (
    object.maxItems != null ||
    object.minItems != null ||
    object.contains != null ||
    object.maxContains != null
  ) {
    // throw new Error(
    //   'JSON array constraints ("6.4. Validation Keywords for Arrays") are not supported by Triplit - please remove them from your JSON data'
    // );
    omitProperties(
      object,
      ['maxItems', 'minItems', 'contains', 'maxContains'],
      'JSON array constraints ("6.4. Validation Keywords for Arrays") are not supported by Triplit - please remove them from your JSON data'
    );
  }

  return object;
}

export function checkObjectConstraints(object: any): any {
  if (object.type !== 'object') return object;

  if (
    object.minProperties != null ||
    object.maxProperties != null ||
    object.dependentRequired != null ||
    object.dependentSchemas != null
  ) {
    omitProperties(
      object,
      [
        'minProperties',
        'maxProperties',
        'dependentRequired',
        'dependentSchemas',
      ],
      'JSON object constraints ("6.5. Validation Keywords for Objects") are not supported by Triplit - please remove them from your JSON data'
    );
    // throw new Error(
    //   'JSON object constraints ("6.5. Validation Keywords for Objects") are not supported by Triplit - please remove them from your JSON data'
    // );
  }
  return object;
}

export function checkPropPatternsAndDependencies(object: any): any {
  if (object.type !== 'object') return object;

  if (object.patternProperties) {
    omitProperties(
      object,
      ['patternProperties'],
      "'patternProperties' are not supported by Triplit - please remove them from your JSON data"
    );
    // throw new Error(
    //   "'patternProperties' are not supported by Triplit - please remove them from your JSON data"
    // );
  }

  if (object.dependencies) {
    omitProperties(
      object,
      ['dependencies'],
      "'dependencies' are not supported by Triplit - please remove them from your JSON data"
    );
  }

  return object;
}

export function checkConditionals(object: any): any {
  if (
    (object.if && object?.if?.type == null) ||
    (object.then && object?.then?.type == null) ||
    (object.else && object?.else?.type == null)
  ) {
    omitProperties(
      object,
      ['if', 'then', 'else'],
      "Conditionals like 'if / then / else' are not supported by Triplit - please remove them from your JSON data"
    );

    // throw new Error(
    //   "Conditionals like 'if / then / else' are not supported by Triplit - please remove them from your JSON data"
    // );
  }

  return object;
}

export function checkCombinations(object: any): any {
  if (
    (object.allOf && Array.isArray(object.allOf)) ||
    (object.anyOf && Array.isArray(object.anyOf)) ||
    (object.oneOf && Array.isArray(object.oneOf)) ||
    (object.not && Array.isArray(object.not))
  ) {
    throw new Error(
      "Combinations like 'allOf / anyOf / oneOf / not' are not supported by Triplit - please remove them from your JSON data"
    );
  }

  return object;
}

// ========================================================================
// Transform functions
// ========================================================================

export function handleIdKey(object: any): any {
  // transform to the format that triplit uses for id keys
  // only way to detect it on this object level
  if (object?.options?.default?.func === 'uuid') {
    object.options.nullable = false;
    // object.options = {
    //   default: {
    //     func: 'uuid',
    //     args: null,
    //   },
    //   nullable: false,
    // };
  }

  return object;
}

export function transformNull(object: any): any {
  if (object.type === 'null') {
    return {
      ...object,
      type: 'string',
      options: { nullable: true, default: null },
    };
  }
  return object;
}

export function invertTransformDate(object: any): any {
  if (object.format === 'date-time' || object.format === 'date') {
    // format is enough, no need to check for:
    // object.type === 'string' && object.type.includes("string")
    // (if nullable will be ['string','null'])
    const { format, type, ...rest } = object;

    return { ...rest, type: 'date' };
  }
  return object;
}

export function transformInteger(object: any): any {
  if (object?.items?.type === 'integer') {
    object.items.type = 'number';
  }
  if (object.type === 'integer') {
    return { ...object, type: 'number' };
  }
  return object;
}

export function invertTransformRecord(object: any): any {
  if (object.type === 'object') {
    return { ...object, type: 'record' };
  }
  return object;
}

export function invertTransformSet(object: any): any {
  if (
    object.uniqueItems === true &&
    (object.type === 'array' || object.type.includes('array'))
  ) {
    // const { uniqueItems, ...rest } = object;
    const isDateItems = object?.items?.format === 'date-time';
    const itemsType = isDateItems ? 'date' : object?.items?.type;
    const itemOptions = Object.create({});
    const itemEnums = object?.items?.enum;

    const isNullable = object.type.includes('null');

    delete object.uniqueItems;

    // populate object
    object.type = 'set';
    // options always present on triplit set
    if (!object.options) {
      object.options = {};

      if (isNullable) {
        object.options.nullable = isNullable;
      }
    }

    handleDefault(object.items, itemOptions, true);

    // move enums
    if (itemEnums) {
      itemOptions.enum = itemEnums;
    }

    object.items = { type: itemsType ?? '', options: { ...itemOptions } };
    // const result = { ...rest, type: 'set' };
  }
  return object;
}

interface SchemaObject {
  type: string | string[];
  default?: any;
  enum?: any[];
  options?: any;
}

interface OptionsObject {
  nullable?: boolean;
  default?: any;
  enum?: any[];
}

export function invertTransformOptions(
  object: SchemaObject,
  useJsonSchemaDefault = true
): SchemaObject {
  const result: SchemaObject = { ...object };
  const options: OptionsObject = { ...result.options };

  handleNullableType(result, options);
  handleDefault(result, options, useJsonSchemaDefault);
  handleEnum(result, options);

  // fill options
  // triplit object primitives have always an options obj present, even if empty
  // but record types have not
  result.options =
    Object.keys(options).length > 0 || result.type !== 'record'
      ? options
      : undefined;

  return result;
}

function handleNullableType(
  result: SchemaObject,
  options: OptionsObject
): void {
  if (Array.isArray(result.type) && result.type.includes('null')) {
    options.nullable = true;
    result.type = result.type.filter((t: string) => t !== 'null')[0];
  }
}

function handleDefault(
  result: SchemaObject,
  options: OptionsObject,
  useJsonSchemaDefault: boolean
): void {
  if (result.default != null) {
    if (useJsonSchemaDefault) {
      options.default = result.default;
    }
    // overwrite if special condition
    if (options.default === 'uuid' || options.default === 'now') {
      options.default = {
        func: result.default,
        args: null,
      };
    }

    delete result.default;
  }
}

function handleEnum(result: SchemaObject, options: OptionsObject): void {
  if (result.enum != null) {
    options.enum = result.enum;
    delete result.enum;
  }
}

export function transformPropertiesRequiredToOptional(object: any) {
  // To indicate optional fields, triplit uses an optional array, while
  // JSON schema uses the inverse concept and uses a "required" array field
  return tranformKeysRequirementsContext(object, 'required', 'optional');
}
