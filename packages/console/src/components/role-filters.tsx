import { TriplitClient } from '@triplit/client';
import {
  CollectionPermissions,
  QueryWhere,
  type PermissionOperations,
  replaceVariablesInFilterStatements,
  type FilterGroup,
  type FilterStatement,
  isFilterGroup,
  isFilterStatement,
  isBooleanFilter,
  isValueVariable,
  replaceVariable,
} from '@triplit/db';
import { IdCard } from 'lucide-react';
import { Code, Tooltip, cn } from '@triplit/ui';
import { ConsoleSessionRole } from 'src/utils/roles.js';

type ConsoleSessionRoleWithFilter = ConsoleSessionRole & {
  filter: QueryWhere<any, any>;
};

export function RoleFilters({
  client,
  permissions,
  rule,
}: {
  client: TriplitClient;
  permissions: CollectionPermissions<any, any>;
  rule: PermissionOperations;
}) {
  const roles = client.db.sessionRoles ?? [];
  console.log({ roles, permissions });
  const flatRoles: ConsoleSessionRoleWithFilter[] = roles.reduce(
    (prev, role) => {
      const roleFilterForRule = permissions[role.key]?.[rule]?.filter;
      // roles that don't have rules for a specific action are implicitly disallowed
      if (!roleFilterForRule) {
        return prev;
      }
      return [...prev, { ...role, filter: roleFilterForRule }];
    },
    [] as ConsoleSessionRoleWithFilter[]
  );
  const flatRolesWithVariablesReplaced: ConsoleSessionRoleWithFilter[] =
    flatRoles.map((roleWithFilter) => {
      const { filter, ...role } = roleWithFilter;
      if (!filter) {
        return roleWithFilter;
      }
      let filterStatements = filter;
      // try {
      //   filterStatements = replaceVariablesInFilterStatements(filter, {
      //     ...client.db.systemVars,
      //     role: roleWithFilter.roleVars,
      //   });
      // } catch (e) {
      //   console.error(e);
      // }
      return {
        ...role,
        roleVars: { role: role.roleVars, ...client.db.systemVars },
        filter: filterStatements,
      };
    });
  if (flatRoles.length === 0) {
    return null;
  }
  return (
    <div
      className={
        'flex flex-col text-xs gap-3 text-yellow-600 dark:text-yellow-400 pt-3'
      }
    >
      {/* <div className="flex flex-row gap-1.5 items-center">
        <Tooltip
          label={
            <div className="text-yellow-400">
              The entity must satisfy the filters below for the client's{' '}
              <span className="font-bold">{rule}</span> to succeed.
            </div>
          }
        >
          <Lock size={14} />
        </Tooltip>
        <span className="font-bold">{rule}</span> permissions
      </div> */}
      {flatRolesWithVariablesReplaced.map((role) => (
        <div className="relative pt-4 mt-2 border-t " key={role.key}>
          <div className="absolute -top-3 bg-card pr-2 text-sm">
            <span className="font-bold">{role.key}</span>{' '}
            <span className="text-muted-foreground">{rule} permissions</span>
          </div>
          <Array filters={role.filter} vars={role.roleVars} />
        </div>
      ))}
    </div>
  );
}

function Group({ filter, vars }: { filter: FilterGroup<any, any>; vars: any }) {
  return (
    <div className="flex flex-row gap-2 items-center bg-muted rounded border-muted border-[3px] overflow-hidden">
      <div className="pl-2 italic">{filter.mod}</div>
      <div className="bg-card rounded p-2">
        <Array filters={filter.filters} vars={vars} />
      </div>
    </div>
  );
}

function Statement({
  filter,
  vars,
}: {
  filter: FilterStatement<any, any>;
  vars: any;
}) {
  const filterValueIsVariable = isValueVariable(filter[2]);
  let replacedVariable = undefined;
  if (filterValueIsVariable) {
    try {
      replacedVariable = replaceVariable(filter[2], vars);
    } catch (e) {
      console.error(e);
    }
  }
  const shouldShowTooltip =
    filterValueIsVariable && replacedVariable !== undefined;
  return (
    <Code className="flex flex-row gap-2 text-xs font-normal">
      <span>{filter[0]}</span>
      <span>{filter[1]}</span>
      {shouldShowTooltip ? (
        <Tooltip
          label={<JSONCodeBlock json={replacedVariable} />}
          hidden={!filterValueIsVariable}
        >
          <span
            className={
              'text-blue-500 hover:bg-blue-200 dark:hover:bg-blue-900 '
            }
          >
            {String(filter[2])}
          </span>
        </Tooltip>
      ) : (
        <span>{String(filter[2])}</span>
      )}
    </Code>
  );
}

function Singleton({ filter }: { filter: boolean }) {
  return <Code className="font-normal text-xs">{String(filter)}</Code>;
}

function Array({
  filters,
  vars,
}: {
  filters: QueryWhere<any, any>;
  vars: any;
}) {
  return (
    <div className="flex flex-col gap-2 items-start">
      {filters.map((filter, i) => {
        if (isFilterGroup(filter)) {
          return <Group key={i} vars={vars} filter={filter} />;
        }
        if (isFilterStatement(filter)) {
          return <Statement key={i} vars={vars} filter={filter} />;
        }
        if (isBooleanFilter(filter)) {
          return <Singleton key={i} filter={filter} />;
        }
        return <Array key={i} vars={vars} filters={filter} />;
      })}
    </div>
  );
}

export function RoleCard({ role }: { role: ConsoleSessionRole }) {
  return (
    <Tooltip label={<JSONCodeBlock json={role.roleVars} />}>
      <div className="py-1 flex flex-col items-center px-2 w-max rounded text-xs bg-secondary text-secondary-foreground">
        <IdCard size={20} />
        {role.key}
      </div>
    </Tooltip>
  );
}

function JSONCodeBlock({ json }: { json: any }) {
  return (
    <pre className="font-mono text-xs">
      {JSON.stringify(json, null, 2).replace(
        /^[\t ]*"[^:\n\r]+(?<!\\)":/gm,
        function (match) {
          return match.replace(/"/g, '');
        }
      )}
    </pre>
  );
}
