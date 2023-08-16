import { request } from './utils/request';
import { parseJWT } from './utils/token';

interface MigrationStatus {
  version?: number;
  type: 'schemaless' | 'schema';
}

export type StatusCommandArgs = {
  token: string;
};

export async function statusCommand(args: StatusCommandArgs) {
  console.info('Getting migration status from remote...');
  const { data: status, error } = await readRemoteMigrationStatus(args.token);
  if (error) {
    console.error(error);
    return;
  }
  if (!status) {
    console.error('Could not read migration status from server');
    return;
  }
  console.log(status);
}

export async function readRemoteMigrationStatus(token: string): Promise<{
  data?: MigrationStatus;
  error?: any;
}> {
  try {
    const payload = parseJWT(token);
    const projectId = payload?.['x-triplit-project-id'];
    if (!projectId) {
      return {
        data: undefined,
        error: 'Could not find project ID in token',
      };
    }
    const res = await request(
      `http://${projectId}.localhost:8787/migration/status`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) {
      return {
        data: undefined,
        error: `Error getting migration version from remote. ${await res.text()}`,
      };
    }
    const status = (await res.json()) as MigrationStatus;
    return { data: status, error: undefined };
  } catch (e) {
    return {
      data: undefined,
      error: e,
    };
  }
}
