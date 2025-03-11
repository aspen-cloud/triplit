import { getRolesFromSession } from '@triplit/entity-db';

export type ConsoleSessionRole = NonNullable<
  ReturnType<typeof getRolesFromSession>
>[number];
