import { ImportServerFormValues } from 'src/components/import-server-form.js';
import { JWTPayloadIsOfCorrectForm } from './remote-helpers.js';
import { consoleClient } from 'triplit/client.js';
import { TriplitClient } from '@triplit/client';
import { DBTransaction } from '@triplit/db/src/db-transaction.js';
import { schema } from 'triplit/schema.js';

export function addServiceToken(
  clientTx: TriplitClient<typeof schema> | DBTransaction<typeof schema>,
  serverUrl: string,
  token: string
) {
  return clientTx.insert('tokens', {
    id: 'service_' + serverUrl,
    name: 'Service token',
    value: token,
    serverUrl,
  });
}

export async function addServerToConsole(formValues: ImportServerFormValues) {
  const { displayName, serviceToken, serverUrl: server } = formValues;
  try {
    const host = new URL(server).host;

    await consoleClient.transact(async (tx) => {
      await Promise.all([
        tx.insert('servers', {
          displayName,
          url: server,
          id: host,
        }),
        addServiceToken(tx, server, serviceToken),
      ]);
    });
    return host;
  } catch (e) {
    console.error(e);
    throw new Error(
      "Failed to read token. Please make sure you've entered a valid token."
    );
  }
}

export const DEFAULT_HOST = 'localhost:6543';
const DEFAULT_SERVER_NAME = 'dev-server';
const DEFAULT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoibG9jYWwtcHJvamVjdC1pZCJ9.8Z76XXPc9esdlZb2b7NDC7IVajNXKc4eVcPsO7Ve0ug';

export async function initializeFromUrl() {
  if (typeof window === 'undefined') return null;
  let token,
    server,
    projName = null;
  const url = new URL(window.location.href);
  const isLocalRoute = url.pathname === '/local';

  if (isLocalRoute) {
    token = DEFAULT_TOKEN;
    server = 'http://' + DEFAULT_HOST;
    projName = DEFAULT_SERVER_NAME;
  } else {
    const params = new URLSearchParams(url.search);
    token = params.get('token');
    if (token === 'null') token = null;
    if (!(token && JWTPayloadIsOfCorrectForm(token))) return null;
    server = params.get('server');
    if (!server) return null;
    projName = params.get('projName');
  }
  const serverHost = await addServerToConsole({
    serverUrl: server,
    serviceToken: token,
    displayName: projName ?? 'triplit-project',
  });

  return serverHost;
}
