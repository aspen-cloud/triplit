import { getRolesFromSession } from '@triplit/db';

export type ConsoleSessionRole = NonNullable<
  ReturnType<typeof getRolesFromSession>
>[number];
