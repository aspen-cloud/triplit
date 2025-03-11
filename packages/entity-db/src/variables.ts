import { SessionVariableNotFoundError } from './errors.js';
import { ValuePointer } from './utils/value-pointer.js';

const VARIABLE_SCOPES = new Set(['$global', '$session', '$role', '$query']);

type VariableComponents = [scope: string | number | undefined, ...string[]];

// TODO: properly integrate this
// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
type QueryValue =
  | number
  | string
  | boolean
  | Date
  | null
  | number[]
  | boolean[]
  | string[]
  | Date[];

export function isValueVariable(value: QueryValue): value is string {
  return typeof value === 'string' && value[0] === '$';
}

// TODO: check variable[0] === '$'?
export function getVariableComponents(variable: string): VariableComponents {
  const components = variable.split('.') as VariableComponents;
  if (components.length < 1) throw new Error(`Invalid variable: ${variable}`);

  // if the variable has only one component, we assume it's a non-scoped variable
  if (components.length === 1) {
    components.unshift(undefined);
    components[1] = components[1].slice(1); // remove the '$'
    return components;
  }

  // For backwards compatability, we allow non-scoped variables
  const parsedScope = parseVarScope(components[0] as string);
  if (parsedScope === undefined) {
    components.unshift(undefined);
    components[1] = components[1].slice(1); // remove the '$'
    return components;
  } else {
    components[0] = parsedScope;
    return components;
  }
}

function parseVarScope(scope: string): string | number | undefined {
  if (VARIABLE_SCOPES.has(scope)) return scope;
  const numParsed = parseInt(scope.slice(1), 10);
  if (!isNaN(numParsed)) return numParsed;
  return undefined;
}

export function varScopeType(scope: string): string {
  if (!isNaN(parseInt(scope))) return 'relational';
  return scope;
}

export function isVariableScopeRelational(
  scope: string | number | undefined
): scope is number {
  return typeof scope === 'number';
}

/**
 * Given a variable, if the variable is referential, increment the scope by 1, otherwise return the variable unchanged.
 */
export function safeIncrementSubqueryVar(varName: string) {
  if (!isValueVariable(varName))
    throw new Error('Cannot increment non-value variable: ' + varName);

  const components = getVariableComponents(varName);
  const scope = components[0];
  if (isVariableScopeRelational(scope)) {
    return `$${scope + 1}.${components.slice(1).join('.')}`;
  }
  return varName;
}

export function replaceVariable(value: string, variables: Record<string, any>) {
  const components = getVariableComponents(value);
  let scope = components[0];
  // If the variable is not scoped, assume it is a relational variable referring to parent
  if (scope === undefined) {
    components[0] = 1;
    scope = components[0];
    return '$' + components.join('.');
  }
  if (!isVariableScopeRelational(scope)) {
    const variable = ValuePointer.Get(variables, components as string[]);
    if (variable === undefined) {
      throw new SessionVariableNotFoundError(value, scope, variables[scope]);
    }
    return variable;
  }
}
